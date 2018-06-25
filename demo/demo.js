var layers = [
    {
        url: "http://ourairports.com/countries/ML/airports.hxl",
        type: "points"
    },
    {
        url: "https://data.humdata.org/dataset/d7ab89e4-bcb2-4127-be3c-5e8cf804ffd3/resource/b8f708da-e596-456c-b550-f88959970d21/download/mali_3wop_decembre-2017.xls",
        type: "areas",
        country: "MLI"
    }
];

hxlmap.setup("mapid");

layers.forEach(function(layer) {
    console.log("Adding", layer.url);
    hxlmap.addLayer(layer);
});



