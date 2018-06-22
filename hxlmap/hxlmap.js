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
 * Set up a HXL map
 */
hxlmap.setup = function (html_id) {
    hxlmap.map = L.map(html_id).setView([0, 0], 6);
    L.tileLayer(hxlmap.tiles.url, hxlmap.tiles.properties).addTo(hxlmap.map);
};

/**
 * Add a layer to a HXL map
 */
hxlmap.addHXL = function(hxl_url) {
    hxl.load(hxl_url, function (source) {
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
    });
};

