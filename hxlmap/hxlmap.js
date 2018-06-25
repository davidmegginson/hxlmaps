/**
 * HXL map core object
 */
var hxlmap = {
    map: null,
    bounds: null,
    tiles: {
        url: 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw',
        properties: {
            maxZoom: 18,
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
                '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            id: 'mapbox.streets'
        }
    }
};


/**
 * Cache of P-code files already loaded.
 */
hxlmap.pcodeCache = {};


/**
 * Munge URL to use the HXL Proxy
 */
hxlmap.mungeUrl = function(url) {
    return "https://proxy.hxlstandard.org/data.csv?url=" + encodeURIComponent(url);
};

/**
 * Set up a HXL map
 */
hxlmap.setup = function (html_id) {
    hxlmap.map = L.map(html_id).setView([0, 0], 6);
    L.tileLayer(hxlmap.tiles.url, hxlmap.tiles.properties).addTo(hxlmap.map);
};


/**
 * Add a layer to a HXL map
 */
hxlmap.addLayer = function(layer) {
    hxl.load(hxlmap.mungeUrl(layer.url), function (source) {
        if (layer.type == "points") {
            hxlmap.loadPoints(layer, source);
        } else if (layer.type == "pcodes") {
            hxlmap.loadAreas(layer, source);
        } else {
            console.log("skipping", layer);
        }
    });
};


/**
 * Load points from a HXL data source
 */
hxlmap.loadPoints = function(layer, source) {
    var cluster = L.markerClusterGroup();
    source.forEach(function (row) {
        var lat = row.get("#geo+lat");
        var lon = row.get("#geo+lon");
        var label = row.get("#loc+name");

        var marker = L.marker([lat, lon]);
        marker.bindPopup(label);
        cluster.addLayer(marker);

        if (hxlmap.bounds) {
            hxlmap.bounds.extend([lat, lon]);
        } else {
            hxlmap.bounds = L.latLngBounds([lat, lon], [lat, lon]);
        }
    });
    hxlmap.map.addLayer(cluster);
    if (hxlmap.bounds) {
        hxlmap.map.fitBounds(hxlmap.bounds);
    }
};


/**
 * Load geometry from iTOS
 */
hxlmap.loadItos = function(country, level, callback) {

    /**
     * iTOS reverse lat/lon
     */
    function fixlatlon(feature) {
        for (var i = 0; i < feature.length; i++) {
            var contour = feature[i];
            for (var j = 0; j < contour.length; j++) {
                var tmp = contour[j][0];
                contour[j][0] = contour[j][1];
                contour[j][1] = tmp;
            }
        }
        return feature;
    }
    
    if (hxlmap.pcodeCache[country]) {
        callback(hxl.pcodeCache[country]);
    } else {
        var url = "http://gistmaps.itos.uga.edu/arcgis/rest/services/COD_External/{{country}}_pcode/MapServer/{{level}}/query?where=1%3D1&outFields=*&f=pjson"
        url = url.replace("{{country}}", encodeURIComponent(country.toUpperCase()));
        url = url.replace("{{level}}", encodeURIComponent(level));
        jQuery.getJSON(url, function(data) {
            var features = {};
            data.features.forEach(function(feature) {
                features[feature.attributes.admin1Pcode] = fixlatlon(feature.geometry.rings);
            });
            hxlmap.pcodeCache[country] = features;
            callback(features);
        });
    }
};

/**
 * Load areas into the map
 */
hxlmap.loadAreas = function(layer, source) {
    hxlmap.loadItos(layer.country, 2, function (features) {
        var report = source.count("#adm1");
        var min = report.getMin("#meta+count");
        var max = report.getMax("#meta+count");
        console.log(min, max);
        report.forEach(function (row) {
            var pcode = row.get("#adm1+code");
            if (pcode) {
                // fixme temporary
                pcode = pcode.replace("MLI", "ML");
                var feature = features[pcode];
                if (feature) {
                    feature.forEach(function(contour) {
                        L.polygon(contour, {color: "red"}).addTo(hxlmap.map);
                    });
                } else {
                    console.log("No feature found for", pcode);
                }
            } else {
                console.log("No pcode in row");
            }
        });
    });
};
