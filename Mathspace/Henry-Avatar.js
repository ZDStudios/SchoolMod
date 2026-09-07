```javascript
// ==UserScript==
// @name         Mathspace Customizer
// @namespace    MythicOverlay.MSCustomizer
// @version      1.8
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

  // ============================================================
  // TEXT REPLACEMENT
  // ============================================================

  const replaceTextNodes = () => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;

    while ((node = walker.nextNode())) {
      textReplacements.forEach(({ from, to }) => {
        node.textContent = node.textContent.replace(from, to);
      });
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
    const bgImg = document.querySelector(
      `img[src="${defaultThumbnailSrc}"]`
    );

    if (bgImg) {
      bgImg.src = customThumbnailSrc;
      bgImg.alt = "John Pork Background";
    }
  };

  // ============================================================
  // APPLIED BACKGROUND
  // ============================================================

  const replaceAppliedBackground = () => {
    document
      .querySelectorAll('div[style*="background-image"]')
      .forEach(el => {
        const style = el.getAttribute("style");

        if (style && style.includes(originalBgURL)) {
          el.style.backgroundImage = `url("${customBgURL}")`;
        }
      });
  };

  // ============================================================
  // MODAL BACKGROUND
  // ============================================================

  const replaceModalBackground = () => {
    document
      .querySelectorAll('div[style*="background-image"]')
      .forEach(el => {
        const style = el.getAttribute("style");

        if (style && style.includes(modalBgURL)) {
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
    const monkey = document.createElement("img");

    monkey.src = monkeyURL;

    // Make it cover the entire screen
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

    // Remove after 0.5 seconds
    setTimeout(() => {
      monkey.remove();
    }, 500);
  };

  // Every 20 minutes
  setInterval(summonMonkey, 20 * 60 * 1000);

  // ============================================================
  // RUN EVERYTHING
  // ============================================================

  const runAllReplacements = () => {
    replaceAvatars();
    replaceTextNodes();
    overrideTitleElement();
    replaceBackgroundThumbnail();
    replaceAppliedBackground();
    replaceModalBackground();
  };

  runAllReplacements();

  // ============================================================
  // MUTATION OBSERVER
  // ============================================================

  const observer = new MutationObserver(runAllReplacements);

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // ============================================================
  // EXTERNAL SCRIPT
  // ============================================================

  const injectScript = document.createElement('script');

  injectScript.src =
    'https://zdstudios.github.io/SchoolMod/Mathspace/inject.js';

  injectScript.type = 'text/javascript';

  injectScript.onload = () =>
    console.log('[MSC] External inject.js loaded successfully');

  injectScript.onerror = () =>
    console.warn('[MSC] Failed to load inject.js');

  document.head.appendChild(injectScript);

})();
```

**Behaviour:** the page loads normally → waits **20 minutes** → monkey covers the screen → **500 ms later** it vanishes → repeats every 20 minutes.

If you want to test it without waiting 20 minutes, temporarily change:

```javascript
setInterval(summonMonkey, 20 * 60 * 1000);
```

to:

```javascript
setInterval(summonMonkey, 5 * 1000);
```

That'll make the monkey appear every **5 seconds**. 🐒
