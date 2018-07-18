window.onload = function () {
    var form = document.forms[0];
    form.onsubmit = function () {
        var jsonField = form.elements["config"];
        var linkNode = document.getElementById('map-link');
        console.log(linkNode);
        try {
            var json = JSON.parse(jsonField.value);
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
