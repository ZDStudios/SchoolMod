// ==UserScript==
// @name         Mathspace Avatar & Text Replacer
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Replace default avatars and specific text on Mathspace
// @author       Zayn
// @match        https://mathspace.co/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const originalUrls = [
        "https://mathspace-production-avatars.mathspace.co/img/avatars/avatar_placeholder.png",
        "https://mathspace-au-production-avatars.mathspace.co/img/avatars/avatar_placeholder.png"
    ];

    const replacementUrl = "https://zdstudios.github.io/SchoolMod/Mathspace/Icons/johnpork.png";

    const replaceAllAvatars = () => {
        document.querySelectorAll("img").forEach(img => {
            if (originalUrls.includes(img.src)) {
                img.src = replacementUrl;
            }
        });

        document.querySelectorAll("*").forEach(el => {
            const style = window.getComputedStyle(el);
            const bgImage = style.getPropertyValue("background-image");
            originalUrls.forEach(original => {
                if (bgImage.includes(original)) {
                    el.style.backgroundImage = `url("${replacementUrl}")`;
                }
            });
        });
    };

    const replaceTextContent = () => {
        const replacements = [
            { from: /Default Avatar/g, to: "John Pork (Limited Edition)" },
            { from: /Mathspace (Default)/g, to: "John Pork Background" },
            // Add more replacements here
        ];

        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walk.nextNode())) {
            replacements.forEach(({ from, to }) => {
                node.textContent = node.textContent.replace(from, to);
            });
        }
    };

    const runAllReplacements = () => {
        replaceAllAvatars();
        replaceTextContent();
    };

    // Initial run
    runAllReplacements();

    // Observe DOM changes for dynamic content
    const observer = new MutationObserver(runAllReplacements);
    observer.observe(document.body, { childList: true, subtree: true });
})();
