// ==UserScript==
// @name         EP Automation & Answer Fetcher
// @namespace    http://tampermonkey.net/
// @version      32.5
// @description  Automates EP tasks with fixes for punctuation tiles and inline drag-and-drop gaps.
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
        autoHide: localStorage.getItem('ep_autohide') === 'true',
        theme: 'dark'
    };

    // ---- Themes Configuration ----
    const themes = {
        dark: { bg: 'rgba(15, 23, 42, 0.98)', text: '#ffffff', border: '#70B80B', header: '#1e293b', accent: '#38bdf8' },
        light: { bg: 'rgba(248, 250, 252, 0.98)', text: '#0f172a', border: '#10b981', header: '#e2e8f0', accent: '#0284c7' },
        cyberpunk: { bg: 'rgba(18, 16, 38, 0.98)', text: '#00ffcc', border: '#ff007f', header: '#2a1b4e', accent: '#ff007f' },
        minimal: { bg: 'rgba(0, 0, 0, 0.9)', text: '#a3e635', border: '#a3e635', header: '#18181b', accent: '#a3e635' }
    };

    // ---- Anti-Detection Engine ----
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

    // ---- Preserved Text Utility (Punctuation Friendly) ----
    function cleanAnswerText(raw) {
        if (raw === null || raw === undefined) return '';
        let str = String(raw);
        
        const temp = document.createElement('div');
        temp.innerHTML = str;
        str = temp.textContent || temp.innerText || '';

        str = str
            .replace(/\[block[^\n]*\n?/g, '')
            .replace(/<[^>]*>?/gm, '')
            .replace(/\*\*/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        return str;
    }

    function isPromptText(text) {
        if (!text) return true;
        const lower = text.toLowerCase();
        return (
            lower.includes('you might think about') ||
            lower.includes('including adjectives') ||
            lower.includes('using commas to correctly') ||
            lower.includes('write a description') ||
            lower.includes('read the following passage')
        );
    }

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
        display: ${settings.autoHide ? 'none' : 'block'};
    `;

    overlay.innerHTML = `
        <div id="ep-header" style="padding: 8px 12px; cursor: grab; display: flex; justify-content: space-between; align-items: center; user-select: none; font-weight: 700;">
            <span>🤖 EP Automation v32.5</span>
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
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px; font-size: 11px;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; grid-column: span 2; background: rgba(255,255,255,0.08); padding: 5px 8px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.15);">
                    <input type="checkbox" id="toggle-automode" style="cursor: pointer;"> 
                    <span style="font-weight: 700;">🤖 Auto Mode Active</span>
                </label>
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
                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; grid-column: span 2;">
                    <input type="checkbox" id="toggle-autohide" ${settings.autoHide ? 'checked' : ''} style="cursor: pointer;"> Auto-Hide UI on Load
                </label>
            </div>

            <div style="font-size: 10px; opacity: 0.75; text-align: center; margin-bottom: 6px;">
                Press <b style="color: inherit; text-decoration: underline;">Ctrl + U</b> (Menu) | <b style="color: inherit; text-decoration: underline;">Ctrl + Alt + L</b> (Auto)
            </div>

            <div id="ep-status-box" style="
                background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15);
                padding: 8px; border-radius: 6px; min-height: 52px; max-height: 140px;
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
    const autoModeToggle = overlay.querySelector('#toggle-automode');

    function applyTheme(themeName) {
        const t = themes[themeName] || themes.dark;
        settings.theme = themeName;
        overlay.style.background = t.bg;
        overlay.style.color = t.text;
        overlay.style.borderRightColor = autoModeActive ? '#E11D48' : t.border;
        headerEl.style.background = t.header;
    }
    applyTheme('dark');

    function setAutoMode(state) {
        autoModeActive = state;
        if (autoModeToggle) autoModeToggle.checked = autoModeActive;
        const currentTheme = themes[settings.theme] || themes.dark;
        overlay.style.borderRightColor = autoModeActive ? '#E11D48' : currentTheme.border;
    }

    themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));

    autoModeToggle.addEventListener('change', (e) => setAutoMode(e.target.checked));
    overlay.querySelector('#toggle-solve').addEventListener('change', (e) => settings.autoSolve = e.target.checked);
    overlay.querySelector('#toggle-submit').addEventListener('change', (e) => settings.autoSubmit = e.target.checked);
    overlay.querySelector('#toggle-antidetect').addEventListener('change', (e) => settings.antiDetect = e.target.checked);
    overlay.querySelector('#toggle-selfmark').addEventListener('change', (e) => settings.selfMarkBypass = e.target.checked);
    overlay.querySelector('#toggle-autohide').addEventListener('change', (e) => {
        settings.autoHide = e.target.checked;
        localStorage.setItem('ep_autohide', e.target.checked);
    });

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

    // ---- Targeted Bypass Engine ----
    function dismissNoAnswerModal() {
        if (!settings.selfMarkBypass) return false;
        let closed = false;

        const modalButtons = document.querySelectorAll('.stuck-button, [ng-click*="closeDialog"], .modal-footer div, .modal-footer button, .modal-dialog div, .modal-dialog button, button, a, span');
        for (let btn of modalButtons) {
            if (btn.offsetParent !== null) {
                const txt = cleanAnswerText(btn.innerText || btn.textContent || '').toLowerCase();
                if (txt.includes('submit anyway') || txt.includes('yes, submit') || txt.includes('continue anyway')) {
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

    function parseHighlight(c) {
        const correct = c.CorrectOptions || [];
        const matches = [...(c.TextTemplate || '').matchAll(/\[hl (\d+):([^:]+):/g)];
        return matches.filter(m => correct.includes(parseInt(m[1]))).map(m => ({ index: parseInt(m[1]), text: cleanAnswerText(m[2]) }));
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

    function simulateDragAndDrop(sourceEl, targetEl) {
        if (!sourceEl || !targetEl) return;
        simulatePreciseClick(sourceEl);
        
        try {
            const dataTransfer = new DataTransfer();
            sourceEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
            targetEl.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
            targetEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
            targetEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
            sourceEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
        } catch(e) {}

        simulatePreciseClick(targetEl);
    }

    function findBestElement(targetText) {
        if (!targetText) return null;
        const targetExact = targetText.trim();
        const rawCandidates = document.querySelectorAll('span, button, div, label, p, [role="checkbox"], [role="radio"], .option, .mc-option, .tile, [class*="tile"], .draggable-item, .drag-option, .token');
        const candidates = Array.from(rawCandidates).filter(el => el.offsetParent !== null);

        // First pass: exact content match
        let found = candidates.find(el => cleanAnswerText(el.innerText || el.textContent) === targetExact);
        if (found) return found;

        // Second pass: relaxed match for symbols like , or .
        return candidates.find(el => (el.innerText || el.textContent || '').trim() === targetExact) || null;
    }

    function robustType(inputEl, text) {
        if (!inputEl) return;
        inputEl.focus();
        if (inputEl.tagName === 'INPUT' || inputEl.tagName === 'TEXTAREA') {
            inputEl.value = text;
        } else {
            inputEl.innerText = text;
            inputEl.innerHTML = text;
        }
        ['input', 'change', 'keyup', 'keydown', 'blur'].forEach(evtType => {
            inputEl.dispatchEvent(new Event(evtType, { bubbles: true }));
        });
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

    // ---- Extract Cleaned Answers ----
    function getAnswers(q) {
        const answers = [];
        if (!q?.questionDef?.Components) return answers;
        
        q.questionDef.Components.forEach(c => {
            if (c.Gaps) c.Gaps.forEach(g => { 
                if (g.CorrectOptions?.[0]) answers.push(cleanAnswerText(g.CorrectOptions[0])); 
            });
            if (c.ComponentTypeCode === 'MULTICHOICE_COMPONENT' && c.Options) {
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true) {
                        const t = o.TextTemplate || o.Text || o.Label || o.Description;
                        if (t) answers.push(cleanAnswerText(t));
                    }
                });
            }
            if (c.ComponentTypeCode === 'HIGHLIGHT_COMPONENT') answers.push(...parseHighlight(c).map(d => d.text));
            if (c.ComponentTypeCode === 'TEXT_BOX_COMPONENT' && c.Options?.[0]) answers.push(cleanAnswerText(c.Options[0]));
            if (c.CorrectAnswer) answers.push(cleanAnswerText(c.CorrectAnswer));
            if (c.ModelAnswerHTML && !isPromptText(cleanAnswerText(c.ModelAnswerHTML))) answers.push(cleanAnswerText(c.ModelAnswerHTML));
            if (c.SampleAnswer && !isPromptText(cleanAnswerText(c.SampleAnswer))) answers.push(cleanAnswerText(c.SampleAnswer));
        });
        return [...new Set(answers.filter(Boolean))].filter(a => !isPromptText(a));
    }

    // ---- Auto-Solve Routine ----
    function solveCurrentQuestion() {
        if (!settings.autoSolve) return true;
        const gs = getGameScope();
        if (!gs) return false;
        const q = gs.game.model.currentQuestion;
        if (!q?.questionDef?.Components) return true;

        let scopeUpdated = false;
        const cleanAnsList = getAnswers(q);

        q.questionDef.Components.forEach(c => {
            // 1. Direct Model Sync & UI Input for Sentence Editing / Inline Punctuation
            if (c.ComponentTypeCode === 'SENTENCE_EDITING' || c.ComponentTypeCode === 'INLINE_TEXT_EDIT' || c.CorrectAnswer) {
                const targetText = cleanAnswerText(c.CorrectAnswer || cleanAnsList[0]);
                if (targetText && !isPromptText(targetText)) {
                    c.UserAnswer = targetText;
                    c.Value = targetText;
                    c.Text = targetText;
                    scopeUpdated = true;

                    const sentenceEditors = document.querySelectorAll('.fr-element, [contenteditable="true"], input[type="text"]:not([hidden]), .editable-sentence');
                    sentenceEditors.forEach(ed => {
                        if (ed.offsetParent !== null) robustType(ed, targetText);
                    });
                }
            }

            // 2. Interactive Word Clicker / Highlight Component
            if (c.ComponentTypeCode === 'HIGHLIGHT_COMPONENT' || c.TextTemplate) {
                const targetWords = parseHighlight(c).map(d => d.text);
                targetWords.forEach(word => {
                    const spans = document.querySelectorAll('span, div, .word, .clickable-word');
                    spans.forEach(el => {
                        if (el.offsetParent !== null && cleanAnswerText(el.innerText || el.textContent) === word) {
                            simulatePreciseClick(el);
                        }
                    });
                });
            }

            // 3. Drag & Drop & Cloze Punctuation Gaps
            if (c.Gaps && c.Gaps.length > 0) {
                c.Gaps.forEach((g, idx) => {
                    if (g.CorrectOptions && g.CorrectOptions[0]) {
                        const ans = cleanAnswerText(g.CorrectOptions[0]);
                        
                        g.UserAnswer = ans;
                        g.SelectedOption = ans;
                        g.Value = ans;
                        g.PlacedToken = ans;
                        scopeUpdated = true;

                        const tileEl = findBestElement(ans);
                        const dropZones = document.querySelectorAll('.drop-target, .gap-element, .cloze-gap, ep-gap, input.gap-input, .inline-gap');
                        const targetZone = dropZones[idx] || dropZones[0];

                        if (tileEl && targetZone) {
                            simulateDragAndDrop(tileEl, targetZone);
                        } else if (tileEl) {
                            simulatePreciseClick(tileEl);
                        }

                        const gapInputs = document.querySelectorAll('.cloze-gap input, ep-gap input, input.gap-input, .gap-element input, .gap input');
                        if (gapInputs[idx]) robustType(gapInputs[idx], ans);
                    }
                });
            }

            // 4. Multiple Choice
            if (c.ComponentTypeCode === 'MULTICHOICE_COMPONENT' && c.Options) {
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true) {
                        const targetEl = findBestElement(cleanAnswerText(o.TextTemplate || o.Text || o.Label || o.Description));
                        if (targetEl) simulatePreciseClick(targetEl);
                    }
                });
            }

            // 5. Fallback DOM Input filling
            if (cleanAnsList.length > 0) {
                const targetText = cleanAnsList[0];
                if (!isPromptText(targetText)) {
                    const richEditors = document.querySelectorAll('.fr-element, [contenteditable="true"], textarea, input[type="text"]:not([hidden])');
                    richEditors.forEach(editor => {
                        if (editor.offsetParent !== null) {
                            robustType(editor, targetText);
                        }
                    });
                }
            }
        });

        if (scopeUpdated && window.angular) {
            try { gs.$apply(); } catch(e) {}
        }

        return true;
    }

    function pressSubmitOrContinue() {
        if (!settings.autoSubmit) return false;
        dismissNoAnswerModal();
        triggerBypass();

        const candidates = document.querySelectorAll('button, .button, .ep-button, a, div[role="button"], span[role="button"]');
        for (let b of candidates) {
            if (b.offsetParent === null) continue;
            const txt = cleanAnswerText(b.innerText || b.textContent || '').toLowerCase();
            if (txt.includes('continue') || txt.includes('submit') || txt.includes('next section') || 
                txt.includes('next task') || txt.includes('start section') || txt.includes('finish task') || 
                txt.includes('done') || txt.includes('start') || txt.includes('next') || 
                txt.includes('check') || txt.includes('got it') || txt.includes('bypass')) {
                simulatePreciseClick(b);
                return true;
            }
        }
        return false;
    }

    // ---- Core Loop & UI Rendering ----
    setInterval(() => {
        const now = Date.now();
        try {
            dismissNoAnswerModal();
            triggerBypass();

            const gs = getGameScope();
            if (!gs) {
                statusBox.innerHTML = autoModeActive ? '🤖 Waiting for active lesson...' : '⏳ ENGINE STANDBY (Toggle UI or Ctrl+Alt+L)';
                if (autoModeActive) pressSubmitOrContinue();
                return;
            }

            const q = gs.game.model.currentQuestion;
            const cleanAns = getAnswers(q);

            let statusHTML = (autoModeActive ? '<span style="color: #f43f5e; font-weight: 700;">🤖 AUTO ACTIVE</span>\n' : '<span style="color: #38bdf8; font-weight: 700;">⏳ ENGINE STANDBY</span>\n');

            if (cleanAns.length > 0) {
                statusHTML += '<div style="margin-top: 4px;">';
                cleanAns.forEach((ans, i) => {
                    statusHTML += `<div style="background: rgba(250, 204, 21, 0.25); color: #fef08a; border: 1px solid #eab308; padding: 4px 6px; border-radius: 4px; margin-top: 4px; font-weight: 700; font-size: 11px; word-break: break-word;">💡 Answer ${i + 1}: ${ans}</div>`;
                });
                statusHTML += '</div>';
            } else {
                statusHTML += '<span style="opacity: 0.8;">Slide loaded / Free Writing (Use Self-Mark Bypass)</span>';
            }

            statusBox.innerHTML = statusHTML;

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

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
        }
        if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            setAutoMode(!autoModeActive);
        }
    });
})();
