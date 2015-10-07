var gulp = require('gulp');
var copy = require('gulp-copy');
var tar = require('gulp-tar');
var untar = require('gulp-untar');
var rename = require('gulp-rename');
var gutil = require('gulp-util');
var concat = require('gulp-concat');
var runSequence = require('run-sequence');
var zip = require('gulp-zip');
var unzip = require('gulp-unzip');
var mocha = require('gulp-mocha');
var git = require('gulp-git');
var mongojs = require('mongojs');

var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');

var config = require('config');



var fs = require('fs');
var moment = require('moment');
var minimist = require('minimist');

var secret = require('./config/secret.json');

var SERVER={};
SERVER.host=config.gulp.deployTarget;
SERVER.port=config.gulp.deployTargetPort;
SERVER.username=secret.deployTargetUser;
SERVER.password=secret.deployTargetPassword;
SERVER.env=config.gulp.deployTargetEnv;

var gulpSSH = require('gulp-ssh')({
  ignoreErrors: false,
  sshConfig: {
    host: SERVER.host,
    port: SERVER.port,
    username: SERVER.username,
    password : SERVER.password
    //privateKey: require('fs').readFileSync('/Users/zensh/.ssh/id_rsa')
  }
});

var src=".";
var mongodb_dev="c:\mongodb";

var version = config.version;
var timestamp = moment(new Date()).format("YYYYMMDD_HHmmss");

var PROJECT = "space.syncer";

var VERSION = require('./package.json').version;
var BASE = config.gulp.baseDir;
var REMOTE_BASE = config.gulp.remoteBaseDir;
var DIST = BASE+"dist/package/";
var DUMP = BASE+"dist/dump/";
var DROPBOX = "Dropbox/_work/space/";
var RESTORE = "./";
var PACKAGE = PROJECT+"_v"+version+"_build_"+timestamp;
var PACKAGE_EXTENSION = ".zip";
var TRANSFER = DIST+PROJECT+".zip";
var INSTALL = "./bin/scripts/*.sh";
var TARGET = './'+PROJECT+'.zip';
var SCRIPT_TARGET = './'+PROJECT+'_scripts.zip';

var TRANSFERCONFIG = "./config/production.json";
var TARGETCONFIG = "./"+PROJECT+"/app/config/production.json";


var REMOTE_SETUP = ['./'+PROJECT+'_setup.sh'];
var REMOTE_DEPLOY = ['./'+PROJECT+'/scripts/'+PROJECT+'_deploy.sh'];
var REMOTE_START = ['./'+PROJECT+'/scripts/'+PROJECT+'_start.sh'];



var knownOptions = {
  string: 'target',
  default: { target: 'production' }
};
var options = minimist(process.argv.slice(2),knownOptions);

gutil.log("knownoptions: "+JSON.stringify(knownOptions));

gulp.task('minorrelease', function () {
	gutil.log("current version: "+VERSION);
	gutil.log("increment maintenance: "+incrementVersion("maintenance",VERSION));
	gutil.log("increment minor: "+incrementVersion("minor",VERSION));
	gutil.log("increment major: "+incrementVersion("major",VERSION));

});

gulp.task('installscripts', function () {
  return gulp.src(INSTALL)
    .pipe(gulpSSH.sftp('write', './'));
});


gulp.task('buildfile', function () {
	gutil.log(gutil.colors.magenta('[s p a c e.syncer -deploy] create space.build file - '), 'build: '+timestamp);
    return fs.writeFile('./space.build', '{"build":"'+timestamp+'"}');
});


gulp.task('package', function () {
    var _src = ['./**','!logs','!.git','!public/files/**','!temp','!Dockerfile'];
    gutil.log('[s p a c e.syncer - package] package stuff together - ', '_src:'+_src.join(","));
    gutil.log('[s p a c e.syncer - package] package name: ', PACKAGE+PACKAGE_EXTENSION);
    gutil.log('[s p a c e.syncer - package] destination: ', DIST);

    return gulp.src(_src)
    .pipe(zip(PACKAGE+PACKAGE_EXTENSION))
    .pipe(gulp.dest(DIST));
});

gulp.task('copy',function(){
	 gutil.log("[s p a c e.syncer - copy] copy and rename - source: "+DIST+PACKAGE+PACKAGE_EXTENSION);
	 gutil.log("[s p a c e.syncer - copy] target: "+TRANSFER);


	 return gulp.src(DIST+PACKAGE+PACKAGE_EXTENSION)
        .pipe(rename(TARGET))
        .pipe(gulp.dest(DIST));

});


gulp.task('transfer', function () {
  gutil.log("[s p a c e.syncer - transfer] scp stuff - source: "+TRANSFER,"target: "+TARGET);
  gutil.log("[s p a c e.syncer - transfer] ssh config: host: "+SERVER.host+" ,port: "+SERVER.port+" ,username: "+SERVER.username+" , password : "+SERVER.password);

  return gulp.src(TRANSFER)
    .pipe(gulpSSH.sftp('write', TARGET));
});


gulp.task('remotedeploy', function () {
   gutil.log("[s p a c e.syncer - remotedeploy] remote deploy - execute: "+REMOTE_DEPLOY.join(','));

   return gulpSSH
    .exec(REMOTE_DEPLOY, {filePath: 'space_remotedeploy.log'})
    .pipe(gulp.dest('logs'));
});

gulp.task('remotestart', function () {
   gutil.log("[s p a c e.syncer - remotestart] remote start - execute: "+REMOTE_START.join(','));
   return gulpSSH
    .exec(REMOTE_START, {filePath: 'space_remotestart.log'})
    .pipe(gulp.dest('logs'));
});

gulp.task('done', function () {
  gutil.log("[s p a c e.syncer - done] ****** S U C C E S S F U L *******");
  gutil.beep();
  gutil.beep();

   return;
});



/**
 * deploys a space version, setup scripts and dumps current server
 */
gulp.task('fullmonty',function(callback){
    gutil.log("[s p a c e.syncer -fullmonty] ******");

	runSequence('setup','dump','deploy',callback);
});



/**
 * deploys a space version
 */
gulp.task('deploy',function(callback){
    gutil.beep();
    gutil.log("[s p a c e.syncer -deploy] ************************************************************");
    gutil.log("[s p a c e.syncer -deploy] ****** going to deploy to: "+SERVER.host+" -> "+SERVER.env);


	runSequence('changelog','setup','buildfile','package','copy','transfer','remotedeploy','remotestart','done',callback);

});

/**
 * deploys a space version
 */
gulp.task('deployconfig',function(callback){
    gutil.beep();
    gutil.log("[s p a c e.syncer -deployconfig] ************************************************************");
    gutil.log("[s p a c e.syncer -deployconfig] ****** going to deploy new config to: "+SERVER.host+" -> "+SERVER.env);


	runSequence('transferconfig','remotestart','done',callback);

});

gulp.task('transferconfig', function () {
  gutil.log("[s p a c e.syncer - transferconfig] scp stuff - source: "+TRANSFERCONFIG,"target: "+TARGETCONFIG);
  gutil.log("[s p a c e.syncer - transferconfig] ssh config: host: "+SERVER.host+" ,port: "+SERVER.port+" ,username: "+SERVER.username+" , password : "+SERVER.password);

  return gulp.src(TRANSFERCONFIG)
    .pipe(gulpSSH.sftp('write', TARGETCONFIG));
});


/**
 *  copies s p a c e.syncer  scripts to REMOTE
 */
gulp.task('setup',function(callback){
    gutil.log("[s p a c e.syncer -setup] ****** going to install latest shell scripts "+SERVER.host+" -> "+SERVER.env);

	runSequence('transferscripts','transfersetup','remoteunpackscripts',callback);
});

gulp.task('transferscripts', function () {
  gutil.log("[s p a c e.syncer -transferscripts] remote copy shell scripts - target: "+REMOTE_BASE);
  return gulp.src('bin/scripts/*.sh')
    .pipe(zip('bin/scripts/'+PROJECT+'_scripts.zip'))
    .pipe(gulpSSH.sftp('write', SCRIPT_TARGET));
});

gulp.task('transfersetup', function () {
  gutil.log("[s p a c e.syncer -transfersetup] remote copy shell setup script - target: "+REMOTE_BASE);
  return gulp.src('bin/scripts/'+PROJECT+'_setup.sh')
    .pipe(gulpSSH.sftp('write', REMOTE_BASE+PROJECT+'_setup.sh'))
    .pipe(gulpSSH.shell(['chmod 755 ./'+PROJECT+'_setup.sh']));
});

gulp.task('remoteunpackscripts', function () {
  gutil.log("[s p a c e.syncer -remoteunpackscripts] remote unpack space.syncer scripts: ");
  return gulpSSH
    .exec(REMOTE_SETUP,{filePath: 'logs/'+PROJECT+'_remotesetup.log'})
    .pipe(gulp.dest('logs'));
});


gulp.task('lint', function() {
  return gulp.src(['./routes/**.js','./services/**.js','./public/javascripts/kanban/**.js',])
    .pipe(jshint())
    .pipe(jshint.reporter(stylish));
});

gulp.task('concat', function() {
  return gulp.src(['./public/javascripts/**/**.js',])
    .pipe(concat('space.js'))
    .pipe(gulp.dest('.'));
});


gulp.task('mocha', function () {
    gutil.log("[s p a c e.syncer - mocha unit tests] ****** running all tests");
    return gulp.src('./test/*.js', {read: false})
        .pipe(mocha({reporter: 'nyan'}));
});

// Other actions that do not require a Vinyl
gulp.task('changelog', function(){
  gutil.log("[s p a c e.syncer - changelog] ****** creating changelog.json from git commits");
  git.exec({args : 'log --oneline --pretty=format:"%ad:: %s;;" --date=short '}, function (err, changelog) {
    if (err) throw err;
    //console.log(changelog);
      var _loglines = changelog.split(";;");
      var _logitemlist = [];
      for (var i in _loglines){
          var _logitem = {};
          var _linesplit = _loglines[i].split("::");
          _logitem.date = _linesplit[0];
          _logitem.change = _linesplit[1];
          console.log("**** "+JSON.stringify(_logitem));
          _logitemlist.push(_logitem);
      }

      //console.log(JSON.stringify(_logitemlist));

      fs.writeFile("changelog.json", JSON.stringify(_logitemlist), 'utf8', function(err,done){
        gutil.log("[s p a c e.syncer - changelog] OK ");
    });


  });
});


/**
 * @param version: type string major.minor.maintenance-build
 */
function incrementVersion(type,version){
	var _v = version.split(".");

	switch (type){
		case "major":
			_v[0] = parseInt(_v[0])+1;
		case "minor":
			_v[1] = parseInt(_v[1])+1;
		case "maintenance":
			_v[2] = parseInt(_v[2])+1;
	}
	return _v.join('.');
}
