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
    pcodeCache: {},
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


//
// Static GIS-related functions
//

/**
 * Guess the ISO3 country code for a P-code
 */
hxlmaps.guessCountry = function(pcode) {
    var code = pcode.substr(0, 3).toUpperCase();
    if (hxlmaps.iso3map[code]) {
        return code;
    } else if (hxlmaps.iso2map[code.substr(0, 2)]) {
        return hxlmaps.iso2map[code.substr(0, 2)];
    } else {
        console.error("Cannot guess country for P-code", pcode);
        return null;
    }
};

/**
 * Load the geometry for a P-code
 */
hxlmaps.getGeometry = function(pcode, adminLevel, callback) {
    var country = hxlmaps.guessCountry(pcode);
    if (!country) {
        console.error("Unable to guess country for P-code", pcode);
        callback(null);
        return;
    }
    if (hxlmaps.pcodeCache[country]) {
        // already loaded
        if (hxlmaps.pcodeCache[adminLevel]) {
            callback(hxlmaps.fuzzyPcodeLookup(pcode, hxlmaps.pcodeCache[country][adminLevel]));
            return;
        }
    } else {
        hxlmaps.pcodeCache[country] = {};
    }

    // not loaded yet
    hxlmaps.loadItos(country, adminLevel, function(geometry) {
        hxlmaps.pcodeCache[country][adminLevel] = geometry;
        callback(hxlmaps.fuzzyPcodeLookup(pcode, geometry));
    });
};

/**
 * Do a fuzzy P-code lookup, trying various substitutions
 */
hxlmaps.fuzzyPcodeLookup = function(pcode, featureMap) {
    var iso2, iso3, newPcode;
    
    pcode = pcode.toUpperCase();

    // try a straight lookup
    if (featureMap[pcode]) {
        return featureMap[pcode];
    }

    // try swapping iso3 for iso2
    var iso2 = hxlmaps.iso3map[pcode.substr(0, 3)];
    if (iso2) {
        newPcode = iso2 + pcode.substr(3);
        if (featureMap[newPcode]) {
            return featureMap[newPcode];
        }
    }

    // try swapping iso2 for iso3
    var iso3 = hxlmaps.iso2map[pcode.substr(0, 2)];
    if (iso3) {
        var newPcode = iso3 + pcode.substr(2);
        if (featureMap[newPcode]) {
            return featureMap[newPcode];
        }
    }

    // no joy
    return null;
};

/**
 * Static method: set default values for a layer, based on the HXL.
 */
hxlmaps.setLayerDefaults = function(layer, hxlSource) {

    var areaPatterns = ["#loc", "#adm5", "#adm4", "#adm3", "#adm2", "#adm1", "#country"];

    // No type set
    if (!layer.type) {
        if (hxl.matchList("#geo+lat", hxlSource.columns) && hxl.matchList("#geo+lon", hxlSource.columns)) {
            layer.type = "points";
        } else {
            for (var i = 0; i < areaPatterns.length; i++) {
                if (hxl.matchList(areaPatterns[i] + "+code", hxlSource.columns)) {
                    layer.type = "areas";
                    layer.adminLevel = areaPatterns[i];
                    break;
                }
            }
        }
    }

    if (!layer.type) {
        console.error("type property not specified for layer, and no geo hashtags in the HXL data");
    }

    // defaults for "areas" map type
    if (layer.type == "areas") {
        if (!layer.colorMap) {
            layer.colorMap = [
                { percentage: 0.0, color: { r: 0x00, g: 0x00, b: 0x00 } },
                { percentage: 1.0, color: { r: 0x00, g: 0xaa, b: 0xff } }
            ];
        }
        if (!layer.aggregation) {
            layer.aggregation = "count";
        }
        if (!layer.alpha) {
            layer.alpha = 0.2;
        }
        if (!layer.unit) {
            layer.unit = "reports";
        }
    }

    return layer;
};


/**
 * Static method: munge URL to use the HXL Proxy
 */
hxlmaps.mungeUrl = function(url) {
    return "https://proxy.hxlstandard.org/data.json?url=" + encodeURIComponent(url);
};


/**
 * Static method: load geometry from iTOS
 *
 * Will retrieve from the cache if available; otherwise, will load from iTOS.
 * The function transforms the data into a map with pcodes as the keys. The values are
 * lists of contours, which are lists of tuples, each of which is a lat/lon point.
 * @param country: the ISO3 code for the country
 * @param adminLevel: the HXL hashtag for the admin level to load
 * @param callback: the callback function to receive the iTOS data once loaded. 
 */
hxlmaps.loadItos = function(country, adminLevel, callback) {

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
    
    // need to load from iTOS and preprocess
    var key = hxl.classes.TagPattern.parse(adminLevel).tag;
    var itosInfo = hxlmaps.itosAdminInfo[key];
    if (!itosInfo) {
        console.error("Unrecognised adminLevel in config", adminLevel);
        return {}
    }
    var url = "https://gistmaps.itos.uga.edu/arcgis/rest/services/COD_External/{{country}}_pcode/MapServer/{{level}}/query?where=1%3D1&outFields=*&f=pjson"
    url = url.replace("{{country}}", encodeURIComponent(country.toUpperCase()));
    url = url.replace("{{level}}", encodeURIComponent(itosInfo.level));
    var promise = jQuery.getJSON(url, function(data) {
        var features = {};
        // add each feature to the map, with the pcode as key
        data.features.forEach(function(feature) {
            features[feature.attributes[itosInfo.property].toUpperCase()] = fixlatlon(feature.geometry.rings);
        });
        callback(features);
    });
    promise.fail(function() {
        console.error("Failed to load areas for country", country, "admin level", adminLevel);
    });
};


//
// Static UI-related functions
//

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
hxlmaps.Map.prototype.addLayer = function(layerConfig) {
    var map = this;
    var promise = jQuery.getJSON(hxlmaps.mungeUrl(layerConfig.url), function (jsonData) {
        var source = hxl.wrap(jsonData);
        layerConfig = hxlmaps.setLayerDefaults(layerConfig, source);
        if (layerConfig.type == "points") {
            map.loadPoints(layerConfig, source);
        } else if (layerConfig.type == "areas") {
            map.loadAreas(layerConfig, source);
        } else {
            console.error("Skipping layer with unknown type", layerConfig.type);
        }
    });
    promise.fail(function() {
        console.error("Failed to read", layerConfig.url);
    });
};

/**
 * Load points from a HXL data source
 */
hxlmaps.Map.prototype.loadPoints = function(layerConfig, source) {
    var map = this;
    var cluster = null;
    if (layerConfig.cluster) {
        cluster = L.markerClusterGroup();
    } else {
        cluster = L.layerGroup();
    }
    source.forEach(function (row) {
        var lat = row.get("#geo+lat");
        var lon = row.get("#geo+lon");
        var label = row.get("#loc+name");

        var marker = L.marker([lat, lon], {icon: L.divIcon()});
        marker.bindPopup(label);
        cluster.addLayer(marker);
        map.extendBounds([lat, lon]);
    });
    map.map.addLayer(cluster);
    map.overlayMaps[layerConfig.name] = cluster;
    map.fitBounds();
    map.updateLayerControl();
};


/**
 * Load areas into the map
 */
hxlmaps.Map.prototype.loadAreas = function(layerConfig, source) {
    // FIXME: make admin level configurable
    var map = this;
    var adminLevel = layerConfig.adminLevel;
    var report = source.count([layerConfig.adminLevel + "+name", layerConfig.adminLevel + "+code"]);
    var min = report.getMin("#meta+count");
    var max = report.getMax("#meta+count");
    hxlmaps.makeLegendControl(layerConfig, min, max).addTo(map.map);
    var layer = L.layerGroup();
    report.forEach(function (row) {
        var label = row.get(adminLevel + "+name") || row.get(adminLevel);
        var value = parseFloat(row.get("#meta+count"));
        if (isNaN(value)) {
            console.info("Non-numeric value", value);
            return;
        }
        var percentage = (value - min) / (max - min);
        var colorMap = layerConfig.colorMap;
        if (!colorMap) {
            colorMap = hxlmaps.defaultColorMap;
        }
        var color = hxlmaps.genColor(percentage, colorMap);
        var pcode = row.get(adminLevel + "+code");
        //pcode = pcode.replace("MLI", "ML"); // fixme temporary
        if (pcode) {
            hxlmaps.getGeometry(pcode, layerConfig.adminLevel, function(feature) {
                // fixme - deal with holes (somehow) - example: Bamako capital area
                if (feature) {
                    feature.forEach(function(contour) {
                        var area = L.polygon(contour, {
                            fillColor: color,
                            color: "#000000",
                            weight: 1,
                            opacity: 0.5
                        });
                        area.bindPopup(L.popup().setContent(label + ": " + value + " " + layerConfig.unit));
                        layer.addLayer(area);
                        map.extendBounds(contour);
                    });
                } else {
                    console.error("No feature found for", pcode);
                }
                layer.addTo(map.map);
                map.overlayMaps[layerConfig.name] = layer;
                map.fitBounds();
                map.updateLayerControl();
            });
        } else {
            console.info("No pcode in row");
        }
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


//
// Data
//

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

