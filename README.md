cluster-manager
===============

This module is inspired by and partially copied from https://github.com/isaacs/cluster-master.

Installation
------------

```
  npm install git://github.com/daeq/node-cluster-manager
```

Basic usage
------------

```javascript
  var clusterManager = require('cluster-manager'); 
  clusterManager("./app.js");
```
  
This will run 1 worker per CPU executing app.js.

If you send SIGHUP to cluster process, it will gracefully restart workers one by one. 

  kill -HUP <cluster pid>

Reloading stops if newly loaded worker exits with error. In that case previously started workers continue running and nothing bad happens.
Worker is considered successfully started when it starts listening (worker 'listening' event) or when it runs without error for some time (defaults to 5 seconds). You can change this time in config.

Advanced usage
--------------

```javascript
  var clusterManager = require('cluster-manager')
  clusterManager({
    exec: "./app.js",
    size: 8,
    env: {
        NODE_ENV: "production"
    },
    args: ["--id", "5"],
    silent: true,
    gracefullyStopTime: 10000,
    successfullyStartTime: 200,
    onMessage: function(msg) {
        console.log("Received message from worker: ", msg)
    },
    reloadOnHup: true,
    beforeReload: function(callback) {
        // Prepare environment or something
        callback()
    },
    afterReload: function(err) {
        if(err) {
            console.log("Something bad happened while reloading: ", err)
        }
    }  
   })
```
   
Parameters:

* `exec` - path to script which will be executed by workers. Required (passed to cluster.setupMaster)
* `size` - number of workers. Defaults to number of CPU
* `env`  - environment variables which will be passed to workers.
* `args` - command-line arguments which will be passed to workers (passed to cluster.setupMaster)
* `silent` - whether or not worker's output is sent to main process output (passed to cluster.setupMaster)
* `gracefullyStopTime` - time that cluster manager will wait after sending `disconnect` command to worker before killing it
* `successfullyStartTime` - worker will be considered successfully started if it runs this amount of time without exiting
* `onMessage` - messages received from workers will be passed here
* `reloadOnHup` - whether or not reload cluster when SIGHUP received (defaults to true)
* `beforeReload` - if specified, this function is called after SIGHUP received before reload starts. It should call `callback` when ready to reload.
* `afterReload` - if specified, this functin is called after reload is finished. `err` will be set if reload wasn't completed successfully
