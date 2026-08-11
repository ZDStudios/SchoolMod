// ==UserScript==
// @name         EP Hacks
// @namespace    zdstudios
// @version      1.0
// @description  EP Hacks
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // 👉 set your raw GitHub URL here
    const SCRIPT_URL = 'https://raw.githubusercontent.com/ZDStudios/SchoolMod/refs/heads/v2-desktop/EducationPerfect/EP-Hacks/code.js';

    GM_xmlhttpRequest({
        method: 'GET',
        url: SCRIPT_URL + '?t=' + Date.now(), // cache-bust so you always get latest
        onload: function (res) {
            if (res.status === 200) {
                try {
                    new Function(res.responseText)();
                } catch (e) {
                    console.error('Remote script error:', e);
                }
            } else {
                console.error('Failed to fetch remote script:', res.status);
            }
        },
        onerror: function (err) {
            console.error('Fetch error:', err);
        }
    });
})();
