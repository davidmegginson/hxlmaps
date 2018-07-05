// TODO add https://proxy.hxlstandard.org/data/fdfb82/download/mli-healthsites.csv (over 1,300 points)

var mapConfig = {
    title: "hxlmaps demo",
    layers: [
        {
            name: "ACLED conflict locations",
            url: "https://data.humdata.org/dataset/acled-data-for-mali",
            unit: "incidents",
            cluster: true
        },
        {
            name: "Mali 3W",
            url: "https://data.humdata.org/dataset/d7ab89e4-bcb2-4127-be3c-5e8cf804ffd3/resource/b8f708da-e596-456c-b550-f88959970d21/download/mali_3wop_decembre-2017.xls",
            unit: "activities"
        }
    ]
}

var demo_map = new hxlmaps.Map("map", mapConfig);
