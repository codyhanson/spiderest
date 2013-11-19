#!/usr/bin/env node

var argv = require('optimist')
    .usage('Usage: spiderest.js [OPTIONS]')
    .option('u', {alias: 'url'})
    .option('a', {alias: 'user', default: null})
    .option('p', {alias: 'pass', default: null})
    .option('c', {alias: 'concurrency', default: 5})
    .option('o', {alias: 'out', default: 'dump-' + timestampString() + '.json'})
    .demand('url')
    .argv;
var async = require('async');
var url = require('url');
var fs = require('fs');
var request = require('request');
var redis = require('redis');
var redisClient = redis.createClient();

var concurrency = argv.concurrency; //default to 5 reqs out at a time.
var authhash = argv.user && argv.pass ? {'user': argv.user, 'pass':argv.pass, 'sendImmediately':'true'} : null;

var baseUrlString = argv.url;

var dumpFile = argv.out;
var dumpStarted = false;

/*
TODO
 //    .option('f', {alias: 'flushdb', default: false})
if (argv.flushdb) {
    //flush redis.
    //not sure which command.
    redisClient.flushdb()?
}
*/

/* The get Queue holds hrefs to go get */
var getQueue = async.queue(getUrl, concurrency);

//setup queue.drain?
getQueue.drain =  function() {

    console.log('GET queue drained. waiting for 10 seconds before shutting down.');

    setTimeout(function(){
        if (getQueue.length() == 0) {
            console.log('10 seconds passed with no activity, exporting to file, and  shutting down.');
            if (!dumpStarted) {
                dumpStarted = true;
                dumpDbToFile(dumpFile, function(err){
                    //done writing
                    process.exit();
                });
            }
        } else {
            console.log('Some work came in since drained, not exiting yet.');
        }
    }, 10000);


}


/* the parse queue holds objects to be parsed for hrefs */
//doesn't matter if it has high concurrency
var parseQueue = async.queue(parseForHrefs, 1000); 

//Put the first href into the queue and let it rip.
getQueue.push({href: baseUrlString});


function getUrl(task, callback) {

    //only get this href if it hasn't been stored already.
    redisClient.get(task.href, function(err,reply) {
        if(err){
            console.log(err);
            return callback(err); 
        } else if (reply != null) {
            //we've already gotten this href before.
            console.log('Skipping:' +task.href);
            return callback(); 
        } else {
            //otherwise, this is a new href.
            //Check if we have already visited this href before.
            //if we have, we will return and not do any work.
            console.log('GETTING:' + task.href);
            request( { url: task.href, method: 'GET', qs: task.query, auth : authhash},
                function (error, res, resBody) {
                    if (error){
                        console.log(error);
                        return callback(error); //bail out.
                    }

                    //check status code, should be 200.
                    if (res.statusCode != 200) {
                        console.log('NOT 200 OK. Failed getting:' + 
                            task.href + ' with status:' + res.statusCode );
                        return callback('error with this request:' + task.href);
                    }

                    //submit the object to be 
                    //parsed for hrefs.
                    var parsedBody = JSON.parse(resBody);
                    parseQueue.push(parsedBody);

                    //Check if this is a paginated collection.
                    //pagination fields must be present, and the 'items' array must be filled to the limit.
                    if (parsedBody.offset != null && parsedBody.limit != null && parsedBody.items.length === parsedBody.limit) {
                        //this is a URL that we can get another page of.
                        var urlObj = url.parse(task.href, true);
                        var newOffset = parsedBody.offset + parsedBody.limit;
                        var newQueryParams = {offset:newOffset, limit:parsedBody.limit};
                        //set the new params in the url obj.
                        urlObj.query = newQueryParams;
                        urlObj.search = null; //clear it out so the query gets reset.
                        var hrefNewParams = url.format(urlObj);
                        //get the next page.
                        console.log('new page:' + hrefNewParams);
                        getQueue.push({href: hrefNewParams});
                    }

                    //Store this href.
                    storeResult(task.href,resBody, function() {
                        callback(null); //no errors.
                    });
                }
            );
        }
    });
}

function parseForHrefs(object, callback) {
    //first check if object is even an object.
    if (!(object instanceof Object)) return callback();

    for(attr in object) {
        //is it an href?
        if (attr == 'href') {
            getQueue.push({href:object[attr]});
        } else if (Array.isArray(object[attr])) {
            //is it an array?
            //if so, push the objects that are in the array.
            for (var i = 0; i < object[attr].length; i++){
                parseQueue.push(object[attr][i]);
            }
        } else if (object[attr] instanceof Object) {
            //is it an object?
            //if so, we want to add to the parse queue.
            parseQueue.push(object[attr]);
        }
    }
    //done with this object.
    return callback();
}

function storeResult(key,result,callback) {
    //stuff it in redis.
    redisClient.set(key, result);
    //console.log(result);
    callback();
}

function dumpDbToFile(filename, callback){
    var keys = null;
    var stuffToDump = {};
    async.series([
        function(taskCallback){
            //get all keys.
            redisClient.keys('*', function(err,res){
                keys = res;
                taskCallback();
            });
        },
        function(taskCallback){
            //get all values
            async.each(keys,function(key,itemCb){
                redisClient.get(key,function(err,value){
                    stuffToDump[key] = value;
                    if (err) console.log(err);
                    itemCb(err);
                });
            },
            function(err){
                taskCallback(err);
            });
        },
        function(taskCallback) {
            //write to file.
            console.log('Dumping to file now.');
            fs.writeFile(filename, JSON.stringify(stuffToDump), function(err){
                console.log('finished writing file:' + filename);
                taskCallback(err);
            });
        }
    ],
    function(err,res){
        if (err) console.log(err);
        callback(err);
    });
}


function timestampString() {
    // create a new javascript Date object based on the timestamp
    var date = new Date(Date.now());
    // hours part from the timestamp
    var hours = date.getHours();
    // minutes part from the timestamp
    var minutes = date.getMinutes();
    // seconds part from the timestamp
    var seconds = date.getSeconds();
    // will display time in 10:30:23 format
    var formattedTime = hours + ':' + minutes + ':' + seconds;
    return formattedTime;
}
