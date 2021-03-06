/**
* service which syncs on a scheduled basis with the configured prioity  incidents from snow API
**/
var config = require('config');
var schedule = require('node-schedule');
var _ = require('lodash');
var moment = require('moment');
var jsondiffpatch=require('jsondiffpatch');


var mongojs = require("mongojs");
// logger
var winston = require('winston');
var logger = winston.loggers.get('space_log');

var _syncName = "incidents";

var spaceServices = require('space.services');

var incService = spaceServices.IncidentService;
var incTrackerService = spaceServices.IncidentTrackerService;

var _secret = require("../config/secret.json");
var Client = require('node-rest-client').Client;

exports.init = function(io,callback){
	var rule = new schedule.RecurrenceRule();
	// every 10 minutes
	if (config.sync[_syncName].mode=="on"){
		rule.minute = new schedule.Range(0, 59, config.sync[_syncName].intervalMinutes);
		logger.info("[s p a c e] IncidentSyncService init(): "+config.sync[_syncName].intervalMinutes+" minutes - mode: "+config.sync[_syncName].mode);

		var j = schedule.scheduleJob(rule, function(){
			logger.debug('...going to sync Incident stuff ....');
			var _url = config.sync[_syncName].url;
			var _type = "scheduled - automatic";
			_sync(_url,_type,io,callback);
		});
	}
}

exports.sync = _sync;

function _sync(url,type,io,callback){
	var _syncStatus = spaceServices.SyncService;
	var _timestamp = new Date();
	var _statusERROR = "[ERROR]";
	var _statusSUCCESS = "[SUCCESS]";

	url+="&sysparm_query=priority<="+config.sync[_syncName].includePriority+"^active=true";
	logger.debug("...snow API call url: "+url);
	_getSnowData(url,type,io,function(err,data){
		if (err){
			logger.error("_getSnowData failed: "+err);
			callback(err);
			return;
		}
		// parsed response body as js object
		logger.debug("[_syncIncident]...client.get data..: _url:"+url);
    var _incidentsNEW=[];
		var _incidentsDELTA_CHANGED = [];
    var _incidentsOLD;
		// lets first get what we have had
		incService.findFiltered({active:"true"},{openedAt:-1},function(err,baseline){
			_incidentsOLD = _.clone(baseline,true);
			logger.debug("---------------------- incService.findFiltered({active:true} baseline: "+baseline.length+" incidents")
			incService.findRevenueImpactMapping(function(err,impactMapping){
  			var _incidentsNEWSysIds = _.pluck(data.records,'sys_id');
        var _incidentsOLDSysIds = _.pluck(_incidentsOLD,'sysId');
				var _incidentsDELTASysIds;
				// first we check whether we have more Incdients stored than in the NEW snow snapshot
				_incidentsDELTASysIds = _.difference(_incidentsOLDSysIds,_incidentsNEWSysIds);
				if (_incidentsDELTASysIds.length>0){
					logger.debug("************************  THERE ARE "+_incidentsDELTASysIds.length+" INCIDENTS WHICH NEEDS TO BE C L O S E D   ***********************************");
				}
				_handleClosedIncidents(_incidentsDELTASysIds,type,io,function(err,closedIncidents){
					incidentsNEWSysIds = _.pluck(closedIncidents,'sysId');
					// so now we have the to be closed again in the NEW list
					_incidentsNEW = _incidentsNEW.concat(closedIncidents);
					logger.debug("--------------------------------- AFTER CLOSE HANDLING: "+incidentsNEWSysIds.length+" incidents in incidentsNEWSysIds");
					logger.debug("--------------------------------- AFTER CLOSE HANDLING: "+closedIncidents.length+" incidents in closedIncidents");
				  logger.debug("OLD *************** "+_incidentsOLDSysIds.length);
	        logger.debug("NEW *************** "+_incidentsNEWSysIds.length);
	        logger.debug("DELTA *************** delta size: "+_incidentsDELTASysIds.length);

					_mapAndEnrichIncidents(data,impactMapping,_incidentsNEW);

					_calculateDiff(_incidentsNEW,_incidentsOLD,_incidentsDELTA_CHANGED);

					//redo
					_incidentsNEWSysIds = _.pluck(_incidentsNEW,'sysId');
					_incidentsDELTASysIds = _.difference(_incidentsNEWSysIds,_incidentsOLDSysIds);
					logger.debug("OLD *************** "+_incidentsOLDSysIds.length);
	        logger.debug("NEW *************** "+_incidentsNEWSysIds.length);
	        logger.debug("CHANGES *********** "+_incidentsDELTA_CHANGED.length);
					logger.debug("******************* DELTA:  "+_incidentsDELTASysIds.length);


					var activeTicker = _createActiveTicker(_incidentsNEW);

					logger.debug("------------------- P01: "+activeTicker.totals.P01);
					logger.debug("------------------- P08: "+activeTicker.totals.P08);
					logger.debug("------------------- P16: "+activeTicker.totals.P16);
					logger.debug("------------------- P120: "+activeTicker.totals.P120);

					io.emit('incidentTickerUpdate', activeTicker);
					if (_incidentsDELTASysIds.length>0){
						incService.saveActiveTicker(activeTicker,function(err,result){
							if (err) logger.error("saving ticker failed.."+err.message);
							else logger.debug("saving ticker OK");

						});
					}

					// do the NEW HANDLING
	        var _incidentsDELTA_NEW =[];
	        for (var d in _incidentsDELTASysIds){
	          _incidentsDELTA_NEW.push(_.findWhere(_incidentsNEW,{"sysId":_incidentsDELTASysIds[d]}))
	        }
	        if (_incidentsDELTA_NEW.length>0 || _incidentsDELTA_CHANGED.length>0){
	          var _incidentsDIFF={"createDate":new Date(),"NEW":_incidentsDELTA_NEW,"CHANGED":_incidentsDELTA_CHANGED}
	          incService.saveDelta(_incidentsDIFF,function(err,result){
							if (err){
									logger.error("err: "+err.message);
							}
							else{
								logger.info("[SUCCESS]....saved incident DELTAS  NEW: "+_incidentsDELTA_NEW.length+ " - CHANGED: "+_incidentsDELTA_CHANGED.length);
								logger.debug("[going to sync incidents]....length: "+_incidentsNEW.length);
								// update the IncidentTracker
								//1) NEW: incident will increment the "incídenttracker_openedAt" daily value for the according priority
								if (_incidentsDIFF.NEW.length>0){
									_handleIncidentsNEW(_incidentsDIFF.NEW,io);
								}
								else {
									logger.debug("[NO NEW INCIDENT] _incidentsDIFF.NEW.length==0");
								}
								// we have to check whether the state has changed (and accordingly the either "resolvedAt" or "closedAt") collections
								if (_incidentsDIFF.CHANGED.length>0){
									_handleIncidentsCHANGED(_incidentsDIFF.CHANGED,baseline,_incidentsNEW,io);
								}
								//3) final stuff
								var _message=_incidentsNEW.length+" incidents (active==true) synced - NEW: "+_incidentsDIFF.NEW.length +" | CHANGED: "+_incidentsDIFF.NEW.length;
								io.emit('syncUpdate', {status:"[SUCCESS]",from:_syncName,timestamp:_timestamp,info:_message,type:type});
								_syncStatus.saveLastSync(_syncName,_timestamp,_message,_statusSUCCESS,type);

								callback(null,"OK");
							}
						});
	        }
					else{
						logger.debug("---------------------- IncidentSyncService says: no NEW or CHANGED incidents - NOTHING TO DO  ------------------------------------")
					}
				});
			})
		})
	})
}

/**
* creates the ticker count data for incidents
*/
function _createActiveTicker(_incidentsNEW){
		var _groupedByPrio = _.groupBy(_incidentsNEW,"priority");

		var _prios =["P01 - Critical","P08 - High","P16 - Moderate","P120 - Low"];
		var _subDimensions = ["assignmentGroup","businessService"];

		var activeTicker = {};

		activeTicker.totals={ALL:_incidentsNEW.length};
		activeTicker.totalsResolved={ALL:_.where(_incidentsNEW,{"state":"Resolved"}).length};
		activeTicker.totalsUnResolved={ALL:activeTicker.totals.ALL-activeTicker.totalsResolved.ALL}

		activeTicker.assignmentGroup={};
		activeTicker.assignmentGroupResolved={};

		activeTicker.businessService={};
		activeTicker.businessServiceResolved={};

		for (var p in _prios){
			var _prio=_prios[p].split(" - ")[0];
			if (_prio=="P40") _prio="P120";
			logger.debug("***** _prios[p]: "+_prios[p]);
			if (_groupedByPrio[_prios[p]]){
				activeTicker.totals[_prio]=_groupedByPrio[_prios[p]].length;
				activeTicker.totalsResolved[_prio]=_.where(_groupedByPrio[_prios[p]],{"state":"Resolved"}).length;
				activeTicker.totalsUnResolved[_prio]=activeTicker.totals[_prio]-activeTicker.totalsResolved[_prio];
				// _processSubDimension(activeTicker,_subDimensions,_groupedByPrio,_prio);
				var _assignmentGroup = _.groupBy(_groupedByPrio[_prios[p]],"assignmentGroup");
				var _assignmentGroupResolved = _.groupBy(_.where(_groupedByPrio[_prios[p]],{"state":"Resolved"}),"assignmentGroup");
				var _businessService = _.groupBy(_groupedByPrio[_prios[p]],"businessService");
				var _businessServiceResolved = _.groupBy(_.where(_groupedByPrio[_prios[p]],{"state":"Resolved"}),"businessService");
				var _ag ={};
				var _agr ={};
				for (var a in _assignmentGroup){
					_ag[a.split(".").join("-")]=_assignmentGroup[a].length;
				}
				for (var a in _assignmentGroupResolved){
					_agr[a.split(".").join("-")]=_assignmentGroupResolved[a].length;
				}
				activeTicker.assignmentGroup[_prio]=_ag;
				activeTicker.assignmentGroupResolved[_prio]=_agr;

				var _bs ={};
				var _bsr ={};
				for (var a in _businessService){
					_bs[a.split(".").join("-")]=_businessService[a].length;
				}
				for (var a in _businessServiceResolved){
					_bsr[a.split(".").join("-")]=_businessServiceResolved[a].length;
				}
				activeTicker.businessService[_prio]=_bs;
				activeTicker.businessServiceResolved[_prio]=_bsr;
			}
			else{
					activeTicker.totals[_prio]=0;
					activeTicker.totalsResolved[_prio]=0;
					activeTicker.totalsUnResolved[_prio]=0;
					activeTicker.businessService[_prio]=0;
					activeTicker.businessServiceResolved[_prio]=0;
					activeTicker.assignmentGroup[_prio]=0;
					activeTicker.assignmentGroupResolved[_prio]=0;
			}
		}
		activeTicker.timestamp = new Date();
		return activeTicker
}


/** subDimension handling
*/
function _processSubDimension(activeTicker,subDimensions,list,prio){
	for (var s in subDimensions){
		var subDimension = subDimensions[s];
		var _active = _.groupBy(list[prio],subDimension);
		var _resolved = _.groupBy(_.where(list[prio],{"state":"Resolved"}),subDimension);
		// needed to get rid of "." in keys => as mongoDB does not like "." ;-)
		var _activeClean ={};
		var _resolvedClean ={};
		for (var a in _active){
			_activeClean[a.split(".").join("-")]=_active[a].length;
		}
		for (var r in _resolved){
			_resolvedClean[r.split(".").join("-")]=_resolved[r].length;
		}
		activeTicker[subDimension][prio]=_activeClean;
		activeTicker[subDimension+"Resolved"][prio]=_resolvedClean;
	}
}



/**
* takes the raw data we got from the API call
* maps it against space format
* and enriches by revenue impact
*/
function _mapAndEnrichIncidents(data,impactMapping,_incidentsNEW){
	for (var i in data.records){
		var _incident = incService.filterRelevantData(data.records[i]);
		//enrich/join with revenue impact
		var _impact = _.findWhere(impactMapping,{"incident":_incident.id});
		if (_impact){
			_incident.revenueImpact = parseInt(_impact.impact);
		}
		_incidentsNEW.push(_incident);
	}
}


function _calculateDiff(_incidentsNEW,_incidentsOLD,_incidentsDELTA_CHANGED){
	var _diff;
	var _omitForDiff = ["_id","syncDate"];
	logger.debug("[calculateDiff] START ... _incidentsNEW.length = "+_incidentsNEW.length);
	for (var i in _incidentsNEW){
		var _incident = _incidentsNEW[i];
		var _old = _.findWhere(_incidentsOLD,{"sysId":_incident.sysId});
		var _changed={};
		if (_old){
			_diff=jsondiffpatch.diff(_.omit(_old,_omitForDiff),_.omit(_incident,_omitForDiff));
			if (_diff){
				var _change ={"id":_old.id,"sysId":_old.sysId,"diff":_diff}
				_incidentsDELTA_CHANGED.push(_change);
			}
		}
	}
	logger.debug("[calculateDiff] END ... _incidentsNEW.length = "+_incidentsNEW.length);
	logger.debug("[calculateDiff] END ... _incidentsDELTA_CHANGED.length = "+_incidentsDELTA_CHANGED.length);
}



/** in case that an incidnet is closed - we have to derive this from the inverse delta
* accessing incdeints by sysID = https://bwinparty.service-now.com/ess/incident_list.do?JSONv2&sysparm_action=getRecords&sysparm_sys_id=23cc7cb90f2bbd0052fb0eece1050e44
*/
function _handleClosedIncidents(deltaIds,type,io,callback){
	var async = require('async');
	if (deltaIds){
		var _list = [];
		logger.debug("++++++++++++++++++++++++++++ "+deltaIds.length+" CLOSED INCIDENTS ++++++++++++++++++++++++++++++++++++++++");
		async.each(deltaIds, function(_sysId, done) {
			var _url =config.sync[_syncName].url+"&sysparm_sys_id="+_sysId;
			_getSnowData(_url,type,io,function(err,data){
				logger.debug("+++ _getSnowData : url = "+_url);
				if (err){
					logger.error("error: "+err.message);
					done();
					return;
				}
				if (data && data.records && data.records.length>0){
					var _incident = incService.filterRelevantData(data.records[0]);
					logger.debug("+++ I N C I D E N T : "+JSON.stringify(_incident));
					_list.push(_incident);
				}
				else logger.warn("!!!!!!!!!!!!!!!!!! incident with sysId: "+_sysId+" cannot be found under "+_url);
				done();

			})
		},function(err){
			if(err){
				logger.error("something bad happened: "+err);
				callback(err);
			}
			else{
				logger.debug("...OK all stuff processed");
				logger.debug("++++++++++++++++++++++++++++++++  calling back with I N C I D E N T list._length: "+_list.length);
				callback(null,_list);
			}
		});
	}
}

/**
 insert the NEW incidents !
*/
function _handleIncidentsNEW(incidents,io){
	var prios = ["P01","P08","P16","P120"];

	incService.insert(incidents,function(err,success){
		if (err){
			logger.error('incidents.insert failed: '+err.message);
		}
		else if(success){
			logger.info("[success] incService.insert : "+incidents.length +" NEW incidents inserted");
			incTrackerService.incrementTracker(incidents,["openedAt","resolvedAt","closedAt"],prios,function(err,result){
				if (err) logger.error("[IncidentSyncService] NEW Incident - incTrackerService.incrementTracker FAILED: "+err.message);
				else {
					logger.info("[IncidentSyncService] NEW Incident - incTrackerService.incrementTracker SUCCESS: "+JSON.stringify(result));
					if (config.emit.snow_incidents_new =="on"){
						for (var i in incidents){
							//only notify those which are configured in config.emit.snow_incidents_prios
							if (config.emit.snow_incidents_prios.indexOf(incidents[i].priority.split(" - ")[0])>-1){
								_emitNEWIncidentMessage(incidents[i],io);
							}
						}
					}
				}
			});
		} //else if (success) end
	}) //incidents.insert()
}


/**
  + in CHANGED we have an array of incident pointers
 	+ so we need to first grab all changed incidents from the baseline and pack them into the CHANGED array for the update of incidents
		"CHANGED" : [{"id" : "INC123721","sysId" : "0080c2380f8c8a4052fb0eece1050e8e","diff" : {
*/
function _handleIncidentsCHANGED(changes,baseline,_incidentsNEW,io){
	var prios = ["P01","P08","P16","P120"];
	logger.debug("[CHANGED INCIDENT] _incidentsDIFF.CHANGED.length = "+changes.length);
	var _updateIncidents = [];
	for (var i in changes){
		var _pointer = changes[i];
		var _inc = _.findWhere(_incidentsNEW,{"id":_pointer.id});
		var _diff = changes[i];
		var _oldinc = _.findWhere(baseline,{"id":_pointer.id});
		_inc._id = _oldinc._id;

		var _prioChanged = false;
		if (_inc.priority != _oldinc.priority) _prioChanged=true;

		logger.debug("---------------------------------------------------------------------------------------------------------------------------------");
		logger.debug("---------------------------------------------------------------------------------------------------------------------------------");
		logger.debug("   ---  _pointer.id: "+_pointer.id);
		logger.debug("   ---  _inc from incidentsNEW: : "+_inc.id+" sysId: "+_inc.sysId);
		logger.debug("   ---  _oldinc from incidentsOLD: : "+_oldinc.id+" sysId: "+_oldinc.sysId+ " _id: "+_oldinc._id);
		if (_prioChanged){
			logger.debug("   ---  ********************************************************* ---");
			logger.debug("   ---  PRIO OLD: "+_oldinc.priority+" <---> PRIO NEW: "+_inc.priority);
			logger.debug("   ---  ********************************************************* ---");
			_inc.prioChange={old:_oldinc.priority.split(" - ")[0],new:_inc.priority.split(" - ")[0]};
		}

		logger.debug("   ---  enriched incident with _id: "+_inc._id);
		logger.debug("---------------------------------------------------------------------------------------------------------------------------------");
		logger.debug("---------------------------------------------------------------------------------------------------------------------------------");
		// we also need an mongo _id to to a proper update....
		_updateIncidents.push(_inc);
		if (config.emit.snow_incidents_changes =="on"){
			if (config.emit.snow_incidents_prios.indexOf(_inc.priority.split(" - ")[0])>-1){
				_emitCHANGEIncidentMessage(_diff,_inc,io);
			}
		}
	}
	incService.update(_updateIncidents);
	// => with this list I can easily create the tracker ??
	// ===> looks like we double count stuff currently ... on CHANGES
	// ===> try to fix: only handle resolved and closed datefields => opened is only for new ones !

	// try this => only if we have a prio change we will handle "openedAt.."
	var _datefields =[];
	if (_prioChanged) _datefields.push("openedAt");
	_datefields.push("resolvedAt","closedAt");

	incTrackerService.incrementTracker(_updateIncidents,_datefields,prios,function(err,result){
		if (err) logger.error("[IncidentSyncService] CHANGED Incident - incTrackerService.incrementTracker FAILED: "+err-message);
		else {
			logger.info("[IncidentSyncService] CHANGED Incident - incTrackerService.incrementTracker SUCCESS");
		}
	});
}


function _emitNEWIncidentMessage(incident,io){
	var _newincident = incident;
	var _message={};
	var _type;
	var _prio = _getPrio(incident);
	_message.title=_newincident.businessService;
	_message.body = "+ "+_newincident.label+"\n"+_newincident.shortDescription;
	//_message.type = _type;
	_message.desktop={desktop:true,icon:"/images/incidents/"+_prio+".png"};
	logger.debug("========================== message: "+JSON.stringify(_message));
	// filter out stuff
	var _exclude = config.emit.snow_incidents_new_exclude_businessservices;
	if (!_.startsWith(_newincident.businessService,_exclude)){
		logger.debug("========================== going to emit websocket message ===================================");
		io.emit('message', {msg:_message});
	}
}


function _emitCHANGEIncidentMessage(change,incident,io){
	var _message={};
	var _type;
	var _prio=_getPrio(incident);
	// only notify changes of those fields
	var _fields = ["state","assignmentGroup","priority"];
	_message.title=incident.businessService;
	var _body = "+ "+incident.id+"\n";
	var _send = false;
	for (var i in _.keys(change.diff)){
		var _key = _.keys(change.diff)[i];
		//console.log("_key: "+_key);
		if (_fields.indexOf(_key)>-1){
			_body+=_key+"\n+ "+change.diff[_key][0]+" -> "+change.diff[_key][1]+"\n";
			_send = true;
		}
	}
	_message.body = _body
	//_message.type = _type;
	_message.desktop={desktop:true,icon:"/images/incidents/"+_prio+"_changed.png"};
	logger.debug("========================== message: "+JSON.stringify(_message));
	// filter out stuff
	var _exclude = config.emit.snow_incidents_changes_exclude_businessservices;
	if (!_.startsWith(incident.businessService,_exclude) && _send == true){
		logger.debug("========================== going to emit websocket message ===================================");
		io.emit('message', {msg:_message});
	}
}

function _getPrio(incident){
	if (_.startsWith(incident.priority,"P01")){
		_prio = "P01";
	}
	else if(_.startsWith(incident.priority,"P08")){
		_prio = "P08";
	}
	else if(_.startsWith(incident.priority,"P16")){
		_prio = "P16";
	}
	else if(_.startsWith(incident.priority,"P40") || _.startsWith(incident.priority,"P120")){
		_prio = "P120";
	}
	return _prio;
}

function _getTimeStringForTimeRange(start,stop){
	var ms = moment(stop,"DD/MM/YYYY HH:mm:ss").diff(moment(start,"DD/MM/YYYY HH:mm:ss"));
	var d = moment.duration(ms);
	var _time = Math.floor(d.asHours()) + moment.utc(ms).format(":mm:ss");
	return _time;
}


function _getSnowData(url,type,io,callback){
	var _syncStatus = spaceServices.SyncService;
	var _timestamp = new Date();
	var _statusERROR = "[ERROR]";
	var _statusSUCCESS = "[SUCCESS]";

	var Client = require('node-rest-client').Client;
	var _options = {user:_secret.snowUser,password:_secret.snowPassword};
	if (config.proxy){
		_options.proxy = config.proxy;
		_options.proxy.tunnel = true;
	}
	client = new Client(_options);
	logger.debug("*** [_getSnowData] client.get data : url = "+url);
	client.get(url, function(data, response,done){
		callback(null,data);
	}).on('error',function(err){
      var _message=err.message;
			logger.error('[IncidentSyncSerice] says: something went wrong on the request', err.message);
			io.emit('syncUpdate', {status:"[ERROR]",from:"incident",timestamp:new Date(),info:err.message,type:type});
			_syncStatus.saveLastSync(_syncName,_timestamp,_message,_statusERROR,type);
			callback(err);
  });
}
