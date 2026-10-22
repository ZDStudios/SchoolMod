// ==UserScript==
// @name         Always Active Tab
// @namespace    always-active-tab
// @version      1.0
// @description  One switch: pages think they're fullscreen and that you never left the tab. Ctrl+U shows/hides the toggle.
// @match        *://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// ==/UserScript==

(() => {
  'use strict';

  const w = unsafeWindow;
  const isTop = window.top === window.self;

  let on = !!GM_getValue('enabled', false);

  // ---------- spoofing (runs in the page's own world via unsafeWindow) ----------

  // Override a getter, but fall back to the real one when the switch is off
  const spoofGetter = (obj, prop, fake) => {
    const orig = Object.getOwnPropertyDescriptor(obj, prop);
    try {
      Object.defineProperty(obj, prop, {
        configurable: true,
        enumerable: orig ? orig.enumerable : true,
        get() {
          if (on) return fake.call(this);
          return orig && orig.get ? orig.get.call(this) : undefined;
        }
      });
    } catch (e) {}
  };

  if (!w.__fsSpoofInstalled) {
    w.__fsSpoofInstalled = true;

    // --- "I'm on this tab" ---
    const D = w.Document.prototype;
    spoofGetter(D, 'hidden', () => false);
    spoofGetter(D, 'webkitHidden', () => false);
    spoofGetter(D, 'visibilityState', () => 'visible');
    spoofGetter(D, 'webkitVisibilityState', () => 'visible');

    const origHasFocus = D.hasFocus;
    D.hasFocus = function () {
      return on ? true : origHasFocus.call(this);
    };

    // --- "I'm in fullscreen" ---
    spoofGetter(D, 'fullscreenElement', function () { return this.documentElement; });
    spoofGetter(D, 'webkitFullscreenElement', function () { return this.documentElement; });
    spoofGetter(D, 'webkitCurrentFullScreenElement', function () { return this.documentElement; });
    spoofGetter(D, 'fullscreen', () => true);
    spoofGetter(D, 'webkitIsFullScreen', () => true);
    spoofGetter(D, 'fullscreenEnabled', () => true);

    // window size checks (innerHeight === screen.height is a common fullscreen test)
    spoofGetter(w, 'innerWidth', () => w.screen.width);
    spoofGetter(w, 'innerHeight', () => w.screen.height);
    spoofGetter(w, 'outerWidth', () => w.screen.width);
    spoofGetter(w, 'outerHeight', () => w.screen.height);

    // CSS media query check: (display-mode: fullscreen)
    const origMatchMedia = w.matchMedia;
    w.matchMedia = function (q) {
      const mql = origMatchMedia.call(this, q);
      if (on && /display-mode\s*:\s*fullscreen/i.test(String(q))) {
        return new Proxy(mql, {
          get(t, p) {
            if (p === 'matches') return true;
            const v = t[p];
            return typeof v === 'function' ? v.bind(t) : v;
          }
        });
      }
      return mql;
    };

    // --- swallow "you left" events (only on window/document, not on inputs etc) ---
    const blocked = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'focus', 'focusout', 'pagehide', 'freeze'];
    const stopper = (e) => {
      if (!on) return;
      if (e.target === w || e.target === w.document) e.stopImmediatePropagation();
    };
    blocked.forEach((t) => {
      w.addEventListener(t, stopper, true);
      w.document.addEventListener(t, stopper, true);
    });
  }

  // ---------- Ctrl+U: show / hide the toggle ----------

  let showUI = () => {};
  let toggleUI = () => {};
  let setSwitch = () => {};

  // keep every frame in sync when the switch is flipped (here or in another tab)
  GM_addValueChangeListener('enabled', (_n, _old, val) => {
    on = !!val;
    setSwitch(on);
  });

  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'u')) return;
    e.preventDefault(); // stop view-source
    e.stopImmediatePropagation();
    if (isTop) toggleUI();
    else window.top.postMessage('__aat_toggle_ui', '*');
  }, true);

  if (!isTop) return;

  window.addEventListener('message', (e) => {
    if (e.data === '__aat_toggle_ui') toggleUI();
  });

  // ---------- toggle panel (top frame only) ----------

  let host = null;

  const setEnabled = (v) => {
    on = v;
    GM_setValue('enabled', v);
  };

  const build = () => {
    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .box { width: 240px; padding: 16px; box-sizing: border-box; border-radius: 10px;
               font-family: system-ui, sans-serif; background: #14161f; color: #eee;
               box-shadow: 0 4px 20px rgba(0,0,0,.5); }
        h1 { font-size: 15px; margin: 0 0 12px; font-weight: 600; }
        .row { display: flex; align-items: center; justify-content: space-between; }
        #status { font-size: 13px; }
        .switch { position: relative; width: 46px; height: 26px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; inset: 0; background: #444; border-radius: 26px; cursor: pointer; transition: .2s; }
        .slider:before { content: ""; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
        input:checked + .slider { background: #4ade80; }
        input:checked + .slider:before { transform: translateX(20px); }
        p { font-size: 11px; color: #9aa; margin: 12px 0 0; }
      </style>
      <div class="box">
        <h1>👻 Always Active Tab</h1>
        <div class="row">
          <span id="status">Off</span>
          <label class="switch"><input type="checkbox" id="toggle"><span class="slider"></span></label>
        </div>
        <p>Reload a tab if a site checked things before the switch was flipped. Ctrl+U hides this.</p>
      </div>`;
    const toggle = root.getElementById('toggle');
    const status = root.getElementById('status');
    setSwitch = (v) => {
      toggle.checked = v;
      status.textContent = v ? 'On ✅' : 'Off';
    };
    setSwitch(on);
    toggle.addEventListener('change', () => {
      setEnabled(toggle.checked);
      setSwitch(toggle.checked);
    });
    // keep key events inside the panel from reaching the page
    host.addEventListener('keydown', (e) => e.stopPropagation());
  };

  showUI = () => {
    if (!host) build();
    setSwitch(on);
    (document.body || document.documentElement).appendChild(host);
  };

  toggleUI = () => {
    if (host && host.isConnected) host.remove();
    else showUI();
  };

})();
