// ==UserScript==
// @name         Mathspace Customizer
// @namespace    MythicOverlay.MSCustomizer
// @version      1.5
// @description  Replace avatars, background thumbnail, applied background, and UI text on Mathspace
// @author       Zayn
// @match        https://*.mathspace.co/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // Avatar replacement
  const avatarOriginals = [
    "https://mathspace-production-avatars.mathspace.co/img/avatars/avatar_placeholder.png",
    "https://mathspace-au-production-avatars.mathspace.co/img/avatars/avatar_placeholder.png"
  ];
  const avatarReplacement = "https://zdstudios.github.io/SchoolMod/Mathspace/Icons/johnpork.png";

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

  // Text replacement
  const textReplacements = [
    { from: /Default Avatar/g, to: "John Pork (Limited Edition)" },
    { from: /Mathspace \(Default\)/g, to: "John Pork Background" }
  ];

  const replaceTextNodes = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      textReplacements.forEach(({ from, to }) => {
        node.textContent = node.textContent.replace(from, to);
      });
    }
  };

  // Direct title override
  const overrideTitleElement = () => {
    const title = document.querySelector('h3.css-1ng2lf3');
    if (title && title.textContent.includes('Mathspace')) {
      title.textContent = "John Pork Background"
    }
  };

  // Background thumbnail replacement in selector
  const defaultThumbnailSrc = "https://mathspace-production-static.mathspace.co/permalink/backgrounds/new/thumbnails/default.png";
  const customThumbnailSrc = "https://zdstudios.github.io/SchoolMod/Mathspace/Icons/JohnPork-Background.png";

  const replaceBackgroundThumbnail = () => {
    const bgImg = document.querySelector(`img[src="${defaultThumbnailSrc}"]`);
    if (bgImg) {
      bgImg.src = customThumbnailSrc;
      bgImg.alt = "John Pork Background";
    }
  };

  // Applied background replacement
  const appliedBackgroundSelector = 'div[style*="background-image"]';
  const originalBgURL = "https://mathspace-production-static.mathspace.co/permalink/backgrounds/background_placeholder_v2.svg";
  const customBgURL = "https://zdstudios.github.io/SchoolMod/Mathspace/Icons/JohnPork-Background.svg";

  const replaceAppliedBackground = () => {
    document.querySelectorAll(appliedBackgroundSelector).forEach(el => {
      const style = el.getAttribute("style");
      if (style && style.includes(originalBgURL)) {
        el.style.backgroundImage = `url("${customBgURL}")`;
      }
    });
  };

  // Unified runner
  const runAllReplacements = () => {
    replaceAvatars();
    replaceTextNodes();
    overrideTitleElement();
    replaceBackgroundThumbnail();
    replaceAppliedBackground();
  };

  // Initial run
  runAllReplacements();

  // Observe dynamic changes
  const observer = new MutationObserver(runAllReplacements);
  observer.observe(document.body, { childList: true, subtree: true });
})();
