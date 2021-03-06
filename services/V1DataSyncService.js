var config = require('config');
var schedule = require('node-schedule');
var _ = require('lodash');

var mongojs = require("mongojs");
var DB="space";
var connection_string = '127.0.0.1:27017/'+DB;
var db = mongojs(connection_string, [DB]);



// logger
var winston = require('winston');
var logger = winston.loggers.get('space_log');

var _syncName = "v1data";

var spaceServices = require('space.services');

var v1Service = spaceServices.V1Service;
var orgService = spaceServices.OrganizationService;


var async = require('async');

exports.sync = _sync;

exports.init = function(io,callback){

	var rule = new schedule.RecurrenceRule();
	// every 10 minutes
	var _type = "scheduled - automatic";
	if (config.sync[_syncName].mode=="on"){
		rule.minute = new schedule.Range(0, 59, config.sync[_syncName].intervalMinutes);
		logger.info("[s p a c e] V1DataSyncService init(): "+config.sync[_syncName].intervalMinutes+" minutes - mode: "+config.sync[_syncName].mode);

		var j = schedule.scheduleJob(rule, function(){
			logger.debug('...going to sync V1 Data ....');
			_sync(config.sync[_syncName].url,_type,io,callback);
		});
		_sync(config.sync[_syncName].url,_type,io,callback);
	}
}


function _sync(url,type,io,callback){
	logger.debug("*********************** _syncV1Data, url: "+url);

	var _syncStatus = spaceServices.SyncService;
	var _timestamp = new Date();
	var _statusERROR = "[ERROR]";
	var _statusSUCCESS = "[SUCCESS]";

  var fetch = require('node-fetch');

	var _cache ={};

	orgService.findEmployees(function(err,employees){
	// needed to join capacity config to backlog data
		v1Service.findBacklogsCapacity(function(err,backlogscapacity){
			logger.debug("---------------------------- backlogscapacity: "+backlogscapacity.length);
			async.eachSeries(url,function(_url,done){
				//var _url = url[0];
					fetch(_url)
					  .then(function(res) {
					       return res.json();
					  }).then(function(_data) {

					logger.debug(">>>> calling "+_url);
					//var _data = JSON.parse(data);
					var _collection = "v1"+_.last(_url.split("/"));
					_cache[_collection]=_data;

					var v1data =  db.collection(_collection);
					if (_collection=="v1teams"){
						_data = _enrichTeamData(_data,_cache.v1members);
					}
					if (_collection=="v1members"){
						_data = _enrichMemberData(_data,employees);
					}
					if (_collection=="v1backlogs"){
						_data = _enrichBacklogData(_data,backlogscapacity);
					}

					v1data.drop();
					v1data.insert(_data, function(err , success){
						//console.log('Response success '+success);
						if (err) callback(err);
						logger.debug(">>>> DONE ???? "+_collection+ " - inserted: "+_data.length+" items");
						done();
					});
				})
					},function(err,result){
						//
						if (err) {
							logger.error('Response error '+err.message);
							var _message = err.message;
							logger.warn('[V1DataSyncService] says: something went wrong on the request', err.request.options,err.message);
							io.emit('syncUpdate', {status:"[ERROR]",from:_syncName,timestamp:_timestamp,info:err.message,type:type});
							_syncStatus.saveLastSync(_syncName,_timestamp,_message,_statusERROR,type);
							callback(err);
						}
						var _message = "v1Data sync "+url.join(", ")+" [DONE]: ";
						logger.info(_message);
						io.emit('syncUpdate', {status:"[SUCCESS]",from:_syncName,timestamp:_timestamp,info:_message,type:type});
						_syncStatus.saveLastSync(_syncName,_timestamp,_message,_statusSUCCESS,type);
						callback(null,_message)
				});
			})
	});
}



function _enrichTeamData(teams,members){
	for (var i in teams){
		var _team =teams[i];
		_team.Participants = _parseParticipants(_team.Participants,members);
	}
	return teams;
}

function _enrichMemberData(members,employees){
	for (var i in members){
		var _member =members[i];
		_member.ParticipatesIn= _parseParticipatesIn(_member.ParticipatesIn);

		// currently there is a leading "M" in the employeenumbers....
		if (_.startsWith(_member.EmployeeId, 'M')){
				_member.EmployeeId= _.rest(_member.EmployeeId).join("");
		}


		var _employee = _.findWhere(employees,{"Employee Number":_member.EmployeeId});
		if (_employee){
			_member.JobFamily = _employee["Job Family"];
		}
	}
	return members;
}

function _enrichBacklogData(backlogs,backlogscapacity){
	for (var b in backlogs){
		var _b =backlogs[b];
		_b.Capacity={};
		var _bc = _.findWhere(backlogscapacity,{backlog:_b.Name});
		if (_bc){
		 _b.Capacity.averageAvailablePDperMonth= _bc.averageAvailablePDperMonth;
		 _b.Capacity.availablePercentageForInitiatives= _bc.availablePercentageForInitiatives;
		}
		else{
			_b.Capacity.averageAvailablePDperMonth=config.backlogscapacity.defaultAverageAvailablePDperMonth;
			_b.Capacity.availablePercentageForInitiatives=config.backlogscapacity.defaultAvailablePercentageForInitiatives;
		}
		_b.Initiatives=[];
	}
	return backlogs;
}



/**
parse from V1 participant string
[{_oid\u003dMember:66587}, {_oid\u003dMember:461706}, {_oid\u003dMember:860049}, {_oid\u003dMember:2797134}, {_oid\u003dMember:2829866}
*/
function _parseParticipants(participantString,members){
	var _participants = [];
	// omit starting and ending bracket
	var _slices = _.initial(_.rest(participantString).join("")).join("").split(", ");
	for (var s in _slices){
		// the oid
		var _oid = _.initial(_slices[s].split(":")[1]).join("");
		var _member = _.findWhere(members,{ID:"Member:"+_oid});
		if (_member){
			_participants.push({ID:_member.ID,Name:_member.Name,Email:_member.Email,EmployeeId:_member.EmployeeId,JobFamily:_member.JobFamily});
		}
	}
	return _participants;
}

function _parseParticipatesIn(participatesInString){
	var _teams = [];
	// omit starting and ending bracket
	var _slices = _.initial(_.rest(participatesInString).join("")).join("").split(", ");
	for (var s in _slices){
		// the oid
		var _oid = _.initial(_slices[s].split(":")[1]).join("");
		_teams.push({ID:_oid,Type:_slices[s].split(":")[0].split("=")[1]});
	}
	return _teams;
}
