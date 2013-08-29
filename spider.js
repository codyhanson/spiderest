#!/usr/bin/env node

var async = require('async');
var request = require('request');

var concurrency = 5;
var authhash = {'user': authUser; 'pass':authPass; 'sendImmediately':'true'};

var baseUrl = '';
var queue = async.queue(getUrl, concurrency);

//setup queue.drain?
queue.drain =  function() {
    console.log('drained');
}

//maintain a hash of the hrefs we have visted, so we don't visit more than once.
//or end up in an infinite loop.
var visited;

//Put the first href into the queue and let it rip.
queue.push({href: baseUrl});


function getUrl(task, callback) {

    //Check if we have already visited this href before.
    //if we have, we will return and not do any work.

    request(
        {
            url: task.href,
            method: 'GET',
            auth : authhash, 
        },
        function (error, res, resBody) {
            if (error){
                callback(error); //bail out.
                return;
            }

            //check status code, should be 200.
            //todo res.status_code;

            //todo, crawl over resBody looking for hrefs.
            

            //todo exclude hrefs that match a regex?

            //add this href to our visited list.
            //todo
            
            //Also, add any embedded hrefs to be visited.
            queue.push({href: resBody.href});

            //todo, pagination over a collection.

            storeResult(resBody, function() {
                
                callback(null); //no errors.
            });
        }
    );
}


function storeResult(result,callback) {

    //todo, write to a file, or a db, or stdout.
    //based on a command line option?
    console.log(result);
    callback();
}
