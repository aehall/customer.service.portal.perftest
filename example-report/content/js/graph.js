/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? -18000000 : 0;
        var yOffset = options.yaxis.mode === "time" ? -18000000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 122.0, "minX": 0.0, "maxY": 1724.0, "series": [{"data": [[0.0, 122.0], [0.1, 122.0], [0.2, 126.0], [0.3, 126.0], [0.4, 128.0], [0.5, 128.0], [0.6, 128.0], [0.7, 131.0], [0.8, 131.0], [0.9, 131.0], [1.0, 137.0], [1.1, 137.0], [1.2, 137.0], [1.3, 137.0], [1.4, 137.0], [1.5, 137.0], [1.6, 140.0], [1.7, 140.0], [1.8, 142.0], [1.9, 142.0], [2.0, 142.0], [2.1, 142.0], [2.2, 143.0], [2.3, 143.0], [2.4, 143.0], [2.5, 149.0], [2.6, 149.0], [2.7, 151.0], [2.8, 151.0], [2.9, 153.0], [3.0, 153.0], [3.1, 158.0], [3.2, 158.0], [3.3, 159.0], [3.4, 159.0], [3.5, 160.0], [3.6, 160.0], [3.7, 161.0], [3.8, 161.0], [3.9, 161.0], [4.0, 161.0], [4.1, 162.0], [4.2, 162.0], [4.3, 162.0], [4.4, 162.0], [4.5, 164.0], [4.6, 164.0], [4.7, 164.0], [4.8, 164.0], [4.9, 164.0], [5.0, 164.0], [5.1, 166.0], [5.2, 166.0], [5.3, 166.0], [5.4, 166.0], [5.5, 167.0], [5.6, 167.0], [5.7, 167.0], [5.8, 167.0], [5.9, 167.0], [6.0, 167.0], [6.1, 168.0], [6.2, 168.0], [6.3, 168.0], [6.4, 168.0], [6.5, 169.0], [6.6, 169.0], [6.7, 169.0], [6.8, 169.0], [6.9, 170.0], [7.0, 170.0], [7.1, 170.0], [7.2, 170.0], [7.3, 172.0], [7.4, 172.0], [7.5, 172.0], [7.6, 172.0], [7.7, 173.0], [7.8, 173.0], [7.9, 173.0], [8.0, 173.0], [8.1, 175.0], [8.2, 175.0], [8.3, 175.0], [8.4, 175.0], [8.5, 175.0], [8.6, 175.0], [8.7, 176.0], [8.8, 176.0], [8.9, 176.0], [9.0, 176.0], [9.1, 176.0], [9.2, 176.0], [9.3, 177.0], [9.4, 177.0], [9.5, 178.0], [9.6, 178.0], [9.7, 178.0], [9.8, 178.0], [9.9, 178.0], [10.0, 178.0], [10.1, 179.0], [10.2, 179.0], [10.3, 179.0], [10.4, 179.0], [10.5, 180.0], [10.6, 180.0], [10.7, 180.0], [10.8, 180.0], [10.9, 181.0], [11.0, 181.0], [11.1, 181.0], [11.2, 181.0], [11.3, 182.0], [11.4, 182.0], [11.5, 182.0], [11.6, 182.0], [11.7, 182.0], [11.8, 182.0], [11.9, 182.0], [12.0, 182.0], [12.1, 182.0], [12.2, 182.0], [12.3, 183.0], [12.4, 183.0], [12.5, 183.0], [12.6, 183.0], [12.7, 183.0], [12.8, 183.0], [12.9, 183.0], [13.0, 183.0], [13.1, 183.0], [13.2, 183.0], [13.3, 184.0], [13.4, 184.0], [13.5, 184.0], [13.6, 184.0], [13.7, 185.0], [13.8, 185.0], [13.9, 185.0], [14.0, 185.0], [14.1, 185.0], [14.2, 185.0], [14.3, 185.0], [14.4, 185.0], [14.5, 185.0], [14.6, 185.0], [14.7, 186.0], [14.8, 186.0], [14.9, 188.0], [15.0, 188.0], [15.1, 189.0], [15.2, 189.0], [15.3, 189.0], [15.4, 189.0], [15.5, 190.0], [15.6, 190.0], [15.7, 190.0], [15.8, 190.0], [15.9, 191.0], [16.0, 191.0], [16.1, 191.0], [16.2, 191.0], [16.3, 191.0], [16.4, 191.0], [16.5, 192.0], [16.6, 193.0], [16.7, 193.0], [16.8, 193.0], [16.9, 193.0], [17.0, 194.0], [17.1, 194.0], [17.2, 194.0], [17.3, 194.0], [17.4, 195.0], [17.5, 195.0], [17.6, 195.0], [17.7, 195.0], [17.8, 195.0], [17.9, 195.0], [18.0, 196.0], [18.1, 196.0], [18.2, 196.0], [18.3, 196.0], [18.4, 196.0], [18.5, 196.0], [18.6, 196.0], [18.7, 196.0], [18.8, 197.0], [18.9, 197.0], [19.0, 197.0], [19.1, 197.0], [19.2, 197.0], [19.3, 197.0], [19.4, 197.0], [19.5, 198.0], [19.6, 198.0], [19.7, 198.0], [19.8, 198.0], [19.9, 198.0], [20.0, 198.0], [20.1, 199.0], [20.2, 199.0], [20.3, 199.0], [20.4, 199.0], [20.5, 199.0], [20.6, 199.0], [20.7, 199.0], [20.8, 199.0], [20.9, 199.0], [21.0, 199.0], [21.1, 199.0], [21.2, 199.0], [21.3, 200.0], [21.4, 200.0], [21.5, 200.0], [21.6, 200.0], [21.7, 200.0], [21.8, 200.0], [21.9, 200.0], [22.0, 200.0], [22.1, 201.0], [22.2, 201.0], [22.3, 201.0], [22.4, 201.0], [22.5, 201.0], [22.6, 201.0], [22.7, 202.0], [22.8, 202.0], [22.9, 202.0], [23.0, 202.0], [23.1, 202.0], [23.2, 202.0], [23.3, 202.0], [23.4, 202.0], [23.5, 203.0], [23.6, 203.0], [23.7, 203.0], [23.8, 203.0], [23.9, 203.0], [24.0, 203.0], [24.1, 203.0], [24.2, 203.0], [24.3, 203.0], [24.4, 203.0], [24.5, 204.0], [24.6, 204.0], [24.7, 204.0], [24.8, 204.0], [24.9, 204.0], [25.0, 204.0], [25.1, 204.0], [25.2, 204.0], [25.3, 204.0], [25.4, 204.0], [25.5, 204.0], [25.6, 204.0], [25.7, 205.0], [25.8, 205.0], [25.9, 206.0], [26.0, 206.0], [26.1, 206.0], [26.2, 206.0], [26.3, 206.0], [26.4, 206.0], [26.5, 206.0], [26.6, 206.0], [26.7, 206.0], [26.8, 206.0], [26.9, 208.0], [27.0, 208.0], [27.1, 208.0], [27.2, 208.0], [27.3, 208.0], [27.4, 208.0], [27.5, 209.0], [27.6, 209.0], [27.7, 209.0], [27.8, 209.0], [27.9, 209.0], [28.0, 209.0], [28.1, 209.0], [28.2, 209.0], [28.3, 209.0], [28.4, 209.0], [28.5, 210.0], [28.6, 210.0], [28.7, 210.0], [28.8, 210.0], [28.9, 210.0], [29.0, 210.0], [29.1, 210.0], [29.2, 210.0], [29.3, 210.0], [29.4, 210.0], [29.5, 210.0], [29.6, 210.0], [29.7, 210.0], [29.8, 210.0], [29.9, 211.0], [30.0, 211.0], [30.1, 213.0], [30.2, 213.0], [30.3, 213.0], [30.4, 213.0], [30.5, 213.0], [30.6, 213.0], [30.7, 213.0], [30.8, 213.0], [30.9, 213.0], [31.0, 213.0], [31.1, 213.0], [31.2, 213.0], [31.3, 214.0], [31.4, 214.0], [31.5, 214.0], [31.6, 214.0], [31.7, 214.0], [31.8, 214.0], [31.9, 214.0], [32.0, 214.0], [32.1, 214.0], [32.2, 214.0], [32.3, 214.0], [32.4, 214.0], [32.5, 214.0], [32.6, 215.0], [32.7, 215.0], [32.8, 215.0], [32.9, 215.0], [33.0, 215.0], [33.1, 215.0], [33.2, 215.0], [33.3, 215.0], [33.4, 215.0], [33.5, 215.0], [33.6, 215.0], [33.7, 215.0], [33.8, 215.0], [33.9, 216.0], [34.0, 216.0], [34.1, 216.0], [34.2, 216.0], [34.3, 216.0], [34.4, 216.0], [34.5, 216.0], [34.6, 216.0], [34.7, 216.0], [34.8, 216.0], [34.9, 216.0], [35.0, 216.0], [35.1, 217.0], [35.2, 217.0], [35.3, 217.0], [35.4, 217.0], [35.5, 217.0], [35.6, 217.0], [35.7, 217.0], [35.8, 217.0], [35.9, 218.0], [36.0, 218.0], [36.1, 218.0], [36.2, 218.0], [36.3, 218.0], [36.4, 218.0], [36.5, 218.0], [36.6, 219.0], [36.7, 219.0], [36.8, 219.0], [36.9, 219.0], [37.0, 219.0], [37.1, 219.0], [37.2, 219.0], [37.3, 219.0], [37.4, 219.0], [37.5, 219.0], [37.6, 219.0], [37.7, 219.0], [37.8, 219.0], [37.9, 220.0], [38.0, 220.0], [38.1, 220.0], [38.2, 220.0], [38.3, 220.0], [38.4, 220.0], [38.5, 220.0], [38.6, 220.0], [38.7, 220.0], [38.8, 220.0], [38.9, 220.0], [39.0, 220.0], [39.1, 221.0], [39.2, 221.0], [39.3, 221.0], [39.4, 221.0], [39.5, 221.0], [39.6, 221.0], [39.7, 222.0], [39.8, 222.0], [39.9, 223.0], [40.0, 223.0], [40.1, 223.0], [40.2, 223.0], [40.3, 223.0], [40.4, 223.0], [40.5, 223.0], [40.6, 223.0], [40.7, 223.0], [40.8, 223.0], [40.9, 224.0], [41.0, 224.0], [41.1, 224.0], [41.2, 224.0], [41.3, 224.0], [41.4, 224.0], [41.5, 224.0], [41.6, 224.0], [41.7, 225.0], [41.8, 225.0], [41.9, 225.0], [42.0, 225.0], [42.1, 226.0], [42.2, 226.0], [42.3, 226.0], [42.4, 226.0], [42.5, 227.0], [42.6, 227.0], [42.7, 227.0], [42.8, 227.0], [42.9, 227.0], [43.0, 227.0], [43.1, 227.0], [43.2, 227.0], [43.3, 227.0], [43.4, 227.0], [43.5, 227.0], [43.6, 227.0], [43.7, 228.0], [43.8, 228.0], [43.9, 228.0], [44.0, 228.0], [44.1, 228.0], [44.2, 228.0], [44.3, 228.0], [44.4, 228.0], [44.5, 228.0], [44.6, 228.0], [44.7, 229.0], [44.8, 229.0], [44.9, 230.0], [45.0, 230.0], [45.1, 230.0], [45.2, 230.0], [45.3, 230.0], [45.4, 230.0], [45.5, 231.0], [45.6, 231.0], [45.7, 231.0], [45.8, 231.0], [45.9, 231.0], [46.0, 231.0], [46.1, 231.0], [46.2, 231.0], [46.3, 232.0], [46.4, 232.0], [46.5, 232.0], [46.6, 232.0], [46.7, 233.0], [46.8, 233.0], [46.9, 233.0], [47.0, 233.0], [47.1, 233.0], [47.2, 233.0], [47.3, 233.0], [47.4, 233.0], [47.5, 234.0], [47.6, 234.0], [47.7, 234.0], [47.8, 234.0], [47.9, 234.0], [48.0, 234.0], [48.1, 234.0], [48.2, 235.0], [48.3, 235.0], [48.4, 235.0], [48.5, 235.0], [48.6, 235.0], [48.7, 235.0], [48.8, 235.0], [48.9, 235.0], [49.0, 235.0], [49.1, 235.0], [49.2, 236.0], [49.3, 236.0], [49.4, 236.0], [49.5, 237.0], [49.6, 237.0], [49.7, 237.0], [49.8, 237.0], [49.9, 238.0], [50.0, 238.0], [50.1, 239.0], [50.2, 239.0], [50.3, 239.0], [50.4, 239.0], [50.5, 239.0], [50.6, 239.0], [50.7, 239.0], [50.8, 239.0], [50.9, 240.0], [51.0, 240.0], [51.1, 240.0], [51.2, 240.0], [51.3, 240.0], [51.4, 240.0], [51.5, 240.0], [51.6, 241.0], [51.7, 241.0], [51.8, 241.0], [51.9, 241.0], [52.0, 241.0], [52.1, 241.0], [52.2, 241.0], [52.3, 241.0], [52.4, 241.0], [52.5, 241.0], [52.6, 242.0], [52.7, 242.0], [52.8, 242.0], [52.9, 243.0], [53.0, 243.0], [53.1, 243.0], [53.2, 243.0], [53.3, 243.0], [53.4, 243.0], [53.5, 244.0], [53.6, 244.0], [53.7, 244.0], [53.8, 244.0], [53.9, 244.0], [54.0, 244.0], [54.1, 245.0], [54.2, 245.0], [54.3, 245.0], [54.4, 245.0], [54.5, 246.0], [54.6, 246.0], [54.7, 246.0], [54.8, 246.0], [54.9, 246.0], [55.0, 246.0], [55.1, 246.0], [55.2, 246.0], [55.3, 246.0], [55.4, 246.0], [55.5, 246.0], [55.6, 246.0], [55.7, 247.0], [55.8, 247.0], [55.9, 247.0], [56.0, 247.0], [56.1, 247.0], [56.2, 247.0], [56.3, 247.0], [56.4, 247.0], [56.5, 247.0], [56.6, 247.0], [56.7, 248.0], [56.8, 248.0], [56.9, 248.0], [57.0, 248.0], [57.1, 248.0], [57.2, 248.0], [57.3, 249.0], [57.4, 249.0], [57.5, 249.0], [57.6, 249.0], [57.7, 249.0], [57.8, 249.0], [57.9, 250.0], [58.0, 250.0], [58.1, 250.0], [58.2, 250.0], [58.3, 250.0], [58.4, 250.0], [58.5, 250.0], [58.6, 250.0], [58.7, 251.0], [58.8, 251.0], [58.9, 251.0], [59.0, 251.0], [59.1, 252.0], [59.2, 252.0], [59.3, 252.0], [59.4, 252.0], [59.5, 253.0], [59.6, 253.0], [59.7, 253.0], [59.8, 253.0], [59.9, 253.0], [60.0, 253.0], [60.1, 253.0], [60.2, 253.0], [60.3, 253.0], [60.4, 253.0], [60.5, 254.0], [60.6, 254.0], [60.7, 254.0], [60.8, 254.0], [60.9, 254.0], [61.0, 254.0], [61.1, 254.0], [61.2, 254.0], [61.3, 254.0], [61.4, 254.0], [61.5, 255.0], [61.6, 255.0], [61.7, 255.0], [61.8, 255.0], [61.9, 255.0], [62.0, 255.0], [62.1, 256.0], [62.2, 256.0], [62.3, 256.0], [62.4, 256.0], [62.5, 256.0], [62.6, 256.0], [62.7, 257.0], [62.8, 257.0], [62.9, 257.0], [63.0, 257.0], [63.1, 258.0], [63.2, 258.0], [63.3, 258.0], [63.4, 258.0], [63.5, 259.0], [63.6, 259.0], [63.7, 259.0], [63.8, 259.0], [63.9, 259.0], [64.0, 260.0], [64.1, 260.0], [64.2, 260.0], [64.3, 260.0], [64.4, 260.0], [64.5, 260.0], [64.6, 260.0], [64.7, 260.0], [64.8, 260.0], [64.9, 260.0], [65.0, 260.0], [65.1, 260.0], [65.2, 261.0], [65.3, 261.0], [65.4, 261.0], [65.5, 261.0], [65.6, 261.0], [65.7, 262.0], [65.8, 262.0], [65.9, 262.0], [66.0, 262.0], [66.1, 264.0], [66.2, 264.0], [66.3, 265.0], [66.4, 265.0], [66.5, 265.0], [66.6, 265.0], [66.7, 265.0], [66.8, 265.0], [66.9, 265.0], [67.0, 265.0], [67.1, 266.0], [67.2, 266.0], [67.3, 266.0], [67.4, 266.0], [67.5, 266.0], [67.6, 266.0], [67.7, 267.0], [67.8, 267.0], [67.9, 268.0], [68.0, 268.0], [68.1, 268.0], [68.2, 268.0], [68.3, 268.0], [68.4, 269.0], [68.5, 269.0], [68.6, 269.0], [68.7, 269.0], [68.8, 269.0], [68.9, 269.0], [69.0, 269.0], [69.1, 269.0], [69.2, 270.0], [69.3, 270.0], [69.4, 270.0], [69.5, 270.0], [69.6, 270.0], [69.7, 270.0], [69.8, 271.0], [69.9, 271.0], [70.0, 271.0], [70.1, 271.0], [70.2, 272.0], [70.3, 272.0], [70.4, 272.0], [70.5, 272.0], [70.6, 272.0], [70.7, 272.0], [70.8, 273.0], [70.9, 273.0], [71.0, 273.0], [71.1, 273.0], [71.2, 273.0], [71.3, 273.0], [71.4, 273.0], [71.5, 273.0], [71.6, 274.0], [71.7, 274.0], [71.8, 274.0], [71.9, 274.0], [72.0, 274.0], [72.1, 274.0], [72.2, 274.0], [72.3, 274.0], [72.4, 274.0], [72.5, 274.0], [72.6, 275.0], [72.7, 275.0], [72.8, 275.0], [72.9, 275.0], [73.0, 275.0], [73.1, 275.0], [73.2, 275.0], [73.3, 275.0], [73.4, 275.0], [73.5, 275.0], [73.6, 277.0], [73.7, 277.0], [73.8, 277.0], [73.9, 277.0], [74.0, 277.0], [74.1, 277.0], [74.2, 277.0], [74.3, 277.0], [74.4, 278.0], [74.5, 278.0], [74.6, 278.0], [74.7, 278.0], [74.8, 278.0], [74.9, 278.0], [75.0, 279.0], [75.1, 279.0], [75.2, 279.0], [75.3, 279.0], [75.4, 279.0], [75.5, 279.0], [75.6, 279.0], [75.7, 279.0], [75.8, 280.0], [75.9, 280.0], [76.0, 280.0], [76.1, 280.0], [76.2, 282.0], [76.3, 282.0], [76.4, 282.0], [76.5, 282.0], [76.6, 284.0], [76.7, 284.0], [76.8, 284.0], [76.9, 284.0], [77.0, 285.0], [77.1, 285.0], [77.2, 287.0], [77.3, 287.0], [77.4, 287.0], [77.5, 287.0], [77.6, 287.0], [77.7, 287.0], [77.8, 288.0], [77.9, 288.0], [78.0, 288.0], [78.1, 288.0], [78.2, 290.0], [78.3, 290.0], [78.4, 290.0], [78.5, 290.0], [78.6, 290.0], [78.7, 292.0], [78.8, 292.0], [78.9, 292.0], [79.0, 292.0], [79.1, 292.0], [79.2, 293.0], [79.3, 293.0], [79.4, 293.0], [79.5, 293.0], [79.6, 293.0], [79.7, 294.0], [79.8, 294.0], [79.9, 295.0], [80.0, 295.0], [80.1, 297.0], [80.2, 297.0], [80.3, 297.0], [80.4, 297.0], [80.5, 297.0], [80.6, 297.0], [80.7, 297.0], [80.8, 297.0], [80.9, 302.0], [81.0, 302.0], [81.1, 302.0], [81.2, 302.0], [81.3, 303.0], [81.4, 303.0], [81.5, 304.0], [81.6, 304.0], [81.7, 305.0], [81.8, 305.0], [81.9, 306.0], [82.0, 306.0], [82.1, 307.0], [82.2, 307.0], [82.3, 309.0], [82.4, 309.0], [82.5, 309.0], [82.6, 309.0], [82.7, 309.0], [82.8, 309.0], [82.9, 309.0], [83.0, 309.0], [83.1, 312.0], [83.2, 312.0], [83.3, 312.0], [83.4, 312.0], [83.5, 313.0], [83.6, 313.0], [83.7, 313.0], [83.8, 313.0], [83.9, 313.0], [84.0, 313.0], [84.1, 314.0], [84.2, 314.0], [84.3, 314.0], [84.4, 314.0], [84.5, 315.0], [84.6, 315.0], [84.7, 317.0], [84.8, 317.0], [84.9, 317.0], [85.0, 317.0], [85.1, 320.0], [85.2, 320.0], [85.3, 320.0], [85.4, 320.0], [85.5, 321.0], [85.6, 321.0], [85.7, 321.0], [85.8, 321.0], [85.9, 322.0], [86.0, 322.0], [86.1, 323.0], [86.2, 323.0], [86.3, 324.0], [86.4, 324.0], [86.5, 328.0], [86.6, 328.0], [86.7, 329.0], [86.8, 329.0], [86.9, 330.0], [87.0, 330.0], [87.1, 331.0], [87.2, 331.0], [87.3, 334.0], [87.4, 334.0], [87.5, 335.0], [87.6, 335.0], [87.7, 336.0], [87.8, 336.0], [87.9, 337.0], [88.0, 337.0], [88.1, 338.0], [88.2, 338.0], [88.3, 339.0], [88.4, 339.0], [88.5, 339.0], [88.6, 339.0], [88.7, 340.0], [88.8, 340.0], [88.9, 341.0], [89.0, 341.0], [89.1, 341.0], [89.2, 341.0], [89.3, 344.0], [89.4, 344.0], [89.5, 344.0], [89.6, 344.0], [89.7, 346.0], [89.8, 346.0], [89.9, 347.0], [90.0, 347.0], [90.1, 350.0], [90.2, 350.0], [90.3, 351.0], [90.4, 351.0], [90.5, 353.0], [90.6, 353.0], [90.7, 356.0], [90.8, 356.0], [90.9, 362.0], [91.0, 362.0], [91.1, 363.0], [91.2, 363.0], [91.3, 388.0], [91.4, 388.0], [91.5, 389.0], [91.6, 389.0], [91.7, 394.0], [91.8, 394.0], [91.9, 402.0], [92.0, 402.0], [92.1, 408.0], [92.2, 408.0], [92.3, 410.0], [92.4, 410.0], [92.5, 412.0], [92.6, 412.0], [92.7, 414.0], [92.8, 414.0], [92.9, 419.0], [93.0, 419.0], [93.1, 426.0], [93.2, 426.0], [93.3, 435.0], [93.4, 435.0], [93.5, 449.0], [93.6, 449.0], [93.7, 453.0], [93.8, 453.0], [93.9, 454.0], [94.0, 454.0], [94.1, 462.0], [94.2, 462.0], [94.3, 466.0], [94.4, 466.0], [94.5, 471.0], [94.6, 471.0], [94.7, 474.0], [94.8, 474.0], [94.9, 480.0], [95.0, 480.0], [95.1, 499.0], [95.2, 499.0], [95.3, 502.0], [95.4, 502.0], [95.5, 509.0], [95.6, 509.0], [95.7, 538.0], [95.8, 538.0], [95.9, 547.0], [96.0, 547.0], [96.1, 569.0], [96.2, 569.0], [96.3, 572.0], [96.4, 572.0], [96.5, 647.0], [96.6, 647.0], [96.7, 655.0], [96.8, 655.0], [96.9, 767.0], [97.0, 767.0], [97.1, 782.0], [97.2, 782.0], [97.3, 871.0], [97.4, 871.0], [97.5, 926.0], [97.6, 926.0], [97.7, 951.0], [97.8, 951.0], [97.9, 983.0], [98.0, 983.0], [98.1, 1065.0], [98.2, 1065.0], [98.3, 1076.0], [98.4, 1076.0], [98.5, 1080.0], [98.6, 1080.0], [98.7, 1182.0], [98.8, 1182.0], [98.9, 1206.0], [99.0, 1206.0], [99.1, 1363.0], [99.2, 1363.0], [99.3, 1471.0], [99.4, 1471.0], [99.5, 1477.0], [99.6, 1477.0], [99.7, 1668.0], [99.8, 1668.0], [99.9, 1724.0], [100.0, 1724.0]], "isOverall": false, "label": "GET /workitems", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 298.0, "series": [{"data": [[600.0, 2.0], [700.0, 2.0], [200.0, 298.0], [800.0, 1.0], [900.0, 3.0], [1000.0, 3.0], [1100.0, 1.0], [1200.0, 1.0], [300.0, 55.0], [1300.0, 1.0], [1400.0, 2.0], [100.0, 106.0], [1600.0, 1.0], [400.0, 17.0], [1700.0, 1.0], [500.0, 6.0]], "isOverall": false, "label": "GET /workitems", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1700.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 2.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 476.0, "series": [{"data": [[1.0, 22.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 476.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 4.846774193548388, "minX": 1.53246744E12, "maxY": 4.960937500000001, "series": [{"data": [[1.5324675E12, 4.846774193548388], [1.53246744E12, 4.960937500000001]], "isOverall": false, "label": "WorkItems Load Test", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5324675E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -18000000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 189.83333333333334, "minX": 1.0, "maxY": 292.0, "series": [{"data": [[2.0, 292.0], [4.0, 189.83333333333334], [1.0, 269.5], [5.0, 280.38297872340416], [3.0, 262.16666666666663]], "isOverall": false, "label": "GET /workitems", "isController": false}, {"data": [[4.875999999999996, 278.6899999999997]], "isOverall": false, "label": "GET /workitems-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 5.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 394.6666666666667, "minX": 1.53246744E12, "maxY": 15118.316666666668, "series": [{"data": [[1.5324675E12, 15118.316666666668], [1.53246744E12, 5205.216666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5324675E12, 1147.0], [1.53246744E12, 394.6666666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5324675E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -18000000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 252.7741935483868, "minX": 1.53246744E12, "maxY": 354.00781250000006, "series": [{"data": [[1.5324675E12, 252.7741935483868], [1.53246744E12, 354.00781250000006]], "isOverall": false, "label": "GET /workitems", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5324675E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -18000000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 241.06720430107524, "minX": 1.53246744E12, "maxY": 329.01562499999994, "series": [{"data": [[1.5324675E12, 241.06720430107524], [1.53246744E12, 329.01562499999994]], "isOverall": false, "label": "GET /workitems", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5324675E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -18000000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 0.12365591397849461, "minX": 1.53246744E12, "maxY": 0.6250000000000006, "series": [{"data": [[1.5324675E12, 0.12365591397849461], [1.53246744E12, 0.6250000000000006]], "isOverall": false, "label": "GET /workitems", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5324675E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -18000000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 122.0, "minX": 1.53246744E12, "maxY": 1724.0, "series": [{"data": [[1.5324675E12, 1471.0], [1.53246744E12, 1724.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5324675E12, 126.0], [1.53246744E12, 122.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5324675E12, 349.7000000000001], [1.53246744E12, 876.5000000000005]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5324675E12, 1361.4300000000014], [1.53246744E12, 1707.7599999999998]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5324675E12, 498.0499999999998], [1.53246744E12, 1136.0999999999997]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5324675E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -18000000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 233.0, "minX": 2.0, "maxY": 240.0, "series": [{"data": [[2.0, 233.0], [6.0, 240.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 6.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 214.5, "minX": 2.0, "maxY": 227.0, "series": [{"data": [[2.0, 214.5], [6.0, 227.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 6.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 2.216666666666667, "minX": 1.53246744E12, "maxY": 6.116666666666666, "series": [{"data": [[1.5324675E12, 6.116666666666666], [1.53246744E12, 2.216666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5324675E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -18000000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 2.1333333333333333, "minX": 1.53246744E12, "maxY": 6.2, "series": [{"data": [[1.5324675E12, 6.2], [1.53246744E12, 2.1333333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5324675E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -18000000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 2.1333333333333333, "minX": 1.53246744E12, "maxY": 6.2, "series": [{"data": [[1.5324675E12, 6.2], [1.53246744E12, 2.1333333333333333]], "isOverall": false, "label": "GET /workitems-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5324675E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -18000000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
