// BetterKahoot+
// Initial lightweight enhancement layer for Kahoot pages.
// Safe, cosmetic, and non-destructive by design.

(function () {
  'use strict';

  if (window.__betterKahootLoaded) return;
  window.__betterKahootLoaded = true;

  const STYLE_ID = 'better-kahoot-plus-style';
  const BADGE_ID = 'better-kahoot-plus-badge';
  const PANEL_ID = 'better-kahoot-plus-panel';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --bkp-bg: rgba(17, 24, 39, 0.88);
        --bkp-border: rgba(255,255,255,0.12);
        --bkp-text: #f8fafc;
        --bkp-accent: #8b5cf6;
        --bkp-accent-2: #22d3ee;
      }
      #${BADGE_ID} {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 999999;
        background: linear-gradient(135deg, var(--bkp-accent), var(--bkp-accent-2));
        color: white;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font: 600 13px/1.1 system-ui, sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,.25);
        cursor: pointer;
      }
      #${PANEL_ID} {
        position: fixed;
        right: 14px;
        bottom: 58px;
        width: 320px;
        max-width: calc(100vw - 28px);
        z-index: 999999;
        background: var(--bkp-bg);
        color: var(--bkp-text);
        border: 1px solid var(--bkp-border);
        border-radius: 16px;
        padding: 14px;
        backdrop-filter: blur(14px);
        box-shadow: 0 16px 40px rgba(0,0,0,.35);
        display: none;
      }
      #${PANEL_ID}.open { display: block; }
      #${PANEL_ID} h3 {
        margin: 0 0 8px;
        font: 700 16px/1.2 system-ui, sans-serif;
      }
      #${PANEL_ID} p, #${PANEL_ID} li, #${PANEL_ID} label {
        font: 500 13px/1.45 system-ui, sans-serif;
      }
      #${PANEL_ID} ul {
        margin: 8px 0 0 18px;
        padding: 0;
      }
      #${PANEL_ID} .bkp-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin: 10px 0;
      }
      #${PANEL_ID} .bkp-pill {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.08);
      }
      .bkp-focus [data-functional-selector], .bkp-focus button, .bkp-focus input {
        box-shadow: 0 0 0 3px rgba(34,211,238,.25) !important;
        border-radius: 12px !important;
      }
      .bkp-zen header,
      .bkp-zen nav,
      .bkp-zen aside,
      .bkp-zen [role="banner"] {
        opacity: .35;
      }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if (document.getElementById(BADGE_ID)) return;

    const badge = document.createElement('button');
    badge.id = BADGE_ID;
    badge.textContent = 'BetterKahoot+';

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <h3>BetterKahoot+</h3>
      <p>First-pass quality-of-life layer for Kahoot.</p>
      <div class="bkp-row">
        <label for="bkp-focus-toggle">Focus mode</label>
        <input id="bkp-focus-toggle" type="checkbox" />
      </div>
      <div class="bkp-row">
        <label for="bkp-zen-toggle">Zen chrome</label>
        <input id="bkp-zen-toggle" type="checkbox" />
      </div>
      <p><span class="bkp-pill">Current page</span> <span id="bkp-page"></span></p>
      <ul>
        <li>Floating quick access panel</li>
        <li>Visual focus highlighting for interactive elements</li>
        <li>Reduced page chrome for cleaner sessions</li>
        <li>Non-destructive, cosmetic-only initial release</li>
      </ul>
    `;

    badge.addEventListener('click', () => panel.classList.toggle('open'));
    document.body.appendChild(panel);
    document.body.appendChild(badge);

    const pageEl = panel.querySelector('#bkp-page');
    if (pageEl) pageEl.textContent = location.pathname || '/';

    const focusToggle = panel.querySelector('#bkp-focus-toggle');
    const zenToggle = panel.querySelector('#bkp-zen-toggle');

    focusToggle?.addEventListener('change', (e) => {
      document.documentElement.classList.toggle('bkp-focus', e.target.checked);
    });

    zenToggle?.addEventListener('change', (e) => {
      document.documentElement.classList.toggle('bkp-zen', e.target.checked);
    });
  }

  function init() {
    injectStyles();
    if (document.body) createPanel();
    else window.addEventListener('DOMContentLoaded', createPanel, { once: true });
  }

  init();
})();
