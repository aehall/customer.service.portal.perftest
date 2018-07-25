# JMeter Load Test POC for Customer Service Portal API
## 1. Get Prerequisites
- [JMeter](https://jmeter.apache.org/download_jmeter.cgi)
- [Lightning](http://automatictester.github.io/lightning/standalone_jar.html)

## 2. Set Up Your Test
### JMeter UI
You can use the JMeter UI to set up an API load test in just a few minutes. For a tutorial, [click here](https://www.blazemeter.com/blog/rest-api-testing-how-to-do-it-right "click here"). Here are some things to know:
- A user is referred to as a **thread**. A group of users is a **thread group**. When you create a test, you essentially create a thread group that simulates the exercise of your application by multiple users.
- To add a test against an HTTP method (e.g., GET /workitems), you add an HTTP Request **sampler** . In it, you can define your protocol, server name/IP, port, HTTP method, path, encoding, header params, and body data. But, if there are headers that should be used for all HTTP requests in your test, you can instead use the...
- **HTTP Header Manager**.  You might want to use this for the Content-Type=application/json header, for example.
- If you want to make sure each request has a particular response, you can add a **Response Assertion**. In this POC test, I added an assertion to make sure each response was 200.
- To view the results of a test run within JMeter, you can add the **View Results Tree** to your test.

### Data-Drive Your Test
You can use CSV files to data-drive your load tests. For a tutorial, [click here](https://www.blazemeter.com/blog/advanced-load-testing-scenarios-jmeter-part-2-data-driven-testing-and-assertions "click here"). Here's a crash course:

1. Create a CSV file with the columns and data you want to use. 
2. In JMeter, right-click the test name, and select **Add > Config Element > CSV Data Set Config**.
3. Enter the file name, field names, etc.
4. Save your test.
5. In your test, substitute hardcoded values with the names of fields in your CSV file like this: **$(fieldName)**. For example, the POC test in this repo uses a variable in the API query string: **/api/workitems?customerCode=${CustomerCode}**
6. Run your test, and the CSV values should be substituted correctly.

## 3. Configure CI/CD Pipeline
### Run JMeter Tests from the Command Line
To run a JMeter test on the command line, call jmeter.bat (or .sh if in Linux), and include the following params:

#### JMeter Command Line Parameters
* **-n**: runs JMeter in non-GUI mode.
* **-t path/to/test/file**: the location of your JMeter test file.
* **-q path/to/config/file**: the location of your jmeter.properies.xml config file.
* **-l path/to/output/report**: the path to the JMeter output report. The format is specified in the **jmeter.properties.xml config** file. (CSV should be used so Lightning can analyze the results and make a CI-friendly report.) NOTE: The JMeter output report file can't already exist, so you'll have to increment file numbers. This will be important for running the tests from ou CI/CD. (We can attach build numbers to the file names.)
* **-e**: instructs JMeter to create an output report (HTML) directly after the load test completes.
* **-o path/to/HTML/report/dir**: the path where you want to create the directory for the HTML report. NOTE: The directory can't already exist, so you'll have to increment the directory name. This will be important for running the tests from our CI/CD tool. (We can attach build numbers to the directory names.)

**Example:**
`jmeter.bat -n -t C:\Source\customer-portal-service.perftest\WorkItemsLoadTest.jmx -q C:\Source\customer-portal-service.perftest\jmeter.properties.xml -l C:\temp\portal-perf-results.csv -e -o C:\temp\portal-perf-results`

NOTE: If you haven't added JMeter to your system path, you'll need to run jmeter.bat from within its containing directory.

### Transform JMeter Results to JUnit Format
While some human judgment should be used when interpreting load test results (hence the pretty HTML report created via the command line step above), we still want the option for our CI/CD tool (i.e., Jenkins) to be able to pass or fail a build based on these results. To do that, we can use a tool called [Lightning](http://automatictester.github.io/lightning/standalone_jar.html "Lightning") to transform JMeter results into the more easily parseable JUnit format. Here's how we can use Lightning via the command line to create JUnit results:
**Example:**

`java -jar lightning-standalone-5.4.0.jar verify -xml C:\Source\customer-portal-service.perftest\lightning-config.xml --jmeter-csv C:\temp\portal-perf-results.csv`

The JUnit results should appear in the same folder as the lightning jar.

### Run JUnit Parser Against JUnit Results
Jenkins (and other CI/CD tools) have JUnit Parser plugins that can successfully parse the JMeter JUnit results and produce a pass/fail result for the build pipeline.
