# JMeter Tests for the Customer Service Portal API 

## Running the Tests via Command Line
This is how Jenkins will run the tests. To run this test on the command line, call jmeter.bat (or .sh if in Linux), and include the following params:

### Parameters
* __-n__: runs JMeter in non-GUI mode.
* __-t path/to/test/file__: the location of your JMeter test file.
* __-q path/to/config/file__: the location of your jmeter.properies.xml config file.
* __-l path/to/output/report__: the path to the JMeter output report. The format is specified in the jmeter.properties.xml config file. (CSV should be used so Lightning can analyze the results and make a CI-friendly report.) NOTE: This file can't already exist, so you'll have to increment file numbers. This will be important for running the tests from Jenkins. (We can attach build numbers to the file names.)
* __-e__: instructs JMeter to create an output report (HTML) directly after the load test completes.
* __-o path/to/HTML/report/dir__: the path where you want to create the directory for the HTML report. NOTE: The directory can't already exist, so you'll have to increment the directory name. This will be important for running the tests from Jenkins. (We can attach build numbers to the directory names.)

__Example:__
```
jmeter.bat -n -t C:\Source\customer-portal-service.perftest\WorkItemsLoadTest.jmx -q C:\Source\customer-portal-service.perftest\jmeter.properties.xml -l C:\temp\portal-perf-results.csv -e -o C:\temp\portal-perf-results
```

NOTE: If you haven't added JMeter to your system path, you'll need to run jmeter.bat from within its containing directory.

## Reporting for Humans
JMeter creates some basic reports (probaby everything we'll need for a microservice). Look in /example-report/index.html. The report can be added to a Jenkins pipeline via the Jenkins PublishHTML plugin.

## Reporting for Jenkins
Lightning is a tool that creates JUnit-style test reports from JMeter perf test results. Jenkins can use these to pass/fail a build pipeline.

After JMeter has outputted a CSV results file, you can run a standalone Lightning JAR that analyzes the results and produces a JUnit-style report for Jenkins: http://automatictester.github.io/lightning/standalone_jar.html

```
java -jar lightning-standalone-5.4.0.jar verify -xml C:\Source\customer-portal-service.perftest\lightning-config.xml --jmeter-csv C:\temp\portal-perf-results.csv
```

## Structure of the JMeter Test File
The JMeter test file (.jmx) is just a big XML file that contains the details of the test (as defined in the JMeter UI). (In this way, it's very similar to Visual Studio performance testing.)

## Input Data
You can use CSV files to data-drive your load tests. This test uses a CSV file with a single column defining the CustomerCode. You must specify the location of the CSV in the JMX file. Then, you can reference the variables with ${variableName}.
