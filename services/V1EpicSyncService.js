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

var _syncName = "v1epics";

var spaceServices = require('space.services');

var v1Service = spaceServices.V1Service;
var portfolioService = spaceServices.PortfolioService;

exports.sync = _sync;

exports.init = function(io,callback){
	var rule = new schedule.RecurrenceRule();
	// every 10 minutes
	var _type = "scheduled - automatic";
	if (config.sync[_syncName].mode=="on"){
		rule.minute = new schedule.Range(0, 59, config.sync[_syncName].intervalMinutes);
		logger.info("[s p a c e] V1EpicSyncService init(): "+config.sync[_syncName].intervalMinutes+" minutes - mode: "+config.sync[_syncName].mode);
		var j = schedule.scheduleJob(rule, function(){
			logger.debug('...going to sync V1 Epics ....');
			_sync(config.sync[_syncName].url,_type,io,callback);
		});
		_sync(config.sync[_syncName].url,_type,io,callback);
	}
}


function _sync(url,type,io,callback){
	logger.debug("**** _syncV1Epics, url: "+url);

	var _syncStatus = spaceServices.SyncService;
	var _timestamp = new Date();
	var _statusERROR = "[ERROR]";
	var _statusSUCCESS = "[SUCCESS]";

	var fetch = require('node-fetch');

	fetch(url[0])
	  .then(function(res) {
	       return res.json();
	  }).then(function(_progress) {
      //console.log("...."+_progress);
			fetch(url[1])
		    .then(function(res) {
		         return res.json();
		    }).then(function(_epics) {
		        //console.log("...."+_epics);
						portfolioService.getCurrentApprovedInitiatives(function(err,approved){
							// parsed response body as js object
							//console.log(data);
							// raw response
							//console.log(response);
							// and insert
							//var _epics = JSON.parse(data);
							var v1epics =  db.collection(_syncName);
							v1epics.drop();

							_enrichEpics(_epics,_progress,approved);

							v1epics.insert(_epics, function(err , success){
								//console.log('Response success '+success);
								if (err) {
									logger.error('Response error '+err.message);
								}
								if(success){
									var _message = "syncv1 [DONE]: "+_epics.length+" epics";
									logger.info(_message);
									io.emit('syncUpdate', {status:"[SUCCESS]",from:_syncName,timestamp:_timestamp,info:_epics.length+" epics",type:type});
									_syncStatus.saveLastSync(_syncName,_timestamp,_message,_statusSUCCESS,type);
									callback(null,"syncv1 [DONE]: "+_epics.length+ " epics synced")
								}
							})
						})
				})
	});
}


function _enrichEpics(epics,progress,approved){
	console.log("--------------- approved list passed to _enrichEpics: "+JSON.stringify(approved));
	for (var e in epics){
		var _e = epics[e];
		var _strategicThemes = _parseStrategicThemes(_e.StrategicThemesNames);
		_e.Markets = _strategicThemes.markets;
		_e.Targets = _strategicThemes.targets;
		_e.Customers = _strategicThemes.customers;
		_e.BusinessBacklogID = _parseObjectID(epics[e].BusinessBacklogID);

		var _estimateClosed;
		var _estimateAll;
		var _estimateOpen;

		var _findEpic = _.findWhere(progress,{Number:_e.Number});
		if (_findEpic){
			_estimateClosed = _findEpic["SubsAndDown:PrimaryWorkitem[AssetState\u003d\u0027Closed\u0027].Estimate.@Sum"];
			_estimateAll = _findEpic["SubsAndDown:PrimaryWorkitem[AssetState!\u003d\u0027Dead\u0027].Estimate.@Sum"];
			_estimateOpen = _estimateAll-_estimateClosed;
			_e.EstimateClosed = parseFloat(_estimateClosed);
			_e.EstimateOpen = parseFloat(_estimateOpen);
			_e.Progress = parseFloat(((_estimateClosed/_estimateAll)*100).toFixed(2));
			epics[e].Product = v1Service.deriveProductFromBacklog(_e.BusinessBacklog);

			// additional info from peter supplied by biweekly portfoliogate excel import
			var _approvedItem=_.findWhere(approved,{EpicRef:_e.Number});
			if (_approvedItem){
				_e.IsInLatestApprovedPortfolio=true;
				console.log("***** approved: "+JSON.stringify(_approvedItem));
				_e.Project= _approvedItem.Project;
				_e.Product= _approvedItem.Product;
				_e.Sort = _approvedItem.Sort;
				_e.LastReportedLaunchDate= _approvedItem["Last reported Launch Date"];
				_e.LastReportedEndDate= _approvedItem["Last reported End Date"];
				_e.LastReportedHealth= _approvedItem["Last Reported RAG"];
			}
		}
	}
}
// eg {_oid\u003dScope:10461}
function _parseObjectID(name){
	var _id;
	if(name){
		var _split1 = name.split("}")[0];
		if (_split1){
			_id =_split1.split(":")[1];
		}
	}
	return _id;
}

/**
* takes a string of strategic theme from version1 and creates a proper object with datra
* e.g. "[[STR] G1 Push Mobile-First, [STR] G2 Execute Product Roadmap, [CUS] Bwin, [MAR] .es]"
*/
function _parseStrategicThemes(strategicThemeString){
	var strategicTheme = {customers:[],markets:[],targets:[]};
		// cut first and last bracket
	var _transform = _.initial(_.rest(strategicThemeString)).join("");
	_transform = _transform.split(",");
	for (var i in _transform){
		var _temp = _.trim(_transform[i]);
		if (_.startsWith(_temp,"[CUS]")) strategicTheme.customers.push(_.trim(_temp.split("[CUS]")[1]));
		else if (_.startsWith(_temp,"[MAR]")) strategicTheme.markets.push(_.trim(_temp.split("[MAR]")[1]));
		else if (_.startsWith(_temp,"[STR]")) strategicTheme.targets.push(_.trim(_temp.split("[STR]")[1]));
	}
	return strategicTheme;
}
