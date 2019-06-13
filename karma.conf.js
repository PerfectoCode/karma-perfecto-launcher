// sample configuration file

module.exports = function(config) {

const customLaunchers = {

  // We can run multiple browsers

  chrome72: {
    base: 'Perfecto',
    capabilities: {
	  platformName : 'Windows',
      platformVersion : '10',
      browserName : 'Chrome',
      browserVersion : '72',
      resolution : '1280x1024',
      location : 'US East'
    }
  },

  chrome71: {
    base: 'Perfecto',
    capabilities: {
	  platformName : 'Windows',
      platformVersion : '10',
      browserName : 'Chrome',
      browserVersion : '71',
      resolution : '1280x1024',
      location : 'US East'
    }
  },
};

  config.set({

    // It may take some time to initialize a connection
    captureTimeout: 120000,

    perfecto: {
		// Set if there is already a running tunnel.
		// The environment variable PERFECTO_TUNNEL_ID can be set instead.
		// If this parameter is not set, the launcher will start a new tunnel
		// If the value is 'none' then no tunnel is used.
		// OPTIONAL
		tunnelId: '',

		// The local hostname or host address.
		// If not set this value is determined automatically..
		// OPTIONAL
		host: '',

		// The full path of perfectoconnect binary.
		// If not set it is assumed that the binary is in the executable path
		// OPTIONAL
		perfectoConnect: '',

		// The Perfecto Cloud URL
		// MANDATORY
		perfectoUrl: '',

		// The security token
		// MANDATORY
		securityToken: '',

		// the name of the test for the report
		// OPTIONAL
		testName: '',

		// The job name.
		// The environment variable PERFECTO_JOB_NAME can be used instead.
		// OPTIONAL
		jobName: '',

		// The job number.
		// The environment variable PERFECTO_JOB_NUMBER can be used instead.
		// OPTIONAL
		jobNumber: '',


		// Enable/disable test per spec. If not set then false is assumed.
		// OPTIONAL
		testPerSpec: false,

		// Enable/disable compact logging where only failures are reported
		// If not set then false is assumed. This parameter is ignores when
		// testPerSpec = true.
		// OPTIONAL
		compactReport: false,

		// Timeout in msec between keep alives. Only required for long tests
		// where browsers may remain idel for a long period of time
		// OPTIONAL
		keepAlive: 0,

		// Place holder for capablities that apply for all browser
		// OPTIONAL
		capabilities: {
		}

    },

    browsers: ['Perfecto'],

    // This is the preferred method of execution.
    singleRun: true,

    customLaunchers: customLaunchers,
    browsers: Object.keys(customLaunchers),

    reporters: ['Perfecto']
  })
}
