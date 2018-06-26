var demo_layers = [
    {
        url: "http://ourairports.com/countries/ML/airports.hxl",
        type: "points",
        cluster: false
    },
    {
        url: "https://data.humdata.org/dataset/d7ab89e4-bcb2-4127-be3c-5e8cf804ffd3/resource/b8f708da-e596-456c-b550-f88959970d21/download/mali_3wop_decembre-2017.xls",
        type: "areas",
        country: "MLI"
    }
];

var demo_map = new hxlmaps.Map("mapid");

demo_layers.forEach(function(layer) {
    console.log("Adding", layer.url);
    demo_map.addLayer(layer);
});



