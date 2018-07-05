hxlmaps = {
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
    this.layers = [];

    if (mapConfig) {
        this.map = L.map(mapId).setView([0, 0], 6);

        if (mapConfig.layers) {
            mapConfig.layers.forEach(function(layerConfig) {
                var layer = new hxlmaps.Layer(outer.map, layerConfig);
                layer.setup();
                outer.layers.push(layer);
            });
        }
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
 */
hxlmaps.Layer.prototype.setup = function () {
    var outer = this;
    
    this.loadHXL().done(function () {
        outer.setType();
        if (outer.config.type == "points") {
            outer.setupPoints();
        } else if (outer.config.type == "areas") {
            outer.setupAreas();
        } else {
            console.error("Bad layer type", outer.config.type);
        }
    });
};

/**
 * Continue setup for a points layer.
 */
hxlmaps.Layer.prototype.setupPoints = function () {
};

/**
 * Continue setup for an areas layer.
 */
hxlmaps.Layer.prototype.setupAreas = function () {
    var outer = this;
    this.source = this.source.count([this.config.adminLevel + "+name", this.config.adminLevel + "+code"]);
    this.setCountries();
    this.loadGeoJSON().done(function () {
        console.log("Finished loading countries", outer.countryMap);
        for (var key in outer.countryMap) {
            var entry = outer.countryMap[key];
            if (entry.geojson) {
                entry.leafletLayer = L.geoJSON(entry.geojson);
                entry.leafletLayer.addTo(outer.map);
            }
        }
    });
};

/**
 * Load the HXL data for the layer.
 */
hxlmaps.Layer.prototype.loadHXL = function() {
    var outer = this;
    if (this.config.url) {
        var url = "https://proxy.hxlstandard.org/data.json?url=" + encodeURIComponent(this.config.url);
        var promise = jQuery.getJSON(url);
        promise.fail(function () {
            console.error("Unable to read HXL dataset", url);
        });
        return promise.done(function (source) {
            outer.source = hxl.wrap(source);
            console.log("Loaded HXL", outer.source);
        });
    } else {
        console.error("No dataset specified for layer", this.config);
        return  undefined;
    }
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
 * Load GeoJSON from iTOS for all required countries.
 */
hxlmaps.Layer.prototype.loadGeoJSON = function () {
    var outer = this;
    var countries = Object.keys(outer.countryMap);
    var urlPattern = "https://gistmaps.itos.uga.edu/arcgis/rest/services/COD_External/{{country}}_pcode/MapServer/{{level}}/query?where=1%3D1&outFields=*&f=geojson";
    var l = hxlmaps.itosAdminInfo[outer.config.adminLevel];
    if (!l) {
        console.error("Unrecognised admin level", outer.config.adminLevel);
        return;
    }
    var promises = []
    countries.forEach(function (countryCode) {
        var url = urlPattern.replace("{{country}}", countryCode);
        url = url.replace("{{level}}", l.level);
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


////////////////////////////////////////////////////////////////////////
// Static data
////////////////////////////////////////////////////////////////////////

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
