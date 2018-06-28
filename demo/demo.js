var demo_layers = [
    {
        name: "Mali airports",
        url: "http://ourairports.com/countries/ML/airports.hxl",
        type: "points",
        cluster: false
    },
    {
        name: "Mali 3W",
        url: "https://data.humdata.org/dataset/d7ab89e4-bcb2-4127-be3c-5e8cf804ffd3/resource/b8f708da-e596-456c-b550-f88959970d21/download/mali_3wop_decembre-2017.xls",
        type: "areas",
        aggregation: "count",
        adminLevel: "#adm1",
        country: "MLI",
        colorMap: [
            { percentage: 0.0, color: { r: 0xff, g: 0xff, b: 0xff } },
            { percentage: 1.0, color: { r: 0x00, g: 0x00, b: 0xff } }
        ]
    }
];

var demo_map = new hxlmaps.Map("map");

demo_layers.forEach(function(layer) {
    console.log("Adding", layer.url);
    demo_map.addLayer(layer);
});
