// ==UserScript==
// @name         EP Automation & Answer Fetcher
// @namespace    http://tampermonkey.net/
// @version      33.7
// @description  Adds Highlight/Token answer detection, Beta feature gate, and multi-target solver fixes.
// @match        *://*.educationperfect.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const settings = {
        enableBeta: localStorage.getItem('ep_enable_beta') === 'true',
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

    function cleanTargetForInput(raw) {
        let txt = cleanAnswerText(raw);
        return txt.replace(/^[:;\-–—\s]+/, '').trim();
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

    function showBetaNoticeModal() {
        let modal = document.getElementById('ep-beta-notice');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'ep-beta-notice';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75); z-index: 9999999;
            display: flex; align-items: center; justify-content: center;
            font-family: system-ui, -apple-system, sans-serif;
        `;

        modal.innerHTML = `
            <div style="background: #1e1b2e; color: #f8fafc; padding: 24px; border-radius: 12px; width: 380px; border: 2px solid #ff71ce; box-shadow: 0 20px 40px rgba(0,0,0,0.6); text-align: center;">
                <h3 style="margin: 0 0 12px 0; color: #ff71ce; font-size: 16px;">⚠️ Beta Features Notice</h3>
                <p style="font-size: 13px; line-height: 1.5; opacity: 0.9; margin-bottom: 16px;">
                    Some features may still be under development and need fine-tuning. Contact the developer if you have issues or suggestions.
                </p>
                <button id="ep-beta-close-btn" style="background: #01cdfe; color: #000; font-weight: 700; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 12px;">I Understand</button>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('ep-beta-close-btn').addEventListener('click', () => modal.remove());
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
            <span>🤖 EP Automation v33.7</span>
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
                    <label style="grid-column: span 2; display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.05); padding: 4px 6px; border-radius: 4px;">
                        <input type="checkbox" id="toggle-beta" ${settings.enableBeta ? 'checked' : ''}> Enable Beta Features
                    </label>

                    <label id="automode-wrapper" style="display: ${settings.enableBeta ? 'flex' : 'none'}; align-items: center; gap: 6px; grid-column: span 2; background: rgba(255,255,255,0.08); padding: 5px 8px; border-radius: 5px;">
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
    const betaToggle = overlay.querySelector('#toggle-beta');
    const autoModeWrapper = overlay.querySelector('#automode-wrapper');
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
        if (!settings.enableBeta) {
            autoModeActive = false;
            if (autoModeToggle) autoModeToggle.checked = false;
            return;
        }
        autoModeActive = state;
        if (autoModeToggle) autoModeToggle.checked = autoModeActive;
        const currentTheme = themes[settings.theme] || themes.synthwave;
        overlay.style.borderRightColor = autoModeActive ? '#ff0055' : currentTheme.border;
    }

    betaToggle.addEventListener('change', (e) => {
        settings.enableBeta = e.target.checked;
        localStorage.setItem('ep_enable_beta', e.target.checked);
        autoModeWrapper.style.display = settings.enableBeta ? 'flex' : 'none';
        if (settings.enableBeta) {
            showBetaNoticeModal();
        } else {
            setAutoMode(false);
        }
    });

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
        
        const rawCandidates = document.querySelectorAll('li, label, span, button, div, [role="checkbox"], [role="radio"], .option, .mc-option, .drag-item, .sequence-item, .draggable, .word-token, .token, [class*="word"]');
        const candidates = Array.from(rawCandidates).filter(el => el.offsetParent !== null);

        let found = candidates.find(el => cleanAnswerText(el.innerText || el.textContent) === targetClean);
        if (found) return found;

        found = candidates.find(el => normalizeForComparison(el.innerText || el.textContent) === targetNorm);
        return found || null;
    }

    function forceNativeInput(el, val) {
        if (!el) return;
        el.focus();

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(el, val);
        } else {
            el.innerText = val;
            el.innerHTML = `<p>${val}</p>`;
        }

        try {
            el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: val }));
        } catch(e) {}

        ['input', 'change', 'keydown', 'keypress', 'keyup', 'blur'].forEach(evt => {
            try { el.dispatchEvent(new Event(evt, { bubbles: true })); } catch(e) {}
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
            if (c.Words && Array.isArray(c.Words)) {
                c.Words.forEach(w => {
                    if (w.IsCorrect || w.ShouldHighlight || w.Correct) {
                        const txt = w.Text || w.Word || w.Value;
                        if (txt) answers.push(cleanAnswerText(txt));
                    }
                });
            }
            if (c.SelectedTokens || c.TargetTokens) {
                const tokens = c.SelectedTokens || c.TargetTokens;
                if (Array.isArray(tokens)) {
                    tokens.forEach(tok => {
                        const txt = typeof tok === 'string' ? tok : (tok.Text || tok.Value);
                        if (txt) answers.push(cleanAnswerText(txt));
                    });
                }
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

    function solveSentenceEditingAndDiffs(gs, q) {
        if (!q?.questionDef?.Components) return false;
        let updated = false;

        q.questionDef.Components.forEach(c => {
            const fullTarget = cleanAnswerText(c.CorrectAnswer || c.ModelAnswerHTML || c.SampleAnswer);
            const inputTarget = cleanTargetForInput(c.CorrectAnswer || c.ModelAnswerHTML || c.SampleAnswer);
            if (!fullTarget || isPromptText(fullTarget)) return;

            c.UserAnswer = fullTarget;
            c.Value = fullTarget;
            c.SentenceHTML = fullTarget;
            c.EditingTokens = fullTarget;
            if (c.DiffTokens && Array.isArray(c.DiffTokens)) {
                c.DiffTokens = [{ text: fullTarget, type: 'normal' }];
            }
            updated = true;

            const targetEls = document.querySelectorAll('.sentence-editing, .inline-editor, [contenteditable="true"], .fr-element, input[type="text"]:not([hidden]), textarea');
            targetEls.forEach(el => {
                if (el.offsetParent !== null) forceNativeInput(el, inputTarget);
            });
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
                        const rawAns = g.CorrectOptions[0];
                        const inputVal = cleanTargetForInput(rawAns);
                        const cleanVal = cleanAnswerText(rawAns);

                        g.Value = cleanVal;
                        g.UserAnswer = cleanVal;

                        const gapEls = document.querySelectorAll('.cloze-gap, [class*="gap"], .drop-zone, input[type="text"]:not([hidden])');
                        if (gapEls[idx]) {
                            forceNativeInput(gapEls[idx], inputVal);
                            
                            const tileEl = findBestElement(inputVal) || findBestElement(cleanVal);
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

    function solveWordHighlighting(gs, q) {
        if (!q?.questionDef?.Components) return false;
        let solvedAny = false;

        q.questionDef.Components.forEach(c => {
            if (c.Words && Array.isArray(c.Words)) {
                c.Words.forEach(w => {
                    if (w.IsCorrect || w.ShouldHighlight || w.Correct) {
                        w.Selected = true;
                        w.IsSelected = true;
                        const wordText = cleanAnswerText(w.Text || w.Word || w.Value);
                        const wordEl = findBestElement(wordText);
                        if (wordEl) {
                            simulatePreciseClick(wordEl);
                            solvedAny = true;
                        }
                    }
                });
            }
        });

        if (solvedAny && window.angular) {
            try { gs.$apply(); } catch(e) {}
        }
        return solvedAny;
    }

    function solveMultiTargetMatching(gs, q) {
        if (!q?.questionDef?.Components) return false;
        let solvedAny = false;

        q.questionDef.Components.forEach(c => {
            if (c.Targets && Array.isArray(c.Targets)) {
                const dropZones = document.querySelectorAll('.drop-zone, [class*="target"], [class*="drop"]');

                c.Targets.forEach((target, idx) => {
                    const targetVal = cleanAnswerText(target.CorrectValue || target.Value);
                    if (!targetVal) return;

                    target.UserValue = targetVal;
                    target.Value = targetVal;

                    const draggableEl = findBestElement(targetVal);
                    const zoneEl = dropZones[idx] || document.querySelectorAll('.drop-zone')[idx];

                    if (draggableEl && zoneEl) {
                        simulatePreciseClick(draggableEl);
                        simulatePreciseClick(zoneEl);
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

        let scopeUpdated = solveSentenceEditingAndDiffs(gs, q) || solveClozeGaps(gs, q) || solveMultiTargetMatching(gs, q) || solveWordHighlighting(gs, q);
        const cleanAnsList = getAnswers(q);

        q.questionDef.Components.forEach(c => {
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

            if (c.OrderedSequence) {
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
            if (settings.enableBeta) setAutoMode(!autoModeActive);
        }
    });
})();
