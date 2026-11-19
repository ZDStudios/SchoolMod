// ==UserScript==
// @name         TC School Bell
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Intercepts student portal data and injects custom links with working icons
// @match        https://portal.trinity.wa.edu.au/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {

    // =========================================================
    //   CUSTOM LINKS CONFIG — Edit here to add/change links
    // =========================================================
    const CUSTOM_LINKS = [
        {
            display_name: "School Bell",
            url: "https://zdstudios.github.io/SchoolMod/Schools/Trinity%20College/bell.html",
            icon_url: "https://zdstudios.github.io/SchoolMod/Schools/Trinity%20College/bell.png",
            category_name: "ICT",
            category_colour1: "#20e0a9",
            category_colour2: "#205ce0",
        },
        // Add more links here:
        // {
        //     display_name: "My Link",
        //     url: "https://example.com",
        //     icon_url: "https://example.com/icon.png",
        //     category_name: "Resources",
        //     category_colour1: "#3214de",
        //     category_colour2: "#e020e0",
        // },
    ];
    // =========================================================

    const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    const origFetch = win.fetch.bind(win);

    const iconCache = {};

    async function fetchIconAsBase64(url) {
        if (iconCache[url]) return iconCache[url];
        try {
            const res = await origFetch(url);
            const blob = await res.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => { iconCache[url] = reader.result; resolve(reader.result); };
                reader.onerror  = () => resolve(url);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.warn('[TM] Icon fetch failed:', url, e);
            return url;
        }
    }

    CUSTOM_LINKS.forEach(link => fetchIconAsBase64(link.icon_url));

    function buildCustomLink(entry, index) {
        return {
            id: 90000 + index,
            display_name: entry.display_name,
            link: {
                id: 90000 + index,
                documentId: "custom_link_" + index,
                name: entry.display_name,
                url: entry.url,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                publishedAt: new Date().toISOString(),
                icon: {
                    id: 90000 + index,
                    documentId: "custom_icon_" + index,
                    name: "custom_icon_" + index + ".png",
                    alternativeText: entry.display_name + " icon",
                    caption: null,
                    focalPoint: null,
                    width: 150,
                    height: 150,
                    formats: null,
                    hash: "custom_icon_" + index,
                    ext: ".png",
                    mime: "image/png",
                    size: 1.0,
                    url: "/placeholder",
                    previewUrl: null,
                    provider: "local",
                    provider_metadata: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    publishedAt: new Date().toISOString()
                },
                category: {
                    id: 90000 + index,
                    documentId: "custom_category_" + index,
                    Name: entry.category_name,
                    Colour1: entry.category_colour1,
                    Colour2: entry.category_colour2,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    publishedAt: new Date().toISOString()
                }
            }
        };
    }

    win.fetch = async function (input, init) {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes('/api/portal/student')) {
            console.log('[TM] Intercepted student API, injecting custom links...');
            try {
                const studentRes   = await origFetch(input, init);
                const studentData  = await studentRes.json();
                const studentLinks = studentData?.data?.[0]?.links ?? [];
                const customLinks  = CUSTOM_LINKS.map((entry, i) => buildCustomLink(entry, i));
                const merged = JSON.parse(JSON.stringify(studentData));
                merged.data[0].links = [...studentLinks, ...customLinks];
                console.log('[TM] Total links:', merged.data[0].links.length);
                return new Response(JSON.stringify(merged), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e) {
                console.error('[TM] Merge error:', e);
                return origFetch(input, init);
            }
        }
        return origFetch(input, init);
    };

    function fixImages() {
        CUSTOM_LINKS.forEach(async (link) => {
            const anchors = document.querySelectorAll(`a[href="${link.url}"]`);
            anchors.forEach(async (anchor) => {
                const img = anchor.querySelector('img');
                if (!img || img.dataset.tmFixed) return;
                img.dataset.tmFixed = "1";

                const base64 = await fetchIconAsBase64(link.icon_url);

                img.removeAttribute('srcset');
                img.removeAttribute('sizes');
                img.removeAttribute('width');
                img.removeAttribute('height');   // ← removes Next.js 55px cap
                img.src = base64;

                // Match how other portal icons are sized
                img.style.width       = '55px';
                img.style.height      = '55px';
                img.style.objectFit   = 'contain';
                img.style.display     = 'block';

                console.log('[TM] Fixed icon for:', link.display_name);
            });
        });
    }

    function startObserver() {
        const target = document.body || document.documentElement;
        const observer = new MutationObserver(fixImages);
        observer.observe(target, { childList: true, subtree: true });
        fixImages();
    }

    if (document.body) {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', startObserver);
    }

    console.log('[TM] Trinity Portal custom links v4.1 loaded.');
})();
