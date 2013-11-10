#!/usr/bin/env node

var argv = require('optimist').argv;
var async = require('async');
var request = require('request');
var redis = require('redis');
var redisClient = redis.createClient();

var concurrency = argv.concurrency;
var authhash = {'user': argv.user, 'pass':argv.pass, 'sendImmediately':'true'};

var baseUrl = argv.url;


/* The get Queue holds hrefs to go get */
var getQueue = async.queue(getUrl, concurrency);

//setup queue.drain?
getQueue.drain =  function() {

    console.log('GET queue drained. waiting for 10 seconds before shutting down.');

    setTimeout(function(){
        if (getQueue.length() == 0) {
            console.log('10 seconds passed with no activity, shutting down.');
            process.exit();
        } else {
            console.log('Some work came in since drained, not exiting yet.');
        }
    }, 10000);


}


/* the parse queue holds objects to be parsed for hrefs */
//doesn't matter if it has high concurrency
var parseQueue = async.queue(parseForHrefs, 1000); 

//Put the first href into the queue and let it rip.
getQueue.push({href: baseUrl});


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
            request( { url: task.href, method: 'GET', auth : authhash},
                function (error, res, resBody) {
                    if (error){
                        console.log(error);
                        return callback(error); //bail out.
                    }

                    //check status code, should be 200.
                    if (res.statusCode != 200) {
                        console.log('NOT 200 OK. Failed getting:' + 
                            task.href + 'with status:' + res.statusCode );
                    }

                    //submit the object to be 
                    //parsed for hrefs.
                    parseQueue.push(JSON.parse(resBody));

                    //todo, pagination over a collection.
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

