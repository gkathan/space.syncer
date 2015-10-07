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
var https = require('https');

var port = config.server.port;
var portssl = config.server.portSSL;

var server = http.createServer(function(req,res){
  res.writeHead(200, {'Content-Type': 'application/json'});

  res.write(JSON.stringify(config.sync));
  res.end();
});
server.listen(config.server.port);


/**
* SSL certificates
*/
var fs = require('fs');
var privateKey = fs.readFileSync('config/sslcert/server.key');
var certificate = fs.readFileSync('config/sslcert/server.crt');
var ca = fs.readFileSync('config/sslcert/ca.crt');
var credentials = {key: privateKey, cert: certificate,ca:ca,requestCert:true,rejectUnauthorized: false};


var server_https = https.createServer(credentials,function(req,res){

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Request-Method', '*');
	res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
	res.setHeader('Access-Control-Allow-Headers', '*');

  res.write(JSON.stringify(config.sync));
  res.end();
});

server_https.listen(config.server.portSSL);


//var sockets=[];

var io = require('socket.io')(server_https);

io.on('connection', function (socket) {


    logger.debug('[s p a c e syncer|server socket.io] says: new user connected!');
    socket.emit("message","[s p a c e.syncer] says: hello :-)");


    socket.on('forceSync',function(message){
      logger.debug("[s p a c e syncer|server socket.io] says: someone sent a forceSync message - syncer: "+message.syncer);
      var _syncer = message.syncer;
      var _url = config.sync[_syncer].url;
      var _type = "manual - forced"
      switch(_syncer){
        case "v1epics":
          v1EpicSyncService.sync(_url,_type,io,function(err,result){
            if (!err) logger.debug("successful: "+_syncer);
          });
          break;
        case "v1data":
          v1DataSyncService.sync(_url,_type,io,function(err,result){
            if (!err) logger.debug("successful: "+_syncer);
          });
          break;
        case "availability":
          avSyncService.sync(_url,_type,io,function(err,result){
            if (!err) logger.debug("successful: "+_syncer);
          });
          break;
        case "incidents":
          incidentSyncService.sync(_url,_type,io,function(err,result){
            if (!err) logger.debug("successful: "+_syncer);
          });
          break;
        case "problems":
          problemSyncService.sync(_url,_type,io,function(err,result){
            if (!err) logger.debug("successful: "+_syncer);
          });
          break;
        case "soc_outages":
          soc_outagesSyncService.sync(_url,_type,io,function(err,result){
            if (!err) logger.debug("successful: "+_syncer);
          });
          break;
        case "soc_services":
          soc_servicesSyncService.sync("soc_services",_url,_type,io,function(err,result){
            if (!err) logger.debug("successful: "+_syncer);
          });
          break;
      }
    })

    socket.on('message',function(message){
      logger.debug("[s p a c e syncer|server socket.io] says: someone sent a MESSAGE message : ");
    })

    socket.on('disconnect',function(){
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
