const webdriver = require('selenium-webdriver');
const url = require('url');
const encodeUrl = require('encodeurl');
const os = require('os');
const child_process = require('child_process');

var perfectoConnect;
var perfectoDisconnect = false;
var log;

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
		log.error('Error staring tunnel');
		return null;
	}

	if (!stdout){
		log.error('Error starting tunnel. %s', stdout)
		return null;
	}

	process.on('exit', (code) => {
		closeTunnel();
	});

	perfectoDisconnect = true;

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
	log.info ('terminating driver %s', id);
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

module.exports.PerfectoBrowser = function PerfectoBrowser(baseBrowserDecorator, logger, config, args) {

	log = logger.create('perfecto-launcher');

	// perfecto main configuration	
	perfectoConfig = config.perfecto;
	if (!perfectoConfig){
		log.error('Missing perfecto configuration section');
		return null;
	}

	// host	
	const host = getHost(perfectoConfig);
	if (host == null){
		log.error('Cannot determine local host');
		return null;
	}
	log.info('Using host [%s]', host);

	// perfecto server url	
	const perfectoUrl = getPerfectoUrl(perfectoConfig);
	if (perfectoUrl == null)
		return null;

	log.info('Using perfectoUrl [%s]', perfectoUrl);

	// security token	
	const securityToken = getSecurityToken(perfectoConfig);
	if (securityToken == null)
		return null;

	log.info('Using securityToken [%s]', securityToken);

	// tunnelId;
	if (tunnelId == null)
		tunnelId = getTunnelId(perfectoConfig, securityToken, perfectoUrl);

	if (tunnelId == null)
		return null;
	
	log.info('Using tunnelId [%s]', tunnelId);
	
	this.name = 'Perfecto';

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

	baseBrowserDecorator(this);

	this._start = function (karmaUrl) {

		try{
			var parsed = url.parse(karmaUrl, true);
			parsed.host = host + ':' + parsed.port;
			karmaUrl = url.format(parsed);
			log.info('URL %s', karmaUrl);

			const driver = new webdriver.Builder()
				.withCapabilities(capabilities)
				.usingServer(perfectoUrl)
				.build();

			getDriverData(this.id).driver = driver;
			driver.get(karmaUrl);

		}catch (e) {
			log.error(e);
		}
	};

	this.on('kill', function(done) {

		if (haveReporter(config)){
			// There is a reporter runnung. We should mark this driver so it will
			// quit when it is finished.
			log.info('Reporter registered. Not quitting driver %s', this.id);
			done();

		}else{
			if (!config.singleRun){
				quitDriver(this.id).then(function(){done()});
			}
		}
	});
}

