var mapConfig = {
    title: "hxlmaps demo",
    layers: [
        {
            name: "ACLED conflict locations",
            url: "https://data.humdata.org/dataset/acled-data-for-nigeria",
            unit: "incidents",
            cluster: true
        },
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
 * Look up a GET parameter
 */
function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

var configString = getParameterByName("config");
var config;
if (configString) {
    config = JSON.parse(configString);
} else {
    console.log("Using default config");
    config = mapConfig;
}

if (config.title) {
    document.title = config.title;
}
var demo_map = new hxlmaps.Map("map", config);
    

