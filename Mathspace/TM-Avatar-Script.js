// ==UserScript==
// @name         Mathspace Customizer
// @namespace    MythicOverlay.MSCustomizer
// @version      1.7
// @description  Replace avatars, background thumbnail, applied background, and UI text on Mathspace
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
  const avatarReplacement = "https://zdstudios.github.io/SchoolMod/Mathspace/Icons/johnpork.png";

  const customBgURL = "https://zdstudios.github.io/SchoolMod/Mathspace/Icons/JohnPork-Background.svg";
  const defaultThumbnailSrc = "https://mathspace-production-static.mathspace.co/permalink/backgrounds/new/thumbnails/default.png";
  const originalBgURL = "https://mathspace-production-static.mathspace.co/permalink/backgrounds/background_placeholder_v2.svg";
  const modalBgURL = "https://mathspace-production-static.mathspace.co/permalink/backgrounds/new/default.svg";

  const customThumbnailSrc = "https://zdstudios.github.io/SchoolMod/Mathspace/Icons/JohnPork-Background.png";

  const textReplacements = [
    { from: /Default Avatar/g, to: "John Pork (Limited time)" },
    { from: /Sandcastle/g, to: "Mr Piggy" },
    { from: /Girl/g, to: "Minion" }
  ];

  const replaceAvatars = () => {
    document.querySelectorAll("img").forEach(img => {
      if (avatarOriginals.includes(img.src)) {
        img.src = avatarReplacement;
      }
    });

    document.querySelectorAll("*").forEach(el => {
      const style = window.getComputedStyle(el);
      const bgImage = style.getPropertyValue("background-image");
      avatarOriginals.forEach(original => {
        if (bgImage.includes(original)) {
          el.style.backgroundImage = `url("${avatarReplacement}")`;
        }
      });
    });
  };

  const replaceTextNodes = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      textReplacements.forEach(({ from, to }) => {
        node.textContent = node.textContent.replace(from, to);
      });
    }
  };

  const overrideTitleElement = () => {
    const title = document.querySelector('h3.css-1ng2lf3');
    if (title && title.textContent.includes('Mathspace')) {
      title.textContent = "Cosmic Piggy (Limited time)";
    }
  };

  const replaceBackgroundThumbnail = () => {
    const bgImg = document.querySelector(`img[src="${defaultThumbnailSrc}"]`);
    if (bgImg) {
      bgImg.src = customThumbnailSrc;
      bgImg.alt = "John Pork Background";
    }
  };

  const replaceAppliedBackground = () => {
    document.querySelectorAll('div[style*="background-image"]').forEach(el => {
      const style = el.getAttribute("style");
      if (style && style.includes(originalBgURL)) {
        el.style.backgroundImage = `url("${customBgURL}")`;
      }
    });
  };

  const replaceModalBackground = () => {
    document.querySelectorAll('div[style*="background-image"]').forEach(el => {
      const style = el.getAttribute("style");
      if (style && style.includes(modalBgURL)) {
        el.style.backgroundImage = `url("${customBgURL}")`;
      }
    });
  };

  const runAllReplacements = () => {
    replaceAvatars();
    replaceTextNodes();
    overrideTitleElement();
    replaceBackgroundThumbnail();
    replaceAppliedBackground();
    replaceModalBackground();
  };

  runAllReplacements();

  const observer = new MutationObserver(runAllReplacements);
  observer.observe(document.body, { childList: true, subtree: true });

  // 🔗 Inject external script from GitHub
  const injectScript = document.createElement('script');
  injectScript.src = 'https://zdstudios.github.io/SchoolMod/Mathspace/inject.js';
  injectScript.type = 'text/javascript';
  injectScript.onload = () => console.log('[MSC] External inject.js loaded successfully');
  injectScript.onerror = () => console.warn('[MSC] Failed to load inject.js');
  document.head.appendChild(injectScript);
})();
