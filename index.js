var PerfectoBrowser =  require('./launcher.js').PerfectoBrowser;
var PerfectoReporter =  require('./reporter.js').PerfectoReporter;


module.exports = { 
'launcher:Perfecto': ['type', PerfectoBrowser],
'reporter:Perfecto': ['type', PerfectoReporter]
}; 
