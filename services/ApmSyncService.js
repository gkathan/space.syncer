/**
* service which syncs on a scheduled basis problems from snow
**/

var config = require('config');
var schedule = require('node-schedule');
var _ = require('lodash');

var io;

var mongojs = require("mongojs");
var DB="space";
var connection_string = '127.0.0.1:27017/'+DB;
var db = mongojs(connection_string, [DB]);

// logger
var winston = require('winston');
var logger = winston.loggers.get('space_log');


exports.init = function(io,callback){
	this.io=io;
	var rule = new schedule.RecurrenceRule();
	// every 10 minutes
	if (config.sync.apm.login.mode!="off"){
		rule.minute = new schedule.Range(0, 59, config.sync.apm.login.intervalMinutes);
		logger.info("[s p a c e] ApmSyncService init(): "+config.sync.apm.login.intervalMinutes+" minutes - mode: "+config.sync.apm.login.mode);
		var j = schedule.scheduleJob(rule, function(){
			logger.debug('...going to sync Apm LOGIN stuff ....');

			_syncLogin(function(data){
				logger.debug("** [DONE] apmSync ");
			});

		});
	}
}

exports.sync = _syncLogin;

function _syncLogin(done){

	logger.debug("---- in _syncLogin...");
	var _conf = config.sync.apm.login;
	var url = _conf.url+"?"+"metric-path="+_conf.metricPath+_conf.timing+"&output=JSON";


	logger.debug("--------------------------------------- url: "+url);


	var _secret = require("../config/secret.json");

	var options_auth={user:_secret.apmUser, password:_secret.apmPassword, connection:{rejectUnauthorized : false}};
	logger.debug("apmUser: "+_secret.apmUser);

	var Client = require('node-rest-client').Client;
	client = new Client(options_auth);
	client.get(url, function(data, response,callback){
		// parsed response body as js object
		logger.debug("======== syncLogin data:"+JSON.stringify(data));
		// and store it
		var apm_login =  db.collection('apm_login');
		if (data[0]) data[0].snapshotTime=new Date();
		apm_login.insert(data	 , function(err , success){
			//console.log('Response success '+success);
			if(err){
				logger.debug('Response error '+err);
				app.io.emit('syncUpdate', {status:"[ERROR]",from:"apm.login",timestamp:new Date(),info:err.message});

			}
			if(success){
				logger.info("[success] sync apm  ....length: "+data.length);
				app.io.emit('syncUpdate', {status:"[SUCCESS]",from:"apm.login",timestamp:new Date(),info:data.length+" items synced"});

			}
		})
		done(data);

	}).on('error',function(err){
			logger.error('[ApmSyncSerice] says: something went wrong on the request', err.request.options);
			app.io.emit('syncUpdate', {status:"[ERROR]",from:"apm.login",timestamp:new Date(),info:err.message});
		})

}
