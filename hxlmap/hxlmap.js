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
 * Cache of areas already loaded (key is ISO3 country code).
 */
hxlmap.areaCache = {};


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
 * The critical properties in a layer definition are "url" (the URL of the HXL data)
 * and "type" ("points" or "areas"). For "areas", the "countries" property is also
 * required.
 * @param layer: a map of properties defining the layer.
 */
hxlmap.addLayer = function(layer) {
    hxl.load(hxlmap.mungeUrl(layer.url), function (source) {
        if (layer.type == "points") {
            hxlmap.loadPoints(layer, source);
        } else if (layer.type == "areas") {
            hxlmap.loadAreas(layer, source);
        } else {
            console.info("skipping", layer);
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
 *
 * Will retrieve from the cache if available; otherwise, will load from iTOS.
 * The function transforms the data into a map with pcodes as the keys. The values are
 * lists of contours, which are lists of tuples, each of which is a lat/lon point.
 * @param country: the ISO3 code for the country
 * @param level: an integer for the level to load (1=country, 2=admin1, 3=admin2, etc)
 * @param callback: the callback function to receive the iTOS data once loaded. 
 */
hxlmap.loadItos = function(country, level, callback) {

    /**
     * iTOS reverses the lat/lon. Blech.
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
    
    if (hxlmap.areaCache[country]) {
        // if we've already loaded this country before, then we're done!!
        callback(hxl.areaCache[country]);
    } else {
        // need to load from iTOS and preprocess
        var url = "http://gistmaps.itos.uga.edu/arcgis/rest/services/COD_External/{{country}}_pcode/MapServer/{{level}}/query?where=1%3D1&outFields=*&f=pjson"
        url = url.replace("{{country}}", encodeURIComponent(country.toUpperCase()));
        url = url.replace("{{level}}", encodeURIComponent(level));
        var promise = jQuery.getJSON(url, function(data) {
            var features = {};
            // add each feature to the map, with the pcode as key
            // FIXME hard-coded to the admin1Pcode
            data.features.forEach(function(feature) {
                features[feature.attributes.admin1Pcode] = fixlatlon(feature.geometry.rings);
            });
            hxlmap.areaCache[country] = features;
            callback(features);
        });
        promise.fail(function() {
            console.error("Failed to load areas for country", country);
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
                    console.error("No feature found for", pcode);
                }
            } else {
                console.info("No pcode in row");
            }
        });
    });
};
