// ==UserScript==
// @name         EP-Hacks
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Only bypasses if the Got it! button is disabled. Resets after click.
// @author       You
// @match        *://app.educationperfect.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let bypassed = false;

    function resetButtons() {
        bypassed = false;
    }

    function triggerBypass() {
        if (bypassed) return;

        // Find all spans/buttons containing "Got it!"
        let didBypass = false;

        document.querySelectorAll('span, button').forEach(el => {
            el.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && /got\s*it[!.]?/i.test(node.textContent)) {
                    // Find the closest button to check if it's disabled
                    const btn = el.closest('button') || (el.tagName === 'BUTTON' ? el : null);

                    if (btn && btn.hasAttribute('disabled')) {
                        // It's disabled — do the bypass
                        btn.removeAttribute('disabled');
                        btn.removeAttribute('ng-disabled');
                        node.textContent = node.textContent.replace(/Got\s*It[!.]?/gi, 'Bypass');
                        didBypass = true;

                        btn.addEventListener('click', () => {
                            setTimeout(resetButtons, 300);
                        }, { once: true });
                    }
                    // If NOT disabled, leave it completely alone
                }
            });
        });

        if (didBypass) {
            bypassed = true;

            // Also strip ng-disabled from any remaining disabled elements
            document.querySelectorAll('[ng-disabled]').forEach(el => {
                el.removeAttribute('ng-disabled');
            });
        }
    }

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') {
                if (/got\s*it[!.]?/i.test(mutation.target.textContent)) {
                    triggerBypass();
                    return;
                }
            }

            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (/got\s*it[!.]?/i.test(node.textContent || '')) {
                        triggerBypass();
                        return;
                    }
                }
            }
        }
    });

    function startObserver() {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    if (document.body) {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', startObserver);
    }

})();
