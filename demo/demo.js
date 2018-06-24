var data_urls = [
    "http://ourairports.com/countries/SN/airports.hxl",
    "http://ourairports.com/countries/GN/airports.hxl",
    "http://ourairports.com/countries/SL/airports.hxl",
    "http://ourairports.com/countries/LR/airports.hxl",
    "http://ourairports.com/countries/ML/airports.hxl",
    "http://ourairports.com/countries/CV/airports.hxl",
    "http://ourairports.com/countries/GW/airports.hxl"
];

hxlmap.setup("mapid");


data_urls.forEach(function(data_url) {
    hxlmap.addHXL(data_url);
});



