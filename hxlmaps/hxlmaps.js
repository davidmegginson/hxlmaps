////////////////////////////////////////////////////////////////////////
// hxlmaps static properties and methods
////////////////////////////////////////////////////////////////////////

/**
 * Basic static hxlmaps properties
 */
var hxlmaps = {
    tiles: {
        url: 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw',
        properties: {
            maxZoom: 18,
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
                '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            id: 'mapbox.streets'
        }
    },
    areaCache: {},
    defaultColorMap: [
        { percentage: 0.0, color: { r: 0x00, g: 0xff, b: 0x00 } },
        { percentage: 0.5, color: { r: 0xff, g: 0xff, b: 0x00 } },
        { percentage: 1.0, color: { r: 0xff, g: 0x00, b: 0x00 } }
    ],
    itosAdminInfo: {
        "#country": {
            level: 1,
            property: "admin0Pcode"
        },
        "#adm1": {
            level: 2,
            property: "admin1Pcode"
        },
        "#adm2": {
            level: 3,
            property: "admin2Pcode"
        },
        "#adm3": {
            level: 4,
            property: "admin3Pcode"
        },
        "#adm4": {
            level: 5,
            property: "admin4Pcode"
        },
        "#adm5": {
            level: 6,
            property: "admin5Pcode"
        }
    }
};


/**
 * Static method: munge URL to use the HXL Proxy
 */
hxlmaps.mungeUrl = function(url) {
    return "https://proxy.hxlstandard.org/data.csv?url=" + encodeURIComponent(url);
};


/**
 * Static method: load geometry from iTOS
 *
 * Will retrieve from the cache if available; otherwise, will load from iTOS.
 * The function transforms the data into a map with pcodes as the keys. The values are
 * lists of contours, which are lists of tuples, each of which is a lat/lon point.
 * @param country: the ISO3 code for the country
 * @param level: an integer for the level to load (1=country, 2=admin1, 3=admin2, etc)
 * @param callback: the callback function to receive the iTOS data once loaded. 
 */
hxlmaps.loadItos = function(config, callback) {

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
    
    if (hxlmaps.areaCache[config.country]) {
        // if we've already loaded this country before, then we're done!!
        callback(hxl.areaCache[config.country]);
    } else {
        // need to load from iTOS and preprocess
        adminLevel = "#country";
        if (config.adminLevel) {
            adminLevel = config.adminLevel
        }
        var itosInfo = hxlmaps.itosAdminInfo[adminLevel];
        if (!itosInfo) {
            console.error("Unrecognised adminLevel in config", adminLevel);
            return {}
        }
        if (!config.country) {
            console.error("No country specified in config for area type");
            return {};
        }
        var url = "https://gistmaps.itos.uga.edu/arcgis/rest/services/COD_External/{{country}}_pcode/MapServer/{{level}}/query?where=1%3D1&outFields=*&f=pjson"
        url = url.replace("{{country}}", encodeURIComponent(config.country.toUpperCase()));
        url = url.replace("{{level}}", encodeURIComponent(itosInfo.level));
        var promise = jQuery.getJSON(url, function(data) {
            var features = {};
            // add each feature to the map, with the pcode as key
            data.features.forEach(function(feature) {
                features[feature.attributes[itosInfo.property]] = fixlatlon(feature.geometry.rings);
            });
            hxlmaps.areaCache[config.country] = features;
            callback(features);
        });
        promise.fail(function() {
            console.error("Failed to load areas for country", country, "admin level", adminLevel);
        });
    }
};


/**
 * Generate a colour from a gradiant using a colour map.
 * Adapted from http://stackoverflow.com/posts/7128796/revisions
 */
hxlmaps.genColor = function(percentage, colorMap, alpha) {
    for (var i = 1; i < colorMap.length - 1; i++) {
        if (percentage < colorMap[i].percentage) {
            break;
        }
    }
    var lower = colorMap[i - 1];
    var upper = colorMap[i];
    var range = upper.percentage - lower.percentage;
    var rangePercentage = (percentage - lower.percentage) / range;
    var percentageLower = 1 - rangePercentage;
    var percentageUpper = rangePercentage;
    var color = {
        r: Math.floor(lower.color.r * percentageLower + upper.color.r * percentageUpper),
        g: Math.floor(lower.color.g * percentageLower + upper.color.g * percentageUpper),
        b: Math.floor(lower.color.b * percentageLower + upper.color.b * percentageUpper)
    };
    if (alpha) {
        return 'rgba(' + [color.r, color.g, color.b, alpha].join(',') + ')';
    } else {
        return 'rgb(' + [color.r, color.g, color.b].join(',') + ')';
    }
}

/**
 * Make a leaflet control for the map title.
 * @param title: the title of the map.
 * @returns: a Leaflet control to add to the map.
 */
hxlmaps.makeTitleControl = function(title) {
    var control = L.control({position: 'bottomleft'});
    control.onAdd = function(map) {
        var node = $('<div class="map-title">');
        node.text(mapConfig.title);
        return node.get(0);
    };
    return control;
};

/**
 * Make a leaflet control for the map legend.
 * @param layerConfig: the layer configuration, including color map.
 * @param min: the minimum value in the legend.
 * @param max: the maximum value in the legend.
 * @returns: a Leaflet control to add to the map.
 */
hxlmaps.makeLegendControl = function(layerConfig, min, max) {
    var control = L.control({position: 'bottomright'});
    control.onAdd = function(map) {
        var node = $('<div class="info legend map-legend">');

        // set the transparency to match the map
        var alpha = layerConfig.alpha;
        if (!alpha) {
            alpha = 0.2; // Leaflet default for fill
        }

        // show what's being counted
        if (layerConfig.unit) {
            var unit = $('<div class="unit">')
            unit.text("Number of " + layerConfig.unit);
            node.append(unit);
        }

        // generate a gradient from 0-100% in 5% steps
        for (var percentage = 0; percentage <= 1.0; percentage += 0.05) {
            var color = hxlmaps.genColor(percentage, layerConfig.colorMap, alpha);
            var box = $('<span class="color" style="background:' + color + '">');
            box.html("&nbsp;");
            node.append(box);
        }

        // add the minimum and maximum absolute values
        node.append($("<br>")); // FIXME: blech
        var minValue = $('<div class="min">');
        minValue.text(min);
        node.append(minValue);
        var maxValue = $('<div class="max">');
        maxValue.text(max);
        node.append(maxValue);
        
        return node.get(0);
    };
    return control;
};

////////////////////////////////////////////////////////////////////////
// hxlmaps.Map class
////////////////////////////////////////////////////////////////////////

/**
 * Constructor
 * @param mapId: the HTML identifier of the element holding the map.
 * @param mapConfig: if specified, a JSON configuration for the map.
 */
hxlmaps.Map = function (mapId, mapConfig) {
    var map = this;

    map.map = L.map(mapId).setView([0, 0], 6);

    // add the tile layer
    osmTiles = L.tileLayer(hxlmaps.tiles.url, hxlmaps.tiles.properties);
    osmTiles.addTo(map.map);

    // set up the arrays for the layer chooser
    map.baseMaps = {
        "OpenStreetMap": osmTiles,
        "None": L.tileLayer('')
    };

    map.overlayMaps = {
    };

    // set up other object variables
    map.bounds = null;
    map.areaCache = {};

    // if a configuration was provided, set up the map
    if (mapConfig) {
        if (mapConfig.title) {
            hxlmaps.makeTitleControl(mapConfig.title).addTo(map.map);
        }
        if (mapConfig.layers) {
            mapConfig.layers.forEach(function(layerConfig) {
                map.addLayer(layerConfig);
            });
        } else {
            console.info("No layers specified in map config", mapConfig);
        }
    }
};

hxlmaps.Map.prototype.constructor = hxlmaps.Map;


/**
 * Add a layer to a HXL map
 * The critical properties in a layer definition are "url" (the URL of the HXL data)
 * and "type" ("points" or "areas"). For "areas", the "countries" property is also
 * required.
 * @param config: a map of properties defining the layer.
 */
hxlmaps.Map.prototype.addLayer = function(config) {
    var map = this;
    hxl.load(hxlmaps.mungeUrl(config.url), function (source) {
        if (config.type == "points") {
            map.loadPoints(config, source);
        } else if (config.type == "areas") {
            map.loadAreas(config, source);
        } else {
            console.error("Skipping layer with unknown type", config.type);
        }
    });
};

/**
 * Load points from a HXL data source
 */
hxlmaps.Map.prototype.loadPoints = function(config, source) {
    var map = this;
    var cluster = null;
    if (config.cluster) {
        cluster = L.markerClusterGroup();
    } else {
        cluster = L.layerGroup();
    }
    source.forEach(function (row) {
        var lat = row.get("#geo+lat");
        var lon = row.get("#geo+lon");
        var label = row.get("#loc+name");

        var marker = L.marker([lat, lon]);
        marker.bindPopup(label);
        cluster.addLayer(marker);
        map.extendBounds([lat, lon]);
    });
    map.map.addLayer(cluster);
    map.overlayMaps[config.name] = cluster;
    map.fitBounds();
    map.updateLayerControl();
};


/**
 * Load areas into the map
 */
hxlmaps.Map.prototype.loadAreas = function(config, source) {
    // FIXME: make admin level configurable
    var map = this;
    hxlmaps.loadItos(config, function (features) {
        var adminLevel = "#country";
        if (config.adminLevel) {
            adminLevel = config.adminLevel;
        }
        var report = source.count(adminLevel);
        var min = report.getMin("#meta+count");
        var max = report.getMax("#meta+count");
        hxlmaps.makeLegendControl(config, min, max).addTo(map.map);
        var layer = L.layerGroup();
        report.forEach(function (row) {
            var value = parseFloat(row.get("#meta+count"));
            if (isNaN(value)) {
                console.info("Non-numeric value", value);
                return;
            }
            var percentage = (value - min) / (max - min);
            var colorMap = config.colorMap;
            if (!colorMap) {
                colorMap = hxlmaps.defaultColorMap;
            }
            var color = hxlmaps.genColor(percentage, colorMap);
            var pcode = row.get(adminLevel + "+code");
            if (pcode) {
                pcode = pcode.replace("MLI", "ML"); // fixme temporary
                var feature = features[pcode];
                if (feature) {
                    feature.forEach(function(contour) {
                        layer.addLayer(L.polygon(contour, {color: color}));
                        map.extendBounds(contour);
                    });
                } else {
                    console.error("No feature found for", pcode);
                }
            } else {
                console.info("No pcode in row");
            }
        });
        layer.addTo(map.map);
        map.overlayMaps[config.name] = layer;
        map.fitBounds();
        map.updateLayerControl();
    });
};


/**
 * Extend the bounds as needed.
 * @param geo: a single point ([lat, lon]) or a list of points.
 */
hxlmaps.Map.prototype.extendBounds = function(geo) {
    var map = this;
    if ($.isArray(geo)) {
        if (geo.length > 0) {
            if (!$.isArray(geo[0])) {
                geo = [geo];
            }
            geo.forEach(function(point) {
                if (map.bounds) {
                    map.bounds.extend(point);
                } else {
                    map.bounds = L.latLngBounds(point, point);
                }
            });
        } else {
            console.error("Empty list of points for extending bounds");
        }
    } else {
        console.error("Not a point or list of points", geo);
    }
};


/**
 * Fit the map to its bounds.
 */
hxlmaps.Map.prototype.fitBounds = function () {
    if (this.bounds) {
        this.map.fitBounds(this.bounds);
    }
};


/**
 * Regenerate the layer control.
 */
hxlmaps.Map.prototype.updateLayerControl = function () {
    if (this.layerControl) {
        this.layerControl.remove(map.map);
    }
    this.layerControl = L.control.layers(this.baseMaps, this.overlayMaps);
    this.layerControl.addTo(this.map);
};