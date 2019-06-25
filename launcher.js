const webdriver = require('selenium-webdriver');
const url = require('url');
const encodeUrl = require('encodeurl');
const os = require('os');
const child_process = require('child_process');

var perfectoConnect;
var perfectoDisconnect = false;
var log;
var keepAliveTimer = null;

class DriverData{
	constructor(){
		this.driver = null;
	}
};

driverDataMap = new Map();

var tunnelId = null;

function getDriverData(id){
	
	driverData = driverDataMap.get(id);
	if (driverData)
		return driverData;

	driverData = new DriverData();
	driverDataMap.set(id, driverData);
	return driverData;

}

module.exports.getDriverData = getDriverData;

function haveReporter(config) {

	reporters = config.reporters;
	if (!reporters)
		return false;

	for (var i=0; i<reporters.length; i++){
		if (reporters[i] == 'Perfecto')
			return true;
	}

	return false;
}

function getIPAddress() {

    var interfaces = os.networkInterfaces();
    for (var devName in interfaces) {
        var iface = interfaces[devName];
        for (var i = 0; i < iface.length; i++) {
            var alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }

    return null;
}

function keepAlive() {
	log.info('Sending keep alive');
	for (var [id, driverData] of driverDataMap.entries()) {
		driverData.driver.getCurrentUrl();
	}
}

function cancelKeepAlive() {

	if (!keepAliveTimer)
		return;

	log.info('Canceling keep alive');

	clearInterval(keepAliveTimer);
	keepAliveTimer = null;
}

function setupKeepAlive(perfectoConfig) {

	if (keepAliveTimer)
		return;

	if (!perfectoConfig.keepAlive)
		return;

	if (perfectoConfig.keepAlive <= 0)
		return;

	log.info('Setting keep alive timeout to %d', perfectoConfig.keepAlive);

	keepAliveTimer = setInterval(keepAlive, perfectoConfig.keepAlive);

	// make sure the keep alive timer does not prevent us from exiting.	
	keepAliveTimer.unref();

	if (!perfectoConfig.keepAliveDuration)
		return;

	if (perfectoConfig.keepAliveDuration <= 0)
		return;

	log.info('Setting keep alive duration to %d', perfectoConfig.keepAliveDuration);
	
	// make sure the keep alive cancel timeout does not prevent us from exiting.	
	setTimeout(cancelKeepAlive, perfectoConfig.keepAliveDuration).unref();

}

function getHost(perfectoConfig){
	if (!perfectoConfig.host)
		return getIPAddress();

	return perfectoConfig.host;
}

function getPerfectoUrl(pefectoConfig){
	if (!perfectoConfig.perfectoUrl){
		log.error('Missing perfectoUrl configuration parameter');
		return null;
	}

	return perfectoConfig.perfectoUrl;
}

function getSecurityToken(perfectoConfig){
	if (!perfectoConfig.securityToken){
		log.error('Missing securityToken configuration parameter');
		return null;
	}
	
	return perfectoConfig.securityToken;
}

function getTunnelId(perfectoConfig, securityToken, perfectoUrl){

	var tunnelId = process.env.PERFECTO_TUNNEL_ID;

	if (tunnelId){
		log.info ('Extracting tunnel id %s from environment variable PERFECTO_TUNNEL_ID', tunnelId);
		return tunnelId;
	}
	log.info('No PERFECTO_TUNNEL_ID environment variable');

	tunnelId = perfectoConfig.tunnelId;
	if (tunnelId){
		log.info ('Extracting tunnel id %s from configuration parameter tunnelId', tunnelId);
		return tunnelId;
	}
	log.info('No tunnelId configuration parameter');
	
	log.info('Starting perfectoconnect');

	perfectoConnect = perfectoConfig.perfectoConnect;
	if(!perfectoConnect){
		log.info('No perfectoConnect configured. using default');
		perfectoConnect = 'perfectoconnect';	
	}else
		log.info('Using perfectoConnect configuration %s',perfectoConnect);

	var host = url.parse(perfectoUrl).host;

	var cmd = perfectoConnect + ' start -c ' + host + ' -s ' + securityToken;

	log.info('Sarting tunnel. executing ' + cmd);
	
	var stdout;

	try{	
		stdout = child_process.execSync(cmd).toString();
	} catch (e) {
		log.error('Error staring tunnel:' + e);
		return null;
	}

	if (!stdout){
		log.error('Error starting tunnel.');
		return null;
	}

	perfectoDisconnect = true;

	process.on('exit', (code) => {
		closeTunnel();
	});

	out = stdout.trim();
	words = out.split(' ');
	return words[words.length - 1];
}

function closeTunnel(){
	if (perfectoDisconnect){
		log.info('Closing tunnel');
		perfectoDisconnect = false;
		try {
			var cmd = perfectoConnect + ' stop';
			child_process.execSync(cmd);
		} catch (e) {

		}
	}
}

function quitDriver(id) {
	log.info ('Terminating driver %s', id);
	try {
		var driver = getDriverData(id).driver;
		driverDataMap.delete(id);
		return driver.quit();
	} catch (e) {
		log.error('Error terminating driver');
		log.error(e);
	}
}

module.exports.quitDriver = quitDriver;

module.exports.PerfectoBrowser = function PerfectoBrowser(baseLauncherDecorator, captureTimeoutLauncherDecorator, retryLauncherDecorator, logger, config, args) {

	baseLauncherDecorator(this);
	captureTimeoutLauncherDecorator(this);
	retryLauncherDecorator(this);

	log = logger.create('perfecto-launcher');

	function error(self) {

		self._done('failure');
	}

	this.name = 'Perfecto';


	this.on('start', function(karmaUrl) {

		// perfecto main configuration	
		perfectoConfig = config.perfecto;
		if (!perfectoConfig){
			log.error('Missing perfecto configuration section');
			error(this);
			return;
		}

		// host	
		const host = getHost(perfectoConfig);
		if (host == null){
			log.error('Cannot determine local host');
			error(this);
			return;
		}
		log.info('Using host [%s]', host);

		// perfecto server url	
		const perfectoUrl = getPerfectoUrl(perfectoConfig);
		if (perfectoUrl == null){
			error(this);
			return;
		}

		log.info('Using perfectoUrl [%s]', perfectoUrl);

		// security token	
		const securityToken = getSecurityToken(perfectoConfig);
		if (securityToken == null){
			error(this);
			return;
		}

		log.info('Using securityToken [%s]', securityToken);

		// tunnelId;
		if (tunnelId == null)
			tunnelId = getTunnelId(perfectoConfig, securityToken, perfectoUrl);

		if (tunnelId == null){
			error(this);
			return;
		}
		
		log.info('Using tunnelId [%s]', tunnelId);
		
		var tunnelIdCap;
		if (tunnelId == 'none' )
			tunnelIdCap={};
		else
			tunnelIdCap={'tunnelId' : tunnelId};

		var securityTokenCap = {
			'securityToken' : securityToken,
		}

		if (!perfectoConfig.capabilities)
			perfectoConfig.capabilities={};

		var capabilities = Object.assign({}, tunnelIdCap, securityTokenCap, args.capabilities, perfectoConfig.capabilities);

		log.info(capabilities);

		setupKeepAlive(perfectoConfig);

		try{
			var parsed = url.parse(karmaUrl, true);
			parsed.host = host + ':' + parsed.port;
			karmaUrl = url.format(parsed);
			log.info('URL %s', karmaUrl);

			const driver = new webdriver.Builder()
				.withCapabilities(capabilities)
				.usingServer(perfectoUrl)
				.build();

			driver.get(karmaUrl).then(getDriverData(this.id).driver = driver);

		}catch (e) {
			log.error(e);
			error(this);
		}
	});

	this.on('kill', function(done) {

		// If we are not running in single run mode, we always close here.
		// If we do not have a reporter, we always close here.
		if (!haveReporter(config) || !config.singleRun){
			// There is a reporter runnung.The reporter will close it.
			quitDriver(this.id).then(function(){done()});


		}else{
			// We have a reporter and we are in single run mode. The reporter will do the closing.
			log.info('Reporter registered. Not quitting driver %s', this.id);
			done();
		}
	});

}

