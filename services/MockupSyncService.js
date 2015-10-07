/**
* Mockup Syncer
**/

var config = require('config');
var schedule = require('node-schedule');
var _ = require('lodash');

var spaceServices = require('space.services');


// logger
var winston = require('winston');
var logger = winston.loggers.get('space_log');

exports.init = _init;
exports.sync=_sync;

function _init(io,callback){
	name="mockup";
	var rule = new schedule.RecurrenceRule();
	// every 10 minutes
	rule.minute = new schedule.Range(0, 59, config.sync[name].intervalMinutes);
	logger.info("[s p a c e] MockupSyncService for: "+name+" init(): "+config.sync[name].intervalMinutes+" minutes - mode: "+config.sync[name].mode );
	if (config.sync[name].mode!="off"){
		var j = schedule.scheduleJob(rule, function(){
			logger.debug('...going to sync '+name+'  stuff ....');
			var _url = config.sync[name].url;
			var _type = "scheduled - automatic";
			_sync(name,io,callback);
		});
	// and immediatly a sync
		_sync(name,io,callback);
	}
}


/**
* param name: type of collection
* param url: endpoint of REST data API to sync from
* param type: sync type to log (e.g. "API - manual" or "schedule - manual")
* param prepareData: function pointer to map / prepare data before save in local DB
* param callback
*/
function _sync(name,io,callback){

	var syncData={};

	var _syncStatus = spaceServices.SyncService;
	var _syncName = name;
	var _timestamp = new Date();
	var _statusERROR = "[ERROR]";
	var _statusSUCCESS = "[SUCCESS]";


	logger.debug("************************************** SYNC "+name);
				var _message = "mockup sync done";
				logger.info("[MockupSyncSerice] says: sync "+name+" [DONE]");

				var _message = {status:_statusSUCCESS,from:_syncName,timestamp:_timestamp,info:_message,type:"mockup"};
				logger.info("[MockupSyncSerice] emit: "+JSON.stringify(_message));
				io.emit('syncUpdate', _message);

				/*
				var _prio="P120";
				var _incdientFakeMessage={title:"mockup incident",body:"holy shit something went wrong !!!"};
				_incdientFakeMessage.desktop={desktop:true,icon:"/images/incidents/"+_prio+".png"};
				io.emit('message', {msg:_incdientFakeMessage});
				*/

	callback(null,"syncData");

}
