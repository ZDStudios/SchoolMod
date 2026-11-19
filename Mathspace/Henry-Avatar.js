// ==UserScript==
// @name         Mathspace Customizer
// @namespace    MythicOverlay.MSCustomizer
// @version      1.9
// @description  Replace avatars, background thumbnail, applied background, UI text, and summon a monkey every 20 minutes
// @author       Zayn
// @match        https://*.mathspace.co/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const avatarOriginals = [
    "https://mathspace-production-avatars.mathspace.co/img/avatars/avatar_placeholder.png",
    "https://mathspace-au-production-avatars.mathspace.co/img/avatars/avatar_placeholder.png"
  ];

  const avatarReplacement =
    "https://zdstudios.github.io/SchoolMod/Mathspace/Henry/Henry-MB-Avatar.png";

  const customBgURL =
    "https://zdstudios.github.io/SchoolMod/Mathspace/Henry/Henry-MB-Avatar.svg";

  const defaultThumbnailSrc =
    "https://mathspace-production-static.mathspace.co/permalink/backgrounds/new/thumbnails/default.png";

  const originalBgURL =
    "https://mathspace-production-static.mathspace.co/permalink/backgrounds/background_placeholder_v2.svg";

  const modalBgURL =
    "https://mathspace-production-static.mathspace.co/permalink/backgrounds/new/default.svg";

  const customThumbnailSrc =
    "https://zdstudios.github.io/SchoolMod/Mathspace/Henry/Henry-MB-Avatar.png";

  // Text replacements
  const textReplacements = [
    { from: /Default Avatar/g, to: "Henry Hedley" },
    { from: /Sandcastle/g, to: "Good Boy☠️" },
    { from: /Girl/g, to: "Minion" }
  ];

  // ============================================================
  // AVATAR REPLACEMENT
  // ============================================================

  const replaceAvatars = () => {
    document.querySelectorAll("img").forEach(img => {
      if (avatarOriginals.includes(img.src)) {
        img.src = avatarReplacement;
      }
    });

    document.querySelectorAll("[style*='background-image']").forEach(el => {
      const bgImage = el.style.backgroundImage;
      avatarOriginals.forEach(original => {
        if (bgImage.includes(original)) {
          el.style.backgroundImage = `url("${avatarReplacement}")`;
        }
      });
    });
  };

  // ============================================================
  // TEXT REPLACEMENT (Loop-Safe)
  // ============================================================

  const replaceTextNodes = () => {
    if (!document.body) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Avoid targeting script/style elements to prevent UI crashes
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'textarea') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      let val = node.nodeValue;
      let modified = false;

      textReplacements.forEach(({ from, to }) => {
        if (from.test(val)) {
          val = val.replace(from, to);
          modified = true;
        }
      });

      // Only re-assign if a change occurred to prevent mutation loops
      if (modified) {
        node.nodeValue = val;
      }
    }
  };

  // ============================================================
  // TITLE
  // ============================================================

  const overrideTitleElement = () => {
    const title = document.querySelector('h3.css-1ng2lf3');
    if (title && title.textContent.includes('Mathspace')) {
      title.textContent = "Cosmic Piggy (Limited time)";
    }
  };

  // ============================================================
  // BACKGROUND THUMBNAIL
  // ============================================================

  const replaceBackgroundThumbnail = () => {
    const bgImg = document.querySelector(`img[src="${defaultThumbnailSrc}"]`);
    if (bgImg) {
      bgImg.src = customThumbnailSrc;
      bgImg.alt = "John Pork Background";
    }
  };

  // ============================================================
  // APPLIED & MODAL BACKGROUND
  // ============================================================

  const replaceAppliedBackground = () => {
    document.querySelectorAll('div[style*="background-image"]').forEach(el => {
      const style = el.getAttribute("style");
      if (style && (style.includes(originalBgURL) || style.includes(modalBgURL))) {
        el.style.backgroundImage = `url("${customBgURL}")`;
      }
    });
  };

  // ============================================================
  // 🐒 MONKEY JUMPSCARE
  // ============================================================

  const monkeyURL =
    "https://media.istockphoto.com/id/182149744/photo/scary-looking-vintage-monkey-in-clothes-playing-cymbals.jpg?s=612x612&w=0&k=20&c=-Ko7hiuH5qWMomnnUZTR_bE-RlRJLL80-JFfJy5J908=";

  const summonMonkey = () => {
    if (!document.body) return;

    const monkey = document.createElement("img");
    monkey.src = monkeyURL;

    Object.assign(monkey.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      objectFit: "cover",
      zIndex: "2147483647",
      pointerEvents: "none"
    });

    document.body.appendChild(monkey);

    setTimeout(() => {
      monkey.remove();
    }, 500);
  };

  // Every 20 minutes (1200000 ms)
  setInterval(summonMonkey, 20 * 60 * 1000);

  // ============================================================
  // RUN EVERYTHING WITH DEBOUNCE / MUTATION GUARD
  // ============================================================

  let isRunning = false;

  const runAllReplacements = () => {
    if (isRunning) return;
    isRunning = true;

    // Temporarily disconnect observer while mutating DOM
    observer.disconnect();

    replaceAvatars();
    replaceTextNodes();
    overrideTitleElement();
    replaceBackgroundThumbnail();
    replaceAppliedBackground();

    // Re-enable observer after DOM changes settle
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    isRunning = false;
  };

  // Setup Observer
  const observer = new MutationObserver(runAllReplacements);

  // Initialize once the document is ready
  const init = () => {
    runAllReplacements();

    // Inject external script safely
    const injectScript = document.createElement('script');
    injectScript.src = 'https://zdstudios.github.io/SchoolMod/Mathspace/inject.js';
    injectScript.type = 'text/javascript';
    injectScript.onload = () => console.log('[MSC] External inject.js loaded successfully');
    injectScript.onerror = () => console.warn('[MSC] Failed to load inject.js');
    (document.head || document.documentElement).appendChild(injectScript);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
