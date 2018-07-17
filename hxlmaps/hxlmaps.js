/**
 * Set up an object to hold the namespace.
 * Everything in this module is under the hxlmaps namespace.
 */
var hxlmaps = {
};


////////////////////////////////////////////////////////////////////////
// hxlmaps.Map class
////////////////////////////////////////////////////////////////////////

/**
 * Constructor
 * @param mapId: the HTML identifier of the element that will hold the map.
 * @param mapConfig: if specified, a JSON configuration for the map.
 */
hxlmaps.Map = function(mapId, mapConfig) {
    var outer = this;

    /**
     * hxlmaps.HXLLayer objects
     */
    this.layers = [];

    if (mapConfig) {
        // if the user supplied a configuration file, set up the map

        var promises = [];

        // the Leaflet map object
        this.map = L.map(mapId, {maxZoom: 18}).setView([0, 0], 6);


        // load each tile layer
        this.tileLayers = {};
        hxlmaps.tileInfo.forEach(function (tileConfig) {
            var tileLayer = undefined;
            if (tileConfig.url) {
               tileLayer =  L.tileLayer(tileConfig.url, tileConfig.properties);
            } else {
                tileLayer = L.layerGroup();
            }
            outer.tileLayers[tileConfig.name] = tileLayer;
        });
        this.tileLayers[hxlmaps.tileInfo[0].name].addTo(this.map);

        // temporary: load Mali as baseline
        if (false) {
            ["#country", "#adm1", "#adm2", "#adm3"].forEach(function(adminLevel) {
                promise = hxlmaps.cods.loadItosLevel('NGA', adminLevel);
                promise.done(function (geojson) {
                    var layer = L.geoJSON(geojson, {
                        fill: null,
                        weight: 1
                    });
                    outer.tileLayers["Mali " + adminLevel] = layer;
                });
                promises.push(promise);
            });
        }

        // load each HXL-based layer
        if (mapConfig.layers) {
            mapConfig.layers.forEach(function(layerConfig) {
                var layer = new hxlmaps.Layer(outer.map, layerConfig);
                var promise = layer.load();
                promises.push(promise);
                promise.done(function () {
                    if (layer.bounds) {
                        outer.extendBounds(layer.bounds);
                    }
                    outer.map.addLayer(layer.leafletLayer);
                });
                outer.layers.push(layer);
            });
        }

        // this runs only after all layers are loaded
        $.when.apply($, promises).done(function () {
            if (outer.layers.length == 0) {
                console.error("No layers defined");
            }

            // Show the map in bounds
            outer.snapToBounds();

            // Add a layer selector
            overlays = {}
            outer.layers.forEach(function (layer) {
                overlays[layer.config.name] = layer.leafletLayer;
           });
            L.control.layers(outer.tileLayers, overlays, {
                sort: true,
                autoZIndex: true
            }).addTo(outer.map);
        });

    } else {
        // no config supplied
        console.error("No map configuration supplied");
    }
};


/**
 * Extend the bounding rectangle of the map, creating if necessary
 */
hxlmaps.Map.prototype.extendBounds = function (points) {
    if (this.bounds) {
        this.bounds.extend(points);
    } else {
        this.bounds = L.latLngBounds(points);
    }
};


/**
 * Snap the map to its current bounding rectangle.
 */
hxlmaps.Map.prototype.snapToBounds = function () {
    if (this.bounds) {
        this.map.fitBounds(this.bounds);
    } else {
        console.error("No bounds to snap to");
    }
};


////////////////////////////////////////////////////////////////////////
// hxlmaps.HXLLayer class
////////////////////////////////////////////////////////////////////////

/**
 * Constructor
 * @param
 */
hxlmaps.Layer = function(map, layerConfig) {
    this.map = map;
    this.config = layerConfig;
};

/**
 * Set up the layer so that it's ready to display on a map.
 * @returns: a promise that resolves when the layer is loaded into the map
 */
hxlmaps.Layer.prototype.load = function () {
    var outer = this;
    var deferred = $.Deferred();

    this.leafletLayer = L.layerGroup();

    this.loadHXL().done(function () {
        var promise;
        outer.setType();
        if (outer.config.type == "points") {
            promise = outer.loadPoints();
        } else if (outer.config.type == "heat") {
            promise = outer.loadHeat();
        } else if (outer.config.type == "areas") {
            promise = outer.loadAreas();
        } else {
            console.error("Bad layer type", outer.config.type);
            promise = $.when($);
        }
        promise.done(function () {
            deferred.resolve();
        });
    });

    return deferred.promise();
};


/**
 * Continue setup for a points layer.
 * @returns: a promise that resolves when the points are loaded into the map
 */
hxlmaps.Layer.prototype.loadPoints = function () {
    var outer = this;
    var layerGroup;

    if (this.config.cluster) {
        layerGroup = L.markerClusterGroup();
        layerGroup.addTo(this.leafletLayer);
    } else {
        layerGroup = this.leafletLayer;
    }

    this.source.forEach(function (row) {
        var lat = row.get("#geo+lat");
        var lon = row.get("#geo+lon");
        var marker = L.marker([lat, lon]);

        marker.addTo(layerGroup);

        // set up labels
        var label = "<table>";
        for (var i = 0; i < row.values.length; i++) {
            if (row.columns[i]) {
                var name = row.columns[i].header;
                var value = row.values[i];
                if (!name) {
                    name = row.columns[i].displayTag;
                }
                if (name && (value != "")) {
                    // FIXME! need to escape
                    label += "<tr><th>" + name + "</th><td>" + row.values[i] + "</td></tr>";
                }
                marker.bindPopup(label);
            }
        }
        label += "</table>";
        marker.bindPopup(label);

    });

    return $.when($); // empty promise (resolves instantly)
};


/**
 * Load as a heatmap
 */
hxlmaps.Layer.prototype.loadHeat = function () {
    var outer = this;
    var points = [];

    this.source.forEach(function(row) {
        var lat = row.get("#geo+lat");
        var lon = row.get("#geo+lon");
        points.push([lat, lon]);
    });

    L.heatLayer(points, {
        minOpacity: 0.4
    }).addTo(this.leafletLayer);

    return $.when($); // empty promise (resolves instantly)
};


/**
 * Continue setup for an areas layer.
 * @returns: a promise that resolves when the areas are loaded into the map
 */
hxlmaps.Layer.prototype.loadAreas = function () {
    var outer = this;
    var deferred = $.Deferred();
    
    if (!this.config.colorMap) {
        this.config.colorMap = [
            { percentage: 0.0, color: { r: 0x80, g: 0xd0, b: 0xc7 } },
            { percentage: 1.0, color: { r: 0x13, g: 0x54, b: 0x7a } }
        ];
    }

    if (!this.config.aggregateType) {
        var patterns = ["#reached", "#targeted", "#inneed", "#affected", "#population", "#value", "#indicator+num"];
        this.config.aggregateType = "count";
        for (var i = 0; i < patterns.length; i++) {
            if (hxl.matchList(patterns[i], this.source.columns)) {
                this.config.aggregateType = "sum";
                this.config.aggregateColumn = patterns[i];
                break;
            }
        }
    }

    this.adminInfo = hxlmaps.cods.itosAdminInfo[this.config.adminLevel];
    this.source = this.source.count(
        [this.config.adminLevel + "+name", this.config.adminLevel + "+code"],
        this.config.aggregateColumn
    );

    this.hxlPcodeMap = {};
    this.source.forEach(function (row) {
        var pcode = row.get('#*+code');
        if (pcode) {
            pcode = pcode.toUpperCase();
            outer.hxlPcodeMap[pcode] = row;
        } else {
            console.info("No p-code in row", row);
        }
    });

    this.setCountries();

    var promise = this.loadGeoJSON();

    promise.done(function () {
        for (var key in outer.countryMap) {
            function doOnEachFeature (feature, layer) {
                outer.addAreaUI(feature, layer);
            }
            function doStyle (feature, layer) {
                return outer.makeAreaStyle(feature);
            }
            var entry = outer.countryMap[key];
            if (entry.geojson) {
                entry.leafletLayer = L.geoJSON(entry.geojson, {
                    onEachFeature: doOnEachFeature,
                    style: doStyle
                });
                outer.extendBounds(entry.leafletLayer.getBounds());
                outer.leafletLayer.addLayer(entry.leafletLayer);
            }
        }
        deferred.resolve();
    });

    return deferred.promise();
};


/**
 * Load the HXL data for the layer.
 * @returns: a promise that resolves when the HXL data is loaded.
 */
hxlmaps.Layer.prototype.loadHXL = function() {
    var outer = this;
    var deferred = $.Deferred();
    
    if (this.config.url) {
        hxl.proxy(
            this.config.url,
            function (source) {
                outer.source = source;
                deferred.resolve();
            },
            function (xhr) {
                console.error("Unable to read HXL dataset", url, xhr);
                deferred.reject()
            }
        );
    } else {
        console.error("No dataset specified for layer", this.config);
        deferred.reject();
    }

    return deferred.promise();
};


/**
 * Load GeoJSON from iTOS for all required countries.
 * @returns: a promise that resolves when the GeoJSON is loaded into the map.
 */
hxlmaps.Layer.prototype.loadGeoJSON = function () {
    var outer = this;
    var countries = Object.keys(this.countryMap);
    var promises = []
    countries.forEach(function (countryCode) {
        var promise = hxlmaps.cods.loadItosLevel(countryCode, outer.config.adminLevel);
        promises.push(promise.done(function (geojson) {
            outer.countryMap[countryCode]["geojson"] = geojson;
        }));
        promise.fail(function () {
            console.error("Cannot open GeoJSON", countryCode, outer.config.adminLevel);
        });
    });
    return $.when.apply($, promises); // return a promise that won't complete until all others are done
};


/**
 * Guess what type of a layer to make.
 * Sets the type (and adminLevel) in this.config
 */
hxlmaps.Layer.prototype.setType = function () {
    if (this.config.type) {
        return;
    } else if (!this.source) {
        console.error("HXL source not loaded yet");
        return undefined;
    } else {
        var columns = this.source.columns;
        if (hxl.matchList("#geo+lat", columns) && hxl.matchList("#geo+lon", columns)) {
            this.config.type = "points";
        } else {
            var patterns = ["#adm5", "#adm4", "#adm3", "#adm2", "#adm1", "#country"];
            for (var i = 0; i < patterns.length; i++) {
                if (hxl.matchList(patterns[i], columns)) {
                    if (!this.config.adminLevel) {
                        this.config.adminLevel = patterns[i];
                    }
                    this.config.type = "areas";
                    break;
                }
            }
        }
    }
    if (!this.config.type) {
        console.error("Cannot guess HXL layer type from hashtags");
    }
};


/**
 * Figure out what countries we need to load from iTOS.
 */
hxlmaps.Layer.prototype.setCountries = function () {
    var outer = this;
    outer.countryMap = {};
    this.source.rows.forEach(function (row) {
        var countryCode = row.get("#country+code");
        if (countryCode) {
            outer.countryMap[countryCode] = {};
        } else {
            var pcode = row.get(outer.config.adminLevel + "+code");
            if (!pcode) {
                console.info("No Pcode in row", row);
            } else {
                var countryCode = hxlmaps.cods.getPcodeCountry(pcode);
                if (countryCode) {
                    outer.countryMap[countryCode] = {};
                } else {
                    console.error("Cannot guess country for P-code", pcode);
                }
            }
        }
    });
};


/**
 * Extend this layer's bounds as needed.
 */
hxlmaps.Layer.prototype.extendBounds = function (geo) {
    if (this.bounds) {
        this.bounds.extend(geo);
    } else {
        this.bounds = L.latLngBounds(geo);
    }
};


/**
 * Add a popup to a GeoJSON feature layer
 */
hxlmaps.Layer.prototype.addAreaUI = function (feature, layer) {
    var pcode = feature.properties[this.adminInfo.property];
    if (pcode) {
        var row = hxlmaps.cods.fuzzyPcodeLookup(pcode, this.hxlPcodeMap);
        if (row) {
            var name = row.get('#*+name');
            if (this.config.aggregateType == "sum") {
                var count = row.get("#*+sum");
            } else {
                var count = row.get('#meta+count');
            }
            var unit = this.config.unit;
            if (!unit) {
                unit = "entries";
            }
            var text = name + ' ' + count + ' ' + unit;
        } else {
            var text = name = '(no data available)';
        }
        // FIXME need to escape
        layer.bindTooltip(text);
    }
};


/**
 * Create a style for an area.
 * Attributes will be in feature.properties
 * @param feature: a GeoJSON feature
 * @return: an object specifying Leaflet styles
 */
hxlmaps.Layer.prototype.makeAreaStyle = function (feature) {

    // get the maximum value if we don't already have it
    if (!this.maxValue) {
        if (this.config.aggregateType == "sum") {
            this.maxValue = 0 + this.source.getMax("#*+sum");
        } else {
            this.maxValue = 0 + this.source.getMax('#meta+count');
        }
    }

    // figure out the weighting of this area, and calculate a color
    var pcode = feature.properties[this.adminInfo.property];
    if (pcode) {
        var row = hxlmaps.cods.fuzzyPcodeLookup(pcode, this.hxlPcodeMap);
        if (row) {
            if (this.config.aggregateType == "sum") {
                var count = 0 + row.get("#*+sum");
            } else {
                var count = 0 + row.get('#meta+count');
            }
            var percentage = count / this.maxValue;
            var color = hxlmaps.genColor(percentage, this.config.colorMap);
            return {
                color: color
            };
        } else {
            return {
                color: "rgb(128, 128, 128)",
                opacity: 0.25
            };
        }
    } else {
        console.info("Feature has no pcode", this.adminInfo.property, feature);
        return {
            stroke: false
        };
    }

};


////////////////////////////////////////////////////////////////////////
// Static variables and functions
////////////////////////////////////////////////////////////////////////

/**
 * Generate a colour from a gradiant using a colour map.
 * Adapted from http://stackoverflow.com/posts/7128796/revisions
 * @param percentage: a percentage value from 0.0 to 0.1
 * @param colorMap: the colour map to interpolate
 * @param alpha: (optional) an alpha value from 0.0 to 1.0
 * @returns: a colour specification in rgb or rgba format
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
 * Tile data
 */
hxlmaps.tileInfo = [
    {
        name: "OpenStreetMap",
        url: 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw',
        properties: {
            maxZoom: 18,
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
                '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            id: 'mapbox.streets'
        }
    },
    {
        name: "None"
    }
];
