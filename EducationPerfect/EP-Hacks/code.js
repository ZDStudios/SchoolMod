// ==UserScript==
// @name         EP Ultimate Automation Helper (v30.0)
// @namespace    http://tampermonkey.net/
// @version      30.0
// @description  Full auto-solver + Focus Spoofing + Deep Multi-Source Image Resolver + Copyable UI + Themes + Custom Task Toggles + Drag Support
// @match        *://*.educationperfect.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ---- Settings State ----
    const settings = {
        autoSolve: true,
        autoSubmit: true,
        antiDetect: true,
        selfMarkBypass: true,
        theme: 'dark'
    };

    // ---- Themes Configuration ----
    const themes = {
        dark: { bg: 'rgba(15, 23, 42, 0.98)', text: '#ffffff', border: '#70B80B', header: '#1e293b', accent: '#38bdf8' },
        light: { bg: 'rgba(248, 250, 252, 0.98)', text: '#0f172a', border: '#10b981', header: '#e2e8f0', accent: '#0284c7' },
        cyberpunk: { bg: 'rgba(18, 16, 38, 0.98)', text: '#00ffcc', border: '#ff007f', header: '#2a1b4e', accent: '#ff007f' },
        minimal: { bg: 'rgba(0, 0, 0, 0.9)', text: '#a3e635', border: '#a3e635', header: '#18181b', accent: '#a3e635' }
    };

    // ---- Anti-Detection Engine (Focus & Fullscreen Spoofing) ----
    (function initSpoofers() {
        try {
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
            document.hasFocus = () => true;
        } catch(e) {}

        const focusEvents = ['blur', 'focusout', 'mouseleave', 'visibilitychange', 'webkitvisibilitychange', 'pagehide'];
        focusEvents.forEach(evt => {
            window.addEventListener(evt, e => { if (settings.antiDetect) e.stopImmediatePropagation(); }, true);
            document.addEventListener(evt, e => { if (settings.antiDetect) e.stopImmediatePropagation(); }, true);
        });

        try {
            const fakeFsElement = document.documentElement;
            Object.defineProperty(document, 'fullscreenElement', { get: () => fakeFsElement, configurable: true });
            Object.defineProperty(document, 'webkitFullscreenElement', { get: () => fakeFsElement, configurable: true });
            Object.defineProperty(document, 'mozFullScreenElement', { get: () => fakeFsElement, configurable: true });
            Object.defineProperty(document, 'msFullscreenElement', { get: () => fakeFsElement, configurable: true });

            Object.defineProperty(document, 'fullscreenEnabled', { get: () => true, configurable: true });
            Object.defineProperty(document, 'webkitFullscreenEnabled', { get: () => true, configurable: true });
        } catch(e) {}

        const fsEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
        fsEvents.forEach(evt => {
            window.addEventListener(evt, e => { if (settings.antiDetect) e.stopImmediatePropagation(); }, true);
            document.addEventListener(evt, e => { if (settings.antiDetect) e.stopImmediatePropagation(); }, true);
        });
    })();

    let autoModeActive = false;
    let currentQuestionID = null;
    let slideSettledTime = 0;
    let fillExecutedTime = 0;
    let filledSuccess = false;
    let bypassed = false;

    const LOOP_SPEED = 200;          
    const SETTLE_DELAY = 400;        
    const SUBMIT_DELAY = 500;        

    // ---- Build Modular UI Overlay ----
    let overlay = document.getElementById('ep-ultimate-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'ep-ultimate-overlay';
    overlay.style.cssText = `
        position: fixed; top: 12px; right: 12px;
        z-index: 999999; width: 340px;
        padding: 0; border-radius: 10px;
        font-size: 12px; font-weight: 600;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
        font-family: system-ui, -apple-system, sans-serif;
        pointer-events: auto; user-select: auto;
        border-right: 5px solid #70B80B;
        transition: background 0.2s, color 0.2s;
        overflow: hidden;
    `;

    overlay.innerHTML = `
        <div id="ep-header" style="padding: 8px 12px; cursor: grab; display: flex; justify-content: space-between; align-items: center; user-select: none; font-weight: 700;">
            <span>🤖 EP Automation v30.0</span>
            <span style="font-size: 10px; opacity: 0.7;">[Drag Me]</span>
        </div>
        <div style="padding: 10px 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <label for="ep-theme-select" style="font-weight: 600;">Theme:</label>
                <select id="ep-theme-select" style="background: rgba(255,255,255,0.1); color: inherit; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;">
                    <option value="dark" style="color:#000;">Dark Slate</option>
                    <option value="light" style="color:#000;">Light Mode</option>
                    <option value="cyberpunk" style="color:#000;">Cyberpunk</option>
                    <option value="minimal" style="color:#000;">Minimal Lime</option>
                </select>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; font-size: 11px;">
                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                    <input type="checkbox" id="toggle-solve" checked style="cursor: pointer;"> Auto Solve
                </label>
                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                    <input type="checkbox" id="toggle-submit" checked style="cursor: pointer;"> Auto Submit
                </label>
                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                    <input type="checkbox" id="toggle-antidetect" checked style="cursor: pointer;"> Anti-Detect
                </label>
                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                    <input type="checkbox" id="toggle-selfmark" checked style="cursor: pointer;"> Self-Mark/Bypass
                </label>
            </div>

            <div id="ep-status-box" style="
                background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.1);
                padding: 8px; border-radius: 6px; min-height: 48px; max-height: 120px;
                overflow-y: auto; white-space: pre-wrap; word-break: break-word;
                user-select: text; -webkit-user-select: text; cursor: text;
                line-height: 1.4; font-size: 11px;
            ">Initializing UI Controls...</div>
        </div>
    `;

    document.body.appendChild(overlay);

    const headerEl = overlay.querySelector('#ep-header');
    const statusBox = overlay.querySelector('#ep-status-box');
    const themeSelect = overlay.querySelector('#ep-theme-select');

    // ---- Apply Theme Logic ----
    function applyTheme(themeName) {
        const t = themes[themeName] || themes.dark;
        settings.theme = themeName;
        overlay.style.background = t.bg;
        overlay.style.color = t.text;
        overlay.style.borderRightColor = t.border;
        headerEl.style.background = t.header;
    }
    applyTheme('dark');

    themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));

    // ---- Toggle Event Handlers ----
    overlay.querySelector('#toggle-solve').addEventListener('change', (e) => settings.autoSolve = e.target.checked);
    overlay.querySelector('#toggle-submit').addEventListener('change', (e) => settings.autoSubmit = e.target.checked);
    overlay.querySelector('#toggle-antidetect').addEventListener('change', (e) => settings.antiDetect = e.target.checked);
    overlay.querySelector('#toggle-selfmark').addEventListener('change', (e) => settings.selfMarkBypass = e.target.checked);

    // ---- Draggable Window Engine ----
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    headerEl.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragOffsetX = e.clientX - overlay.offsetLeft;
        dragOffsetY = e.clientY - overlay.offsetTop;
        headerEl.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        overlay.style.left = `${e.clientX - dragOffsetX}px`;
        overlay.style.top = `${e.clientY - dragOffsetY}px`;
        overlay.style.right = 'auto'; 
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        headerEl.style.cursor = 'grab';
    });

    // ---- Direct Angular & DOM Bypass Engine ----
    function dismissNoAnswerModal() {
        if (!settings.selfMarkBypass) return false;
        let closed = false;

        const modalElements = document.querySelectorAll('.modal-dialog, uib-modal-window, .modal, [class*="modal"]');
        modalElements.forEach(m => {
            try {
                if (window.angular) {
                    const scope = window.angular.element(m).scope();
                    if (scope && scope.self && typeof scope.self.closeDialog === 'function') {
                        scope.self.closeDialog(false);
                        try { scope.$apply(); } catch(e) {}
                        closed = true;
                    }
                }
            } catch(e) {}
        });

        const modalButtons = document.querySelectorAll('.stuck-button, [ng-click*="closeDialog"], .modal-footer div, .modal-footer button, .modal-dialog div, .modal-dialog button, a, span');
        for (let btn of modalButtons) {
            if (btn.offsetParent !== null) {
                const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
                if (txt.includes('submit anyway')) {
                    simulatePreciseClick(btn);
                    closed = true;
                }
            }
        }
        return closed;
    }

    function triggerBypass() {
        if (!settings.selfMarkBypass) return;
        dismissNoAnswerModal();

        if (bypassed) return;
        let didBypass = false;

        document.querySelectorAll('span, button, div, a').forEach(el => {
            el.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && /got\s*it[!.]?/i.test(node.textContent)) {
                    const btn = el.closest('button') || (el.tagName === 'BUTTON' ? el : null) || el;
                    if (btn && (btn.hasAttribute('disabled') || btn.getAttribute('ng-disabled'))) {
                        btn.removeAttribute('disabled');
                        btn.removeAttribute('ng-disabled');
                        node.textContent = node.textContent.replace(/Got\s*It[!.]?/gi, 'Bypass');
                        didBypass = true;
                    }
                }
            });
        });

        if (didBypass) {
            bypassed = true;
            document.querySelectorAll('[ng-disabled]').forEach(el => {
                el.removeAttribute('ng-disabled');
                el.removeAttribute('disabled');
            });
        }
    }

    // ---- Helper Utilities ----
    function extractText(t) {
        if (!t) return '';
        return t.replace(/\[block[^\n]*\n/g,'').replace(/\*\*/g,'').trim();
    }

    function getTargetImageKeys(str) {
        if (!str) return [];
        const match = str.match(/url=["']?([^"'\s>]+)/i) || str.match(/src=["']?([^"'\s>]+)/i) || str.match(/(https?:\/\/[^\s"'\>]+\.(?:jpg|jpeg|png|gif|webp|svg))/i);
        const urlStr = match ? (match[1] || match[0]) : str;
        const cleanUrl = urlStr.replace(/["'\>]/g, '');
        const filename = cleanUrl.split('/').pop().split('?')[0];
        
        const keys = [filename];
        const numMatches = filename.match(/\d{4,}/g);
        if (numMatches) keys.push(...numMatches);
        return keys.filter(k => k && k.length > 2);
    }

    function getTileText(el) {
        if (!el) return '';
        let txt = (typeof el === 'string') ? el : el.innerText || el.textContent || '';
        return txt.replace(/^[\s:\u22EE\u2800-\u28FF\u2022\u25C0-\u25FF\u2630]+/g, '')
                  .replace(/[\s:\u22EE\u2800-\u28FF\u2022\u25C0-\u25FF\u2630]+$/g, '')
                  .trim();
    }

    function normalizeStr(str) {
        return (str || '').toLowerCase().replace(/[\n\r\s]+/g, ' ').trim();
    }

    function parseHighlight(c) {
        const correct = c.CorrectOptions || [];
        const matches = [...(c.TextTemplate || '').matchAll(/\[hl (\d+):([^:]+):/g)];
        return matches.filter(m => correct.includes(parseInt(m[1]))).map(m => ({ index: parseInt(m[1]), text: m[2] }));
    }

    function simulatePreciseClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const props = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, which: 1, buttons: 1 };

        try { el.focus(); } catch(e) {}
        try { el.click(); } catch(e) {}
        ['pointerdown', 'touchstart', 'mousedown', 'pointerup', 'touchend', 'mouseup', 'click'].forEach(evt => {
            try { el.dispatchEvent(new MouseEvent(evt, props)); } catch (e) {}
        });
    }

    function findBestElement(targetText) {
        if (!targetText) return null;

        const imgKeys = getTargetImageKeys(targetText);
        if (imgKeys.length > 0) {
            const allElements = Array.from(document.querySelectorAll('img, [style*="background"], div, span, label, button, .option, [class*="option"]'));
            for (let key of imgKeys) {
                const keyLower = key.toLowerCase();
                for (let el of allElements) {
                    if (el.offsetParent === null) continue;
                    let found = false;
                    if (el.tagName === 'IMG') {
                        const src = el.src || el.getAttribute('ng-src') || el.getAttribute('data-src') || '';
                        if (src.toLowerCase().includes(keyLower)) found = true;
                    }
                    if (!found) {
                        const bg = el.style.backgroundImage || (window.getComputedStyle ? window.getComputedStyle(el).backgroundImage : '');
                        if (bg && bg.toLowerCase().includes(keyLower)) found = true;
                    }
                    if (found) {
                        return el.closest('button, label, [role="radio"], [role="checkbox"], .option, .mc-option, [class*="option"], [class*="choice"], li') || el;
                    }
                }
            }
        }
        
        const targetExact = targetText.trim();
        const rawCandidates = document.querySelectorAll('span, button, div, label, p, [role="checkbox"], [role="radio"], .option, .mc-option');
        const candidates = Array.from(rawCandidates).filter(el => el.offsetParent !== null && el.innerText.length <= targetText.length + 60);

        return candidates.find(el => getTileText(el) === targetExact) || candidates.find(el => el.innerText.trim() === targetExact) || null;
    }

    function robustType(inputEl, text) {
        if (!inputEl) return;
        inputEl.focus();
        inputEl.value = text;
        if (inputEl.getAttribute('contenteditable') === 'true') inputEl.innerText = text;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function getGameScope() {
        let gs = null;
        document.querySelectorAll('*').forEach(el => {
            try {
                if (window.angular) {
                    const s = window.angular.element(el).scope();
                    if (s && s.game && s.game.model) gs = s;
                }
            } catch(e) {}
        });
        return gs;
    }

    function getAnswers(q) {
        const answers = [];
        if (!q?.questionDef?.Components) return answers;
        
        q.questionDef.Components.forEach(c => {
            if (c.Gaps) c.Gaps.forEach(g => { if (g.CorrectOptions?.[0]) answers.push(g.CorrectOptions[0]); });
            if (c.ComponentTypeCode === 'MULTICHOICE_COMPONENT' && c.Options) {
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true) {
                        const t = o.TextTemplate || o.Text || o.Label || o.Description;
                        if (t) answers.push(extractText(t));
                    }
                });
            }
            if (c.ComponentTypeCode === 'HIGHLIGHT_COMPONENT') answers.push(...parseHighlight(c).map(d => d.text));
            if (c.ComponentTypeCode === 'TEXT_BOX_COMPONENT' && c.Options?.[0]) answers.push(c.Options[0].trim());
        });
        return answers;
    }

    function solveCurrentQuestion() {
        if (!settings.autoSolve) return true;
        const gs = getGameScope();
        if (!gs) return false;
        const q = gs.game.model.currentQuestion;
        if (!q?.questionDef?.Components) return true;

        q.questionDef.Components.forEach(c => {
            if (c.ComponentTypeCode === 'MULTICHOICE_COMPONENT' && c.Options) {
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true) {
                        const targetEl = findBestElement(extractText(o.TextTemplate || o.Text || o.Label || o.Description));
                        if (targetEl) simulatePreciseClick(targetEl);
                    }
                });
            }
            if (c.ComponentTypeCode === 'TEXT_BOX_COMPONENT' && c.Options?.[0]) {
                const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]')).filter(i => i.offsetParent !== null);
                inputs.forEach(inp => robustType(inp, c.Options[0].trim()));
            }
        });
        return true;
    }

    function pressSubmitOrContinue() {
        if (!settings.autoSubmit) return false;
        dismissNoAnswerModal();
        triggerBypass();

        const candidates = document.querySelectorAll('button, .button, .ep-button, a, div[role="button"], span[role="button"]');
        for (let b of candidates) {
            if (b.offsetParent === null) continue;
            const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
            if (txt.includes('continue') || txt.includes('submit') || txt.includes('next') || txt.includes('check') || txt.includes('got it') || txt.includes('bypass')) {
                simulatePreciseClick(b);
                return true;
            }
        }
        return false;
    }

    // ---- Core Loop ----
    setInterval(() => {
        const now = Date.now();
        try {
            dismissNoAnswerModal();
            triggerBypass();

            const gs = getGameScope();
            if (!gs) {
                statusBox.innerText = autoModeActive ? '🤖 Waiting for active lesson...' : '⏳ ENGINE STANDBY (Ctrl+Alt+L to Start)';
                if (autoModeActive) pressSubmitOrContinue();
                return;
            }

            const q = gs.game.model.currentQuestion;
            const rawAnswers = getAnswers(q);

            const displayAnswers = rawAnswers.map(ans => {
                const keys = getTargetImageKeys(ans);
                return keys.length > 0 ? `[Img: ${keys[0]}]` : ans;
            });

            statusBox.innerText = (autoModeActive ? '🤖 AUTO ACTIVE\n' : '⏳ ENGINE STANDBY\n') +
                (displayAnswers.length ? 'Answers: ' + displayAnswers.join(' / ') : 'Slide loaded / Ready');

            if (!autoModeActive) return;

            if (q && q.contentID) {
                if (q.contentID !== currentQuestionID) {
                    currentQuestionID = q.contentID;
                    filledSuccess = false;
                    slideSettledTime = now;
                    return;
                }

                if (!filledSuccess && (now - slideSettledTime > SETTLE_DELAY)) {
                    solveCurrentQuestion();
                    filledSuccess = true;
                    fillExecutedTime = now;
                    return;
                }

                if (filledSuccess && (now - fillExecutedTime > SUBMIT_DELAY)) {
                    pressSubmitOrContinue();
                }
            } else {
                pressSubmitOrContinue();
            }
        } catch(e) {}
    }, LOOP_SPEED);

    // Shortcuts: Ctrl+U (Toggle Hide/Show), Ctrl+Alt+L (Toggle Full Auto Mode)
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
        }
        if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            autoModeActive = !autoModeActive;
            overlay.style.borderRightColor = autoModeActive ? '#E11D48' : '#70B80B';
        }
    });
})();
