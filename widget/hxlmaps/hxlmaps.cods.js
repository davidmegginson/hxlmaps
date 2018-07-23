/**
 * CODS-related functions for HXL maps
 */

hxlmaps.cods = {};

hxlmaps.cods.countryInfoPromiseCache = {};

hxlmaps.cods.geoJsonPromiseCache = {};

/**
 * Determine a country for a P-code.
 * @param pcode: the P-code to look up.
 * @returns: an ISO3 country code, or false on failure.
 */
hxlmaps.cods.getPcodeCountry = function(pcode) {
    var code = pcode.substr(0, 3).toUpperCase();
    if (hxlmaps.cods.iso3map[code]) {
        return code;
    } else if (hxlmaps.cods.iso2map[code.substr(0, 2)]) {
        return hxlmaps.cods.iso2map[code.substr(0, 2)];
    } else {
        return false;
    }
};

/**
 * Do a fuzzy P-code lookup, trying various substitutions
 * Force the P-code to upper case, and try both ISO2 and ISO3 variants.
 * @param pcode: the P-code to look up
 * @param obj: the object (hashmap) in which to look up the P-code.
 * @returns: the value associated with the P-code in the object/hashmap if found; otherwise, undefined.
 */
hxlmaps.cods.fuzzyPcodeLookup = function(pcode, obj) {
    var iso2, iso3, newPcode;

    pcode = pcode.toUpperCase();

    // try a straight lookup
    if (obj[pcode]) {
        return obj[pcode];
    }

    // try swapping iso3 for iso2
    var iso2 = hxlmaps.cods.iso3map[pcode.substr(0, 3)];
    if (iso2) {
        newPcode = iso2 + pcode.substr(3);
        if (obj[newPcode]) {
            return obj[newPcode];
        }
    }

    // try swapping iso2 for iso3
    var iso3 = hxlmaps.cods.iso2map[pcode.substr(0, 2)];
    if (iso3) {
        var newPcode = iso3 + pcode.substr(2);
        if (obj[newPcode]) {
            return obj[newPcode];
        }
    }

    // no joy
    return undefined;
};


/**
 * Load list of admin levels for a country.
 * @param countryCode: an ISO3 country code.
 * @returns: the promise for loading the JSON.
 */
hxlmaps.cods.loadItosCountryInfo = function(countryCode) {

    // if we've already loaded or started loading the country info,
    // return the existing promise
    if (hxlmaps.cods.countryInfoPromiseCache[countryCode]) {
        console.info("Hit country info cache", countryCode);
        return hxlmaps.cods.countryInfoPromiseCache[countryCode];
    }

    // need to create a new promise to load it
    var deferred = $.Deferred();
    var urlPattern = "https://gistmaps.itos.uga.edu/arcgis/rest/services/COD_External/{{country}}_pcode/MapServer?f=json";
    var url = urlPattern.replace("{{country}}", countryCode.toUpperCase());
    var promise = jQuery.getJSON(url).done(json => {
        deferred.resolve(json.layers);
    });
    hxlmaps.cods.countryInfoPromiseCache[countryCode] = promise;
    return promise;
};

/**
 * Load GeoJSON from iTOS
 * @param countryCode: an ISO3 country code
 * @param adminLevel: a HXL admin level (e.g. #country, #adm3)
 * @returns: the promise for loading the GeoJSON.
 */
hxlmaps.cods.loadItosLevel = function (countryCode, adminLevel) {

    var cacheKey = [countryCode, adminLevel];

    // if we've already loaded or started loading the GeoJSON,
    // return the existing promise
    if (hxlmaps.cods.geoJsonPromiseCache[cacheKey]) {
        return hxlmaps.cods.geoJsonPromiseCache[cacheKey];
    }

    // need to create a new promise to load it
    var adminInfo = hxlmaps.cods.itosAdminInfo[adminLevel];
    if (!adminInfo) {
        console.error("Unrecognised admin level", adminLevel);
        return;
    }
    
    var promise = hxlmaps.cods.loadItosCountryInfo(countryCode).then(countryInfo => {
        var levelId;
        for (var i = 0; i < countryInfo.layers.length; i++) {
            layerInfo = countryInfo.layers[i];
            if (adminInfo.layerName == layerInfo.name) {
                levelId = layerInfo.id;
                break;
            }
        }
        var urlPattern = "https://gistmaps.itos.uga.edu/arcgis/rest/services/COD_External/{{country}}_pcode/MapServer/{{level}}/query?where=1%3D1&outFields=*&f=geojson";
        var url = urlPattern.replace("{{country}}", countryCode.toUpperCase());
        url = url.replace("{{level}}", levelId);
        return jQuery.getJSON(url);
    });

    hxlmaps.cods.geoJsonPromiseCache[cacheKey] = promise;

    return promise;
};

/**
 * Map from the admin levels used by HXL to those used by iTOS
 */
hxlmaps.cods.itosAdminInfo = {
    "#country": {
        level: 1,
        layerName: "Admin0",
        property: "admin0Pcode"
    },
    "#adm1": {
        level: 2,
        layerName: "Admin1",
        property: "admin1Pcode"
    },
    "#adm2": {
        level: 3,
        layerName: "Admin2",
        property: "admin2Pcode"
    },
    "#adm3": {
        level: 4,
        layerName: "Admin3",
        property: "admin3Pcode"
    },
    "#adm4": {
        level: 5,
        layerName: "Admin4",
        property: "admin4Pcode"
    },
    "#adm5": {
        level: 6,
        layerName: "Admin5",
        property: "admin5Pcode"
    }
};


/**
 * ISO2 and ISO3 country codes
 */
hxlmaps.cods.countryCodes = [
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
hxlmaps.cods.iso2map = {};
hxlmaps.cods.iso3map = {};
hxlmaps.cods.countryCodes.forEach(entry => {
    hxlmaps.cods.iso2map[entry[0]] = entry[1];
    hxlmaps.cods.iso3map[entry[1]] = entry[0];
});

