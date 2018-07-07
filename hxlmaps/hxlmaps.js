/**
 * Set up an object to hold the namespace.
 * Everything in this module is under the hxlmaps namespace.
 */
hxlmaps = {
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
            console.log("All layers loaded", outer.layers);
            outer.snapToBounds();
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
        points.push([lat, lon, 1.0]);
    });

    L.heatLayer(points, {
        gradient: {0.1: 'yellow', 0.3: 'orange', 1: 'red'}
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

    this.source = this.source.count([this.config.adminLevel + "+name", this.config.adminLevel + "+code"]);
    
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
        var url = "https://proxy.hxlstandard.org/data.json?url=" + encodeURIComponent(this.config.url);
        var promise = jQuery.getJSON(url);
        promise.fail(function () {
            console.error("Unable to read HXL dataset", url);
            deferred.reject();
        });
        promise.done(function (source) {
            outer.source = hxl.wrap(source);
            deferred.resolve();
        });
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
    var urlPattern = "https://gistmaps.itos.uga.edu/arcgis/rest/services/COD_External/{{country}}_pcode/MapServer/{{level}}/query?where=1%3D1&outFields=*&f=geojson";
    this.adminInfo = hxlmaps.itosAdminInfo[this.config.adminLevel];
    if (!this.adminInfo) {
        console.error("Unrecognised admin level", this.config.adminLevel);
        return;
    }
    var promises = []
    countries.forEach(function (countryCode) {
        var url = urlPattern.replace("{{country}}", countryCode);
        url = url.replace("{{level}}", outer.adminInfo.level);
        var promise = jQuery.getJSON(url);
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
                var code = pcode.substr(0, 3).toUpperCase();
                if (hxlmaps.iso3map[code]) {
                    outer.countryMap[code] = {};
                } else if (hxlmaps.iso2map[code.substr(0, 2)]) {
                    outer.countryMap[hxlmaps.iso2map[code.substr(0, 2)]] = {};
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
    var row = hxlmaps.fuzzyPcodeLookup(pcode, this.hxlPcodeMap);
    var name = row.get('#*+name');
    var count = row.get('#meta+count');
    // FIXME need to escape
    layer.bindTooltip(name + ' ' + count);
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
        this.maxValue = 0 + this.source.getMax('#meta+count');
    }

    // figure out the weighting of this area, and calculate a color
    var pcode = feature.properties[this.adminInfo.property];
    var row = hxlmaps.fuzzyPcodeLookup(pcode, this.hxlPcodeMap);
    var count = 0 + row.get('#meta+count');
    var percentage = count / this.maxValue;
    var color = hxlmaps.genColor(percentage, this.config.colorMap);

    return {
        color: color
    };
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
 * Do a fuzzy P-code lookup, trying various substitutions
 * Force the P-code to upper case, and try both ISO2 and ISO3 variants.
 * @param pcode: the P-code to look up
 * @param obj: the object (hashmap) in which to look up the P-code.
 * @returns: the value associated with the P-code in the object/hashmap if found; otherwise, undefined.
 */
hxlmaps.fuzzyPcodeLookup = function(pcode, obj) {
    var iso2, iso3, newPcode;
    
    pcode = pcode.toUpperCase();

    // try a straight lookup
    if (obj[pcode]) {
        return obj[pcode];
    }

    // try swapping iso3 for iso2
    var iso2 = hxlmaps.iso3map[pcode.substr(0, 3)];
    if (iso2) {
        newPcode = iso2 + pcode.substr(3);
        if (obj[newPcode]) {
            return obj[newPcode];
        }
    }

    // try swapping iso2 for iso3
    var iso3 = hxlmaps.iso2map[pcode.substr(0, 2)];
    if (iso3) {
        var newPcode = iso3 + pcode.substr(2);
        if (obj[newPcode]) {
            return obj[newPcode];
        }
    }

    // no joy
    return undefined;
};


////////////////////////////////////////////////////////////////////////
// Static data
////////////////////////////////////////////////////////////////////////

/**
 * Map from the admin levels used by HXL to those used by iTOS
 */
hxlmaps.itosAdminInfo = {
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
};


/**
 * ISO2 and ISO3 country codes
 */
hxlmaps.countryCodes = [
    ["AD", "AND"],
    ["AE", "ARE"],
    ["AF", "AFG"],
    ["AG", "ATG"],
    ["AI", "AIA"],
    ["AL", "ALB"],
    ["AM", "ARM"],
    ["AO", "AGO"],
    ["AQ", "ATA"],
    ["AR", "ARG"],
    ["AS", "ASM"],
    ["AT", "AUT"],
    ["AU", "AUS"],
    ["AW", "ABW"],
    ["AX", "ALA"],
    ["AZ", "AZE"],
    ["BA", "BIH"],
    ["BB", "BRB"],
    ["BD", "BGD"],
    ["BE", "BEL"],
    ["BF", "BFA"],
    ["BG", "BGR"],
    ["BH", "BHR"],
    ["BI", "BDI"],
    ["BJ", "BEN"],
    ["BL", "BLM"],
    ["BM", "BMU"],
    ["BN", "BRN"],
    ["BO", "BOL"],
    ["BQ", "BES"],
    ["BR", "BRA"],
    ["BS", "BHS"],
    ["BT", "BTN"],
    ["BV", "BVT"],
    ["BW", "BWA"],
    ["BY", "BLR"],
    ["BZ", "BLZ"],
    ["CA", "CAN"],
    ["CC", "CCK"],
    ["CD", "COD"],
    ["CF", "CAF"],
    ["CG", "COG"],
    ["CH", "CHE"],
    ["CI", "CIV"],
    ["CK", "COK"],
    ["CL", "CHL"],
    ["CM", "CMR"],
    ["CN", "CHN"],
    ["CO", "COL"],
    ["CR", "CRI"],
    ["CU", "CUB"],
    ["CV", "CPV"],
    ["CW", "CUW"],
    ["CX", "CXR"],
    ["CY", "CYP"],
    ["CZ", "CZE"],
    ["DE", "DEU"],
    ["DJ", "DJI"],
    ["DK", "DNK"],
    ["DM", "DMA"],
    ["DO", "DOM"],
    ["DZ", "DZA"],
    ["EC", "ECU"],
    ["EE", "EST"],
    ["EG", "EGY"],
    ["EH", "ESH"],
    ["ER", "ERI"],
    ["ES", "ESP"],
    ["ET", "ETH"],
    ["FI", "FIN"],
    ["FJ", "FJI"],
    ["FK", "FLK"],
    ["FM", "FSM"],
    ["FO", "FRO"],
    ["FR", "FRA"],
    ["GA", "GAB"],
    ["GB", "GBR"],
    ["GD", "GRD"],
    ["GE", "GEO"],
    ["GF", "GUF"],
    ["GG", "GGY"],
    ["GH", "GHA"],
    ["GI", "GIB"],
    ["GL", "GRL"],
    ["GM", "GMB"],
    ["GN", "GIN"],
    ["GP", "GLP"],
    ["GQ", "GNQ"],
    ["GR", "GRC"],
    ["GS", "SGS"],
    ["GT", "GTM"],
    ["GU", "GUM"],
    ["GW", "GNB"],
    ["GY", "GUY"],
    ["HK", "HKG"],
    ["HM", "HMD"],
    ["HN", "HND"],
    ["HR", "HRV"],
    ["HT", "HTI"],
    ["HU", "HUN"],
    ["ID", "IDN"],
    ["IE", "IRL"],
    ["IL", "ISR"],
    ["IM", "IMN"],
    ["IN", "IND"],
    ["IO", "IOT"],
    ["IQ", "IRQ"],
    ["IR", "IRN"],
    ["IS", "ISL"],
    ["IT", "ITA"],
    ["JE", "JEY"],
    ["JM", "JAM"],
    ["JO", "JOR"],
    ["JP", "JPN"],
    ["KE", "KEN"],
    ["KG", "KGZ"],
    ["KH", "KHM"],
    ["KI", "KIR"],
    ["KM", "COM"],
    ["KN", "KNA"],
    ["KP", "PRK"],
    ["KR", "KOR"],
    ["KW", "KWT"],
    ["KY", "CYM"],
    ["KZ", "KAZ"],
    ["LA", "LAO"],
    ["LB", "LBN"],
    ["LC", "LCA"],
    ["LI", "LIE"],
    ["LK", "LKA"],
    ["LR", "LBR"],
    ["LS", "LSO"],
    ["LT", "LTU"],
    ["LU", "LUX"],
    ["LV", "LVA"],
    ["LY", "LBY"],
    ["MA", "MAR"],
    ["MC", "MCO"],
    ["MD", "MDA"],
    ["ME", "MNE"],
    ["MF", "MAF"],
    ["MG", "MDG"],
    ["MH", "MHL"],
    ["MK", "MKD"],
    ["ML", "MLI"],
    ["MM", "MMR"],
    ["MN", "MNG"],
    ["MO", "MAC"],
    ["MP", "MNP"],
    ["MQ", "MTQ"],
    ["MR", "MRT"],
    ["MS", "MSR"],
    ["MT", "MLT"],
    ["MU", "MUS"],
    ["MV", "MDV"],
    ["MW", "MWI"],
    ["MX", "MEX"],
    ["MY", "MYS"],
    ["MZ", "MOZ"],
    ["NA", "NAM"],
    ["NC", "NCL"],
    ["NE", "NER"],
    ["NF", "NFK"],
    ["NG", "NGA"],
    ["NI", "NIC"],
    ["NL", "NLD"],
    ["NO", "NOR"],
    ["NP", "NPL"],
    ["NR", "NRU"],
    ["NU", "NIU"],
    ["NZ", "NZL"],
    ["OM", "OMN"],
    ["PA", "PAN"],
    ["PE", "PER"],
    ["PF", "PYF"],
    ["PG", "PNG"],
    ["PH", "PHL"],
    ["PK", "PAK"],
    ["PL", "POL"],
    ["PM", "SPM"],
    ["PN", "PCN"],
    ["PR", "PRI"],
    ["PS", "PSE"],
    ["PT", "PRT"],
    ["PW", "PLW"],
    ["PY", "PRY"],
    ["QA", "QAT"],
    ["RE", "REU"],
    ["RO", "ROU"],
    ["RS", "SRB"],
    ["RU", "RUS"],
    ["RW", "RWA"],
    ["SA", "SAU"],
    ["SB", "SLB"],
    ["SC", "SYC"],
    ["SD", "SDN"],
    ["SE", "SWE"],
    ["SG", "SGP"],
    ["SH", "SHN"],
    ["SI", "SVN"],
    ["SJ", "SJM"],
    ["SK", "SVK"],
    ["SL", "SLE"],
    ["SM", "SMR"],
    ["SN", "SEN"],
    ["SO", "SOM"],
    ["SR", "SUR"],
    ["SS", "SSD"],
    ["ST", "STP"],
    ["SV", "SLV"],
    ["SX", "SXM"],
    ["SY", "SYR"],
    ["SZ", "SWZ"],
    ["TC", "TCA"],
    ["TD", "TCD"],
    ["TF", "ATF"],
    ["TG", "TGO"],
    ["TH", "THA"],
    ["TJ", "TJK"],
    ["TK", "TKL"],
    ["TL", "TLS"],
    ["TM", "TKM"],
    ["TN", "TUN"],
    ["TO", "TON"],
    ["TR", "TUR"],
    ["TT", "TTO"],
    ["TV", "TUV"],
    ["TW", "TWN"],
    ["TZ", "TZA"],
    ["UA", "UKR"],
    ["UG", "UGA"],
    ["UM", "UMI"],
    ["US", "USA"],
    ["UY", "URY"],
    ["UZ", "UZB"],
    ["VA", "VAT"],
    ["VC", "VCT"],
    ["VE", "VEN"],
    ["VG", "VGB"],
    ["VI", "VIR"],
    ["VN", "VNM"],
    ["VU", "VUT"],
    ["WF", "WLF"],
    ["WS", "WSM"],
    ["YE", "YEM"],
    ["YT", "MYT"],
    ["ZA", "ZAF"],
    ["ZM", "ZMB"],
    ["ZW", "ZWE"]
];

// set up the lookup tables
hxlmaps.iso2map = {};
hxlmaps.iso3map = {};
hxlmaps.countryCodes.forEach(function (entry) {
    hxlmaps.iso2map[entry[0]] = entry[1];
    hxlmaps.iso3map[entry[1]] = entry[0];
});
