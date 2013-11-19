spiderest
=========

RESTful API spider/crawler for Node.

##Theory of operation
This program will search the body of HTTP responses for fields called `href`, and push the values
onto a queue of URL's to get next. Once an href has been fetched, it is stored in Redis with the key
being the href string, and the value being the body of the response from getting that href. If we
get to an href that we have seen before (by checking redis for the key) we just skip it, to prevent endless loops.

In order to be successful in reaching all the corners of your api, you'll want to start the spider off at a base URL that has href's to some
major resources that will allow us to [find our way](http://en.wikipedia.org/wiki/HATEOAS) through the API.

##Usage
```bash
$ spiderest.js [options]
```

The program looks to connect to a locally running Redis server, on the default ports, with no authentication.

Available options:
 - `--url` required. tells the spider where to start crawling from.
 - `--user` specify for http basic authentication, username.
 - `--pass` specify for http basic authentication, secret.
 - `--concurrency` number of simultaneous HTTP requests to make. default is 5.
 - `--out` filename of where the json will be written to. Will truncate the file. default is `dump-<timestamp>.json`.

##Todo List:
 - [X] Support pagination ('offset' and 'limit' to start).
 - [ ] Make redis url configurable.
 - [ ] Make the 'href' keyword configurable.
 - [ ] option to flush redis at the start.
 - [ ] option to set the limit for pagination.
