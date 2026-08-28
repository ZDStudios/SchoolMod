// ==UserScript==
// @name         EP Automation & Answer Fetcher
// @namespace    http://tampermonkey.net/
// @version      33.2
// @description  Adds Sentence Editing & Inline Diff component handlers, punctuation keypress emulation, UI drag, and collapse arrow.
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const settings = {
        autoSolve: true,
        autoSubmit: true,
        antiDetect: true,
        selfMarkBypass: true,
        autoHide: localStorage.getItem('ep_autohide') === 'true',
        theme: 'synthwave'
    };

    const themes = {
        cyberpunk: { bg: 'rgba(18, 16, 38, 0.98)', text: '#00ffcc', border: '#ff007f', header: '#2a1b4e' },
        synthwave: { bg: 'rgba(26, 11, 46, 0.98)', text: '#ff71ce', border: '#01cdfe', header: '#3a135e' },
        nordic: { bg: 'rgba(15, 28, 44, 0.98)', text: '#e0f2fe', border: '#38bdf8', header: '#1e3a5f' },
        dark: { bg: 'rgba(15, 23, 42, 0.98)', text: '#ffffff', border: '#70B80B', header: '#1e293b' },
        light: { bg: 'rgba(248, 250, 252, 0.98)', text: '#0f172a', border: '#10b981', header: '#e2e8f0' },
        minimal: { bg: 'rgba(0, 0, 0, 0.9)', text: '#a3e635', border: '#a3e635', header: '#18181b' }
    };

    (function initSpoofers() {
        try {
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
            document.hasFocus = () => true;
        } catch(e) {}

        const focusEvents = ['blur', 'focusout', 'mouseleave', 'visibilitychange', 'pagehide'];
        focusEvents.forEach(evt => {
            window.addEventListener(evt, e => { if (settings.antiDetect) e.stopImmediatePropagation(); }, true);
            document.addEventListener(evt, e => { if (settings.antiDetect) e.stopImmediatePropagation(); }, true);
        });
    })();

    let autoModeActive = false;
    let currentQuestionID = null;
    let slideSettledTime = 0;
    let fillExecutedTime = 0;
    let filledSuccess = false;
    let isMinimized = false;

    const LOOP_SPEED = 200;         
    const SETTLE_DELAY = 450;       
    const SUBMIT_DELAY = 600;       

    function cleanAnswerText(raw) {
        if (raw === null || raw === undefined) return '';
        let str = String(raw);
        const temp = document.createElement('div');
        temp.innerHTML = str;
        str = temp.textContent || temp.innerText || '';
        return str.replace(/\[block[^\n]*\n?/g, '').replace(/<[^>]*>?/gm, '').replace(/[\*\[\]]/g, '').replace(/\s+/g, ' ').trim();
    }

    function normalizeForComparison(str) {
        return cleanAnswerText(str).toLowerCase().replace(/[^a-z0-9]/g, '');
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
        border-right: 5px solid #01cdfe;
        overflow: hidden;
        display: ${settings.autoHide ? 'none' : 'block'};
    `;

    overlay.innerHTML = `
        <div id="ep-header" style="padding: 8px 12px; cursor: move; display: flex; justify-content: space-between; align-items: center; user-select: none; font-weight: 700;">
            <span>🤖 EP Automation v33.2</span>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button id="ep-min-btn" style="background: transparent; border: none; color: inherit; cursor: pointer; font-size: 14px; padding: 0 4px; line-height: 1;">▼</button>
            </div>
        </div>
        <div id="ep-body" style="padding: 10px 12px;">
            <div id="ep-controls-area">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label for="ep-theme-select">Theme:</label>
                    <select id="ep-theme-select" style="background: rgba(255,255,255,0.1); color: inherit; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 2px 6px; font-size: 11px;">
                        <option value="synthwave" style="color:#000;">Neon Synthwave</option>
                        <option value="nordic" style="color:#000;">Nordic Frost</option>
                        <option value="cyberpunk" style="color:#000;">Cyberpunk</option>
                        <option value="dark" style="color:#000;">Dark Slate</option>
                        <option value="light" style="color:#000;">Light Mode</option>
                        <option value="minimal" style="color:#000;">Minimal Lime</option>
                    </select>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px; font-size: 11px;">
                    <label style="display: flex; align-items: center; gap: 6px; grid-column: span 2; background: rgba(255,255,255,0.08); padding: 5px 8px; border-radius: 5px;">
                        <input type="checkbox" id="toggle-automode"> <span style="font-weight: 700;">🤖 Auto Mode Active</span>
                    </label>
                    <label><input type="checkbox" id="toggle-solve" checked> Auto Solve</label>
                    <label><input type="checkbox" id="toggle-submit" checked> Auto Submit</label>
                    <label><input type="checkbox" id="toggle-antidetect" checked> Anti-Detect</label>
                    <label><input type="checkbox" id="toggle-selfmark" checked> Self-Mark/Bypass</label>
                    <label style="grid-column: span 2; display: flex; align-items: center; gap: 4px;">
                        <input type="checkbox" id="toggle-autohide" ${settings.autoHide ? 'checked' : ''}> Auto-Hide UI on Load
                    </label>
                </div>

                <div style="font-size: 10px; opacity: 0.75; text-align: center; margin-bottom: 6px;">
                    Press <b style="text-decoration: underline;">Ctrl + U</b> (Menu) | <b style="text-decoration: underline;">Ctrl + Alt + L</b> (Auto)
                </div>
            </div>

            <div id="ep-status-box" style="
                background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15);
                padding: 8px; border-radius: 6px; min-height: 52px; max-height: 140px;
                overflow-y: auto; white-space: pre-wrap; word-break: break-word; font-size: 11px;
            ">Initializing UI Controls...</div>
        </div>
    `;

    document.body.appendChild(overlay);

    const headerEl = overlay.querySelector('#ep-header');
    let isDraggingUI = false, offsetX = 0, offsetY = 0;

    headerEl.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDraggingUI = true;
        offsetX = e.clientX - overlay.getBoundingClientRect().left;
        offsetY = e.clientY - overlay.getBoundingClientRect().top;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingUI) return;
        overlay.style.left = `${e.clientX - offsetX}px`;
        overlay.style.top = `${e.clientY - offsetY}px`;
        overlay.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => { isDraggingUI = false; });

    const minBtn = overlay.querySelector('#ep-min-btn');
    const controlsArea = overlay.querySelector('#ep-controls-area');

    minBtn.addEventListener('click', () => {
        isMinimized = !isMinimized;
        controlsArea.style.display = isMinimized ? 'none' : 'block';
        minBtn.textContent = isMinimized ? '▲' : '▼';
    });

    const statusBox = overlay.querySelector('#ep-status-box');
    const themeSelect = overlay.querySelector('#ep-theme-select');
    const autoModeToggle = overlay.querySelector('#toggle-automode');
    const autoHideToggle = overlay.querySelector('#toggle-autohide');

    function applyTheme(themeName) {
        const t = themes[themeName] || themes.synthwave;
        settings.theme = themeName;
        overlay.style.background = t.bg;
        overlay.style.color = t.text;
        overlay.style.borderRightColor = autoModeActive ? '#ff0055' : t.border;
        headerEl.style.background = t.header;
    }
    applyTheme('synthwave');

    function setAutoMode(state) {
        autoModeActive = state;
        if (autoModeToggle) autoModeToggle.checked = autoModeActive;
        const currentTheme = themes[settings.theme] || themes.synthwave;
        overlay.style.borderRightColor = autoModeActive ? '#ff0055' : currentTheme.border;
    }

    themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
    autoModeToggle.addEventListener('change', (e) => setAutoMode(e.target.checked));
    autoHideToggle.addEventListener('change', (e) => {
        settings.autoHide = e.target.checked;
        localStorage.setItem('ep_autohide', e.target.checked);
    });

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
        const targetClean = cleanAnswerText(targetText);
        const targetNorm = normalizeForComparison(targetText);
        
        const rawCandidates = document.querySelectorAll('li, label, span, button, div, [role="checkbox"], [role="radio"], .option, .mc-option, .drag-item, .sequence-item, .draggable');
        const candidates = Array.from(rawCandidates).filter(el => el.offsetParent !== null);

        let found = candidates.find(el => cleanAnswerText(el.innerText || el.textContent) === targetClean);
        if (found) return found;

        found = candidates.find(el => normalizeForComparison(el.innerText || el.textContent) === targetNorm);
        return found || null;
    }

    function robustType(inputEl, text) {
        if (!inputEl) return;
        inputEl.focus();

        const cleanVal = cleanAnswerText(text);

        if (inputEl.classList.contains('fr-element') || inputEl.getAttribute('contenteditable') === 'true') {
            inputEl.innerHTML = `<p>${cleanVal}</p>`;
            if (window.jQuery && window.jQuery(inputEl).data('froala.editor')) {
                try { window.jQuery(inputEl).froalaEditor('html.set', `<p>${cleanVal}</p>`); } catch(e) {}
            }
        } else if (inputEl.tagName === 'INPUT' || inputEl.tagName === 'TEXTAREA') {
            inputEl.value = cleanVal;
        } else {
            inputEl.innerText = cleanVal;
        }

        ['input', 'change', 'keydown', 'keypress', 'keyup', 'blur'].forEach(evtType => {
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

    function getAnswers(q) {
        const answers = [];
        if (!q?.questionDef?.Components) return answers;
        
        q.questionDef.Components.forEach(c => {
            if (c.Gaps) c.Gaps.forEach(g => { 
                if (g.CorrectOptions?.[0]) answers.push(cleanAnswerText(g.CorrectOptions[0])); 
            });
            if (c.OrderedSequence) {
                c.OrderedSequence.forEach(item => {
                    const txt = item.Text || item.Label || item.Value;
                    if (txt) answers.push(cleanAnswerText(txt));
                });
            }
            if (c.Targets) {
                c.Targets.forEach(t => {
                    if (t.CorrectValue) answers.push(cleanAnswerText(t.CorrectValue));
                });
            }
            if (c.ComponentTypeCode === 'MULTICHOICE_COMPONENT' && c.Options) {
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true) {
                        const t = o.TextTemplate || o.Text || o.Label || o.Description;
                        if (t) answers.push(cleanAnswerText(t));
                    }
                });
            }
            if (c.ComponentTypeCode === 'TEXT_BOX_COMPONENT' && c.Options?.[0]) answers.push(cleanAnswerText(c.Options[0]));
            if (c.CorrectAnswer) answers.push(cleanAnswerText(c.CorrectAnswer));
            if (c.ModelAnswerHTML && !isPromptText(cleanAnswerText(c.ModelAnswerHTML))) answers.push(cleanAnswerText(c.ModelAnswerHTML));
            if (c.SampleAnswer && !isPromptText(cleanAnswerText(c.SampleAnswer))) answers.push(cleanAnswerText(c.SampleAnswer));
        });
        return [...new Set(answers.filter(Boolean))].filter(a => !isPromptText(a));
    }

    // Direct Scope Injector for Sentence Editing / Text Correcting Slides
    function solveSentenceEditing(gs, q) {
        if (!q?.questionDef?.Components) return false;
        let updated = false;

        q.questionDef.Components.forEach(c => {
            const target = cleanAnswerText(c.CorrectAnswer || c.ModelAnswerHTML || c.SampleAnswer);
            if (!target || isPromptText(target)) return;

            // Handle Angular Sentence Editing / Inline Diff state
            if (c.ComponentTypeCode === 'SENTENCE_EDITING' || c.SentenceHTML || c.OriginalSentence) {
                c.UserAnswer = target;
                c.Value = target;
                c.CorrectAnswer = target;
                updated = true;

                // Sync editable sentence block in DOM
                const editables = document.querySelectorAll('.sentence-editing, .inline-editor, [contenteditable="true"], .fr-element');
                editables.forEach(ed => {
                    if (ed.offsetParent !== null) robustType(ed, target);
                });
            }
        });

        if (updated && window.angular) {
            try { gs.$apply(); } catch(e) {}
        }
        return updated;
    }

    function solveClozeGaps(gs, q) {
        if (!q?.questionDef?.Components) return false;
        let solvedAny = false;

        q.questionDef.Components.forEach(c => {
            if (c.Gaps) {
                c.Gaps.forEach((g, idx) => {
                    if (g.CorrectOptions && g.CorrectOptions[0]) {
                        const correctVal = cleanAnswerText(g.CorrectOptions[0]);
                        g.Value = correctVal;
                        g.UserAnswer = correctVal;

                        const gapEls = document.querySelectorAll('.cloze-gap, [class*="gap"], .drop-zone, input[type="text"]:not([hidden])');
                        if (gapEls[idx]) {
                            robustType(gapEls[idx], correctVal);
                            
                            const tileEl = findBestElement(correctVal);
                            if (tileEl) {
                                simulatePreciseClick(tileEl);
                                simulatePreciseClick(gapEls[idx]);
                            }
                        }
                        solvedAny = true;
                    }
                });
            }
        });

        if (solvedAny && window.angular) {
            try { gs.$apply(); } catch(e) {}
        }
        return solvedAny;
    }

    function solveCurrentQuestion() {
        if (!settings.autoSolve) return true;
        const gs = getGameScope();
        if (!gs) return false;
        const q = gs.game.model.currentQuestion;
        if (!q?.questionDef?.Components) return true;

        let scopeUpdated = solveSentenceEditing(gs, q) || solveClozeGaps(gs, q);
        const cleanAnsList = getAnswers(q);

        q.questionDef.Components.forEach(c => {
            if (c.ComponentTypeCode === 'TEXT_BOX_COMPONENT' || c.ModelAnswerHTML || c.SampleAnswer) {
                const targetText = cleanAnswerText(c.CorrectAnswer || c.ModelAnswerHTML || c.SampleAnswer || cleanAnsList[0]);
                if (targetText && !isPromptText(targetText)) {
                    c.UserAnswer = targetText;
                    c.Value = targetText;
                    scopeUpdated = true;

                    const textEditors = document.querySelectorAll('.fr-element, [contenteditable="true"], textarea, input[type="text"]:not([hidden])');
                    textEditors.forEach(ed => {
                        if (ed.offsetParent !== null) robustType(ed, targetText);
                    });
                }
            }

            if (c.ComponentTypeCode === 'MULTICHOICE_COMPONENT' && c.Options) {
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true) {
                        const targetText = cleanAnswerText(o.TextTemplate || o.Text || o.Label || o.Description);
                        o.Selected = true;
                        scopeUpdated = true;
                        
                        const targetEl = findBestElement(targetText);
                        if (targetEl) {
                            simulatePreciseClick(targetEl);
                            const radio = targetEl.querySelector('input[type="radio"]') || targetEl.closest('label')?.querySelector('input[type="radio"]');
                            if (radio) simulatePreciseClick(radio);
                        }
                    }
                });
            }

            if (c.OrderedSequence || c.Targets) {
                cleanAnsList.forEach((ansText) => {
                    const el = findBestElement(ansText);
                    if (el) simulatePreciseClick(el);
                });
            }
        });

        if (scopeUpdated && window.angular) {
            try { gs.$apply(); } catch(e) {}
        }

        return true;
    }

    function pressSubmitOrContinue() {
        if (!settings.autoSubmit) return false;

        const candidates = document.querySelectorAll('button, .button, .ep-button, a, div[role="button"], span[role="button"]');
        for (let b of candidates) {
            if (b.offsetParent === null) continue;
            const txt = cleanAnswerText(b.innerText || b.textContent || '').toLowerCase();
            if (txt.includes('submit') || txt.includes('check answer') || txt.includes('continue') || 
                txt.includes('next section') || txt.includes('next task') || txt.includes('done') || 
                txt.includes('next') || txt.includes('got it')) {
                simulatePreciseClick(b);
                return true;
            }
        }
        return false;
    }

    setInterval(() => {
        const now = Date.now();
        try {
            const gs = getGameScope();
            if (!gs) {
                statusBox.innerHTML = autoModeActive ? '🤖 Searching for active lesson...' : '⏳ ENGINE STANDBY';
                if (autoModeActive) pressSubmitOrContinue();
                return;
            }

            const q = gs.game.model.currentQuestion;
            const cleanAns = getAnswers(q);

            let statusHTML = (autoModeActive ? '<span style="color: #ff71ce; font-weight: 700;">🤖 AUTO ACTIVE</span>\n' : '<span style="color: #01cdfe; font-weight: 700;">⏳ ENGINE STANDBY</span>\n');

            if (cleanAns.length > 0) {
                statusHTML += '<div style="margin-top: 4px;">';
                cleanAns.forEach((ans, i) => {
                    statusHTML += `<div style="background: rgba(250, 204, 21, 0.25); color: #fef08a; border: 1px solid #eab308; padding: 4px 6px; border-radius: 4px; margin-top: 4px; font-weight: 700; font-size: 11px;">💡 Answer ${i + 1}: ${ans}</div>`;
                });
                statusHTML += '</div>';
            } else {
                statusHTML += '<span style="opacity: 0.8;">Slide loaded / Manual grading area</span>';
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
