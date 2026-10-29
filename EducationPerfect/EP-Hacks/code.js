// ==UserScript==
// @name         EP Hacks Disabled Notice
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Displays a temporary notice regarding EP hacks during beta testing and remembers dismissal
// @author       You
// @match        *://*.educationperfect.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Check if the notice was already dismissed
    if (localStorage.getItem('ep_hacks_notice_dismissed') === 'true') {
        return;
    }

    window.addEventListener('load', () => {
        // Create overlay container
        const banner = document.createElement('div');
        banner.style.position = 'fixed';
        banner.style.top = '20px';
        banner.style.left = '50%';
        banner.style.transform = 'translateX(-50%)';
        banner.style.backgroundColor = '#1e1e2e';
        banner.style.color = '#f38ba8';
        banner.style.border = '2px solid #f38ba8';
        banner.style.padding = '16px 24px';
        banner.style.borderRadius = '8px';
        banner.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
        banner.style.zIndex = '999999';
        banner.style.fontFamily = 'Arial, sans-serif';
        banner.style.fontSize = '15px';
        banner.style.fontWeight = 'bold';
        banner.style.textAlign = 'center';

        banner.innerHTML = `
            <span>Sorry, but EP hacks have been temporarily disabled for beta testing. They will be turned on at the end of the day.</span>
            <br>
            <button id="close-ep-notice" style="margin-top: 10px; padding: 4px 12px; background: #f38ba8; color: #1e1e2e; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">OK</button>
        `;

        document.body.appendChild(banner);

        // Add dismiss action and save state to memory
        document.getElementById('close-ep-notice').addEventListener('click', () => {
            localStorage.setItem('ep_hacks_notice_dismissed', 'true');
            banner.remove();
        });
    });
})();
