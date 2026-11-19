// ==UserScript==
// @name         EP Hacks Loader
// @namespace    zdstudios
// @version      2.0
// @description  Fetches remote EP script, checks @match rules against current URL, and executes if valid.
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_URL = 'https://raw.githubusercontent.com/ZDStudios/SchoolMod/refs/heads/v2-desktop/EducationPerfect/EP-Hacks/code.js';

    // Converts Tampermonkey @match pattern into a standard JavaScript RegExp
    function matchPatternToRegExp(pattern) {
        if (pattern === '<all_urls>') return /^https?:\/\/.*$/;
        
        let regexString = pattern
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') // Escape special regex characters
            .replace(/\\\*/g, '.*')                    // Convert wildcards (*) to matches (.*)
            .replace(/^http\.\*/, 'https?');           // Handle *:// protocol matching

        return new RegExp('^' + regexString + '$', 'i');
    }

    GM_xmlhttpRequest({
        method: 'GET',
        url: SCRIPT_URL + '?t=' + Date.now(),
        onload: function (res) {
            if (res.status !== 200) {
                console.error('[EP Hacks Loader] Failed to fetch script:', res.status);
                return;
            }

            const code = res.responseText;

            // Extract all //@match rules defined inside the remote script header
            const matchRules = [...code.matchAll(/\/\/\s*@match\s+(.+)/g)].map(m => m[1].trim());

            // Check if current URL matches any of the rules defined in code.js
            const currentUrl = window.location.href;
            const isTargetSite = matchRules.some(pattern => {
                const regex = matchPatternToRegExp(pattern);
                return regex.test(currentUrl);
            });

            if (isTargetSite) {
                console.log(`[EP Hacks Loader] Match confirmed for ${window.location.hostname}. Executing main code...`);
                try {
                    new Function(code)();
                } catch (e) {
                    console.error('[EP Hacks Loader] Remote execution error:', e);
                }
            } else {
                console.log(`[EP Hacks Loader] URL mismatch (${window.location.hostname}). Code execution skipped.`);
            }
        },
        onerror: function (err) {
            console.error('[EP Hacks Loader] Network error fetching script:', err);
        }
    });
})();
