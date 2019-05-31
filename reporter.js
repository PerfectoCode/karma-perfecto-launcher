var reporting = require('perfecto-reporting');
var getDriverData = require('./launcher.js').getDriverData;
var quitDriver = require('./launcher.js').quitDriver;
var log;

class Entry {
	constructor(result, status){
		this.result = result;
		this.status = status;
	}
};

class BrowserLog {
	constructor(){
		this.entries = [];
	}
};

class LogData{
	constructor(){
		this.browserLog = null;
		this.reportingClient = null;
		this.success = true;
	}
};

var logMap = new Map();

function getLogData(id){
	logData = logMap.get(id);
	
	if (logData)
		return logData;

	logData = new LogData();

	logMap.set(id, logData);

	return logData;
}



function addResult(id, result, status){

	logData = getLogData(id);

	if (!logData.browserLog){
		logData.browserLog = new BrowserLog();
	}

	logData.browserLog.entries.push(new Entry (result, status));
}

unction setupReportingClient(id, config){

	log.info('initializing reporter for %s', id);

	const webDriver = getDriverData(id).driver;

	var jobDetailMap = {};

	var jobName = process.env.PERFECTO_JOB_NAME;
	var jobNumber = process.env.PERFECTO_JOB_NUMBER;

	if (!jobName && (config.perfecto && config.perfecto.jobName))
		jobName = config.perfecto.jobName;

	if (!jobNumber && (config.perfecto && config.perfecto.jobNumber))
		jobNumber = config.perfecto.jobNumber

	if(jobName){
		jobDetailMap.jobName = jobName;
	}

	if(jobNumber){
		try{
			jobDetailMap.buildNumber = parseInt(jobNumber);
		}catch(err){
			log.info("Error while converting job number to number. Err - " + err);
		}
	}
	

	var jobDetails = new reporting.Model.Job(jobDetailMap);

	const perfectoExecutionContext = new reporting.Perfecto.PerfectoExecutionContext({
		webdriver:webDriver,
		job: jobDetails
	});

	getLogData(id).reportingClient = new reporting.Perfecto.PerfectoReportingClient(perfectoExecutionContext);

	getDriverData(id).quit = false;
}


function finish(id){

	if (getDriverData(id).reporterShouldQuit)
		return quitDriver(id);

	log.info("Not quitting driver");

	return null;
}

module.exports.PerfectoReporter = function perfectoReporting(baseReporterDecorator, logger, config){

	log = logger.create('perfecto-reporter');

	baseReporterDecorator(this);

	this.onBrowserStart = function (browser){
		setupReportingClient(browser.id, config);
	}


	async function complete(){

		var testPerSpec;
		
		if (config.perfecto && config.perfecto.testPerSpec)
			testPerSpec = true;
		else
			testPerSpec = false;

		testName = config.perfecto.testName ? config.perfecto.testName : 'Unknown';

		for (var [id, logData] of logMap.entries()){
			
			try {
				var browserLog = logData.browserLog;
				
				var reportingClient = logData.reportingClient;

				log.info('Starting test log for %s', id);

				// trust me, this might happen if we didn't close a previous driver properly			
				if (!reportingClient){
					log.warn('invalid id');
					continue;
				}

				if (browserLog && browserLog.entries) {			
					if (!testPerSpec){				
						await reportingClient.testStart(testName + ':' + id, new reporting.Perfecto.PerfectoTestContext());

						for (var i = 0; i < browserLog.entries.length; i++){
							entry = browserLog.entries[i];
							log.info('%s:%s: [%s] [%s]',id, entry.status ? 'Passed' : 'Failed', entry.result.suite.join(' '), entry.result.description);
							await reportingClient.stepStart(entry.result.suite.join(' ') + ' - ' + entry.result.description);
							await reportingClient.reportiumAssert(entry.result.description, entry.status);
							await reportingClient.stepEnd();

						}

						log.info('%s:test end %s', id, logData.success ? 'passes' : 'failed');

						if (logData.success)
							await reportingClient.testStop({status: reporting.passed});
						else
							await reportingClient.testStop({status: reporting.failed});
					} else {
						for (var i = 0; i < browserLog.entries.length; i++){
							entry = browserLog.entries[i];
							result = entry.result;
							log.info(`Starting test - ${result.fullName}`);

							await reportingClient.testStart(result.fullName, new reporting.Perfecto.PerfectoTestContext());

							if(result.success){
								await reportingClient.testStop({
						      			status: reporting.Constants.results.passed
						    		});
							}else{
								const failure = result.log.length > 0 ? result.log[result.log.length - 1] : "No Error Message provided!";
						    		var failedOptions = {
						      			status: reporting.Constants.results.failed,message: failure
						    		};
								await reportingClient.testStop(failedOptions);
							}
						}

					}

	            			p = finish(id);
					if (p)
						await p;



				}
			}catch(error) {
				// we do not want to pass the exception to the calling procedure
				// which may cause an endless loop but rather skip to the next item
				log.error(error);
			}

		}

		for (var [id, logData] of logMap.entries()){
			logMap.delete(id);
		}

	}

	var pending = [];

	this.onRunComplete = function(browsers, results){
		pending.push(complete());
	}

	this.onExit = function(done) {
		Promise.all(pending).then(() => {done();});
	};

	this.specFailure = function(browser, result) {
		addResult(browser.id, result, false);
		getLogData(browser.id).success = false;
	}

	this.specSuccess = function(browser, result) {
		addResult(browser.id, result, true);
	}
}

