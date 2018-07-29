window.onload = function () {

    var form = document.forms[0];
    var jsonField = form.elements["config"];

    var jsonString = getParameterByName("config");
    if (jsonString) {
        try {
            jsonString = JSON.stringify(JSON.parse(jsonString), null, 4);
        } catch (e) {
            console.info("Config is not well-formed JSON");
        }
        jsonField.value = jsonString;
    }
        
    window.onsubmit = function () {
        var titleNode = document.getElementById('map-title');
        var linkNode = document.getElementById('map-link');
        try {
            var json = JSON.parse(jsonField.value);
            if (json.title) {
                titleNode.textContent = "[Preview] " + json.title;
            }
            var mapUrl = "index.html?config=" + encodeURIComponent(JSON.stringify(json));
            linkNode.setAttribute("href", mapUrl);
            linkNode.textContent = linkNode.href;
            window.open(mapUrl, 'hxlmap');
        } catch (e) {
            console.error(e);
            alert(e);
        }
        return false;
    };
};


/**
 * Get a parameter from the URI query string
 * @param {string} name - the parameter name.
 * @returns - the value, or null if not present.
 */
function getParameterByName(name) {
    var url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}
