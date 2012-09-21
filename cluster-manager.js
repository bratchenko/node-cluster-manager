var cluster = require("cluster")
, os = require("os")
, path = require("path")
, clusterSize = 0              // Amount of cluster workers
, workerEnv = {}               // Environment variables that will be passed to workers
, gracefullyStopTime = 5000    // Wait 5 seconds for worker to gracefully stop
, successfullyStartTime = 5000 // Worker is successfully started if it runs 2 seconds
, workers = {}                 // Current running workers

module.exports = clusterManager
clusterManager.reload = reload

function debug() {
    console.log.apply(console, arguments)
}

function clusterManager (config) {
    if (typeof config === "string") config = { exec: config }

    if (!config.exec) {
        throw new Error("Must define a 'exec' script")
    }

    if (!cluster.isMaster) {
        throw new Error("Should be run in a cluster master script")
    }

    if (cluster._clusterMaster) {
        throw new Error("This cluster has a master already")
    }

    cluster._clusterMaster = module.exports

    clusterSize = config.size || os.cpus().length

    var masterConf = { 
        exec: path.resolve(config.exec), 
        args: config.args,
        silent: config.silent
    }
    if(config.env) {
        workerEnv = config.env
    }
    if(config.gracefullyStopTime) {
        gracefullyStopTime = Math.max(0, parseInt(config.gracefullyStopTime, 10) )
    }
    if(config.successfulyStartTime) {
        successfulyStartTime = Math.max(0, parseInt(config.successfulyStartTime, 10) ) 
    }

    cluster.setupMaster(masterConf)

    if (config.reloadOnHup !== false) {
        function reloadOnSignal() {
            if(config.beforeReload) {
                config.beforeReload(function() {
                    reload(afterReload)
                })
            } else {
                reload(afterReload)
            }
        }
        function afterReload(err) {
            if(config.afterReload) {
                return config.afterReload(err)
            } else if (err) {
                debug("Reload error: ", err)
            }
        }
        process.on("SIGHUP", reloadOnSignal)
    }

    cluster.on("fork", function(worker) {
        workers[worker.id] = worker
        worker.startTime = new Date().getTime()

        worker.on("exit", function () {
            clearTimeout(worker.gracefullyStopTimer)

            delete workers[worker.id]

            if (worker.suicide) {
                debug("Worker %j exited.", worker.id)                
            } else {
                if (worker.officiallyStarted) {
                    debug("Worker %j exited abnormally. Restarting.", worker.id)
                    //reload workers only if it was runnin enough time
                    startWorker()
                }
            }
        })

        if (config.onMessage) {
            worker.on("message", config.onMessage)
        }

        debug("Worker %j forked.", worker.id)
    })

    for(var i = 0; i < clusterSize; ++i) {
        startWorker()
    }
}

var workersToReload = []     // Current query of workers to reload.
var reloadingWorkerId = null // Keep track of reloading workers to avoid reloading them multiple times.
var reloadCallback = null    // If new reload requested during reload, only last callback will be called.
function reload (callback) {
    for(id in workers) {
        if(reloadingWorkerId != id && workersToReload.indexOf(id) == -1) {
            workersToReload.push(id)
        }
    }
    reloadCallback = callback
    if(!reloadingWorkerId) { 
        reloadNext(function(err){
            return reloadCallback && reloadCallback(err)
        })
    }
}

function startWorker (callback) {
    var worker = cluster.fork(workerEnv)

    var successfullyStarted = function() {
        successfullyStartTimeout = null
        worker.officiallyStarted = true
        debug("Worker %j started.", worker.id)
        return callback && callback(null, worker)
    }

    // If worker is running <successfullyStartTime>ms then it is successfully started
    var successfullyStartTimeout = setTimeout(successfullyStarted, successfullyStartTime)

    // If worker started listening then it is successfully started
    worker.on("listening", function() {
        if(successfullyStartTimeout) {
            clearTimeout(successfullyStartTimeout)
            return successfullyStarted()
        }
    })

    worker.on("exit", function() {
        if(successfullyStartTimeout) {
            clearTimeout(successfullyStartTimeout)
            if(worker.suicide) {
                // If we killed worker while starting - it is counted as successful start
                return callback && callback(null, worker)
            } else {
                return callback && callback(new Error("Worker "+worker.id+" exited too early"), worker)
            }
        }
    })
}

function reloadWorker(worker, callback) {
    if(!worker.officiallyStarted) {
        worker.destroy() // If worker wasn't started yet - kill it without remorse.
    }
    startWorker(function(err) {
        if(err) {
            return callback(err)
        } else {
            stopWorker(worker)
            callback(null)
        }
    })
}

function stopWorker(worker) {
    if(workers[worker.id]) {
        debug("Stopping worker %j.", worker.id)
        worker.gracefullyStopTimer = setTimeout(
            function() {
                worker.destroy()
            }
            , gracefullyStopTime
        )
        worker.disconnect()
        delete workers[worker.id] // As if it doesn't exist anymore
    }
}

function reloadNext(callback) {
    reloadingWorkerId = workersToReload.shift()
    if(reloadingWorkerId) {
        worker = workers[reloadingWorkerId]
        if(worker) {
            reloadWorker(worker, function(err) {
                if(err) {
                    reloadingWorkerId = null
                    return callback(err)
                } else {
                    return reloadNext(callback)
                }
            })
        } else {
            return reloadNext(callback)
        }
    } else {
        return callback && callback()
    }
}