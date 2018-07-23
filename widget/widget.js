
/**
 * Default map configuration (for demo purposes, if none is specified).
 */
var demoConfig = {
    title: "Demo hxlmap (Mali conflict locations and 3W)",
    layers: [
        {
            name: "ACLED conflict heat map",
            url: "https://data.humdata.org/dataset/acled-data-for-mali",
            unit: "incidents",
            type: "heat"
        },
        {
            name: "Mali 3W",
            url: "https://data.humdata.org/dataset/d7ab89e4-bcb2-4127-be3c-5e8cf804ffd3/resource/b8f708da-e596-456c-b550-f88959970d21/download/mali_3wop_decembre-2017.xls",
            unit: "3W activities"
        }
    ]
}


/**
 * The HXL map object.
 */
var hxlmap = null;


/**
 * Look up a GET parameter from the URI query string
 * @param {string} name - the parameter name.
 * @returns - the parameter value, or null if not present.
 */
function getParameterByName(name) {
    var url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}


// Load the map
window.onload = function () {
    var config;

    // Do we have a ?config= parameter?
    var configString = getParameterByName("config");
    if (configString) {
        config = JSON.parse(configString);
    } else {
        console.log("No ?config= parameter specified. Showing demo map.");
        config = demoConfig;
    }

    if (config.title) {
        document.title = config.title;
    }
    var demo_map = new hxlmaps.Map("map", config);
}    

