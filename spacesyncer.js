var winston = require('winston');

var config = require('config');

// logger

var _loggerconfig;
if (config.env=="PRODUCTION") _loggerconfig = config.logger.production;
else _loggerconfig = config.logger.dev;

winston.loggers.add('space.syncer_log',_loggerconfig);
var logger = winston.loggers.get('space.syncer_log');





logger.info("[s p a c e syncer]  - server initializes...");

var http = require('http');

    var server = http.createServer(function(req,res){
      res.writeHead(200, {'Content-Type': 'application/json'});

      res.write(JSON.stringify(config.sync));
      res.end();
    });
    server.listen(8001);

var sockets=[];

var io = require('socket.io')(server);




io.sockets.on('connection', function (socket) {
    logger.debug('[s p a c e syncer|server socket.io] says: new user connected!');
    io.emit("message","[s p a c e.syncer] says: hello :-)");
    io.sockets.on('disconnect',function(){
      logger.debug("[s p a c e syncer|server socket.io] says: someone disconnected")
    })
});



// services
var v1EpicSyncService = require('./services/V1EpicSyncService');
v1EpicSyncService.init(io,function(err,result){
    if (err){
      logger.error("error: "+err.message);
    }
    else
    {
      logger.info("init ok: "+result);
    }
});
var v1DataSyncService = require('./services/V1DataSyncService');
v1DataSyncService.init(io,function(err,result){
    if (err){
      logger.error("error: "+err.message);
    }
    else
    {
      logger.info("init ok: "+result);
    }
});

var mockupSyncService = require('./services/MockupSyncService');
mockupSyncService.init(io,function(err,result){
    if (err){
      logger.error("error: "+err.message);
    }
    else
    {
      logger.info("init ok: "+result);
    }
});


var avSyncService = require('./services/AvailabilitySyncService');
avSyncService.init(io,function(err,av){
  if (err) logger.error("[error]: "+err.message);
  else logger.info("[ok]: "+JSON.stringify(av));
});

var incidentSyncService = require('./services/IncidentSyncService');
incidentSyncService.init(io,function(err,result){
  if (err){
    logger.error("[error]: "+err.message);
  }
  else{
    logger.info("IncidentSyncService.init() says: "+result);
  }
});

var soc_outagesSyncService = require('./services/SOCOutagesSyncService');
soc_outagesSyncService.init(io,function(err,data){
    if (err){
        logger.error("error: "+err.message);
    }
    else{
      logger.debug("soc_outagesSyncService.init() says: "+data.length+" items synced");
    }
});

var soc_servicesSyncService = require('./services/GenericSyncService');
soc_servicesSyncService.init(io,"soc_services",function(err, data){
  if (err){
      logger.error("error: "+err.message);
  }
  else{
    logger.debug("soc_servicesSyncService.init() says: "+data.length+" items synced");
  }
});



var problemSyncService = require('./services/ProblemSyncService');
problemSyncService.init(io,function(err,result){
  if (err){
    logger.error("error: "+err.message);
  }
  else
  {
    logger.info("init ok: "+result);
  }
});
/*
var apmSyncService = require('./services/ApmSyncService');
apmSyncService.init(io);
*/

logger.info("[s p a c e snycserver] - initializes DONE..");
