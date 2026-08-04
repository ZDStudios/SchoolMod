// ==UserScript==
// @name         EP Ultimate Automation Helper (v23.0)
// @namespace    http://tampermonkey.net/
// @version      23.0
// @description  Full auto-solver + Universal inline gap finder + Multi-mode cloze solver + EP-Blue Bypass.
// @match        https://app.educationperfect.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let autoModeActive = false;
    let currentQuestionID = null;
    let slideSettledTime = 0;
    let fillExecutedTime = 0;
    let filledSuccess = false;
    let bypassed = false;

    const LOOP_SPEED = 250;          // Clock cycle frequency (ms)
    const SETTLE_DELAY = 450;        // Wait time for slide load animations (ms)
    const SUBMIT_DELAY = 600;        // Delay before clicking submit (ms)

    // ---- UI Control Panel ----
    let overlay = document.getElementById('ep-ultimate-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'ep-ultimate-overlay';
    overlay.style.cssText = `
        position: fixed; top: 12px; right: 12px;
        background: rgba(15, 23, 42, 0.98); color: #ffffff;
        padding: 10px 16px; border-radius: 8px;
        font-size: 12px; font-weight: 600;
        z-index: 999999; width: 330px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
        font-family: system-ui, -apple-system, sans-serif;
        pointer-events: none; border-right: 5px solid #70B80B;
        line-height: 1.5; letter-spacing: 0.3px;
        white-space: pre-wrap;
    `;
    document.body.appendChild(overlay);
    overlay.innerText = 'Initializing Framework Sync (v23.0)...';

    // ---- EP-Blue Disabled Timer Bypass Engine ----
    function resetButtons() {
        bypassed = false;
    }

    function triggerBypass() {
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

                        btn.addEventListener('click', () => {
                            setTimeout(resetButtons, 300);
                        }, { once: true });
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

    const bypassObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') {
                if (/got\s*it[!.]?/i.test(mutation.target.textContent)) {
                    triggerBypass();
                    return;
                }
            }

            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (/got\s*it[!.]?/i.test(node.textContent || '')) {
                        triggerBypass();
                        return;
                    }
                }
            }
        }
    });

    if (document.body) {
        bypassObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            bypassObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        });
    }

    // ---- Text Sanitization & Tile Decoders ----
    function extractText(t) {
        if (!t) return '';
        return t.replace(/\[block[^\n]*\n/g,'').replace(/\]/g,'').replace(/\*\*/g,'').trim();
    }

    function getTileText(el) {
        if (!el) return '';
        let txt = '';
        if (typeof el === 'string') {
            txt = el;
        } else {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.drag-handle, .icon, svg, i, [class*="handle"], [class*="sr-only"]').forEach(n => n.remove());
            txt = clone.innerText || clone.textContent || '';
        }
        return txt.replace(/^[\s:\u22EE\u2800-\u28FF\u2022\u25C0-\u25FF\u2630]+/g, '')
                  .replace(/[\s:\u22EE\u2800-\u28FF\u2022\u25C0-\u25FF\u2630]+$/g, '')
                  .trim();
    }

    function normalizeStr(str) {
        if (!str) return '';
        return str.toLowerCase().replace(/[\n\r\s]+/g, ' ').trim();
    }

    function parseHighlight(c) {
        const correct = c.CorrectOptions || [];
        const matches = [...(c.TextTemplate || '').matchAll(/\[hl (\d+):([^:]+):/g)];
        return matches.filter(m => correct.includes(parseInt(m[1]))).map(m => ({
            index: parseInt(m[1]),
            text: m[2]
        }));
    }

    // ---- Visual Coordinate Alignment Sorting ----
    function sortElementsByPosition(elements) {
        return Array.from(elements).sort((a, b) => {
            const rA = a.getBoundingClientRect();
            const rB = b.getBoundingClientRect();
            if (Math.abs(rA.top - rB.top) < 14) return rA.left - rB.left;
            return rA.top - rB.top;
        });
    }

    function getVisualGaps() {
        const gapSelectors = [
            'ep-gap', 'ep-cloze-gap', '.cloze-gap', '.drop-target', '.drop-zone',
            '.placeholder-gap', 'span.gap', 'div.gap', '.blank', '[class*="gap"]',
            '[class*="blank"]', '[class*="target-zone"]', '[class*="drop-target"]',
            '[ng-model*="gap"]', '[data-gap-index]'
        ];
        const gaps = Array.from(document.querySelectorAll(gapSelectors.join(',')))
            .filter(el => {
                if (el.offsetParent === null) return false;
                if (el.querySelector('ep-gap, .cloze-gap, .drop-target, .blank')) return false;
                if (el.classList.contains('gaps-container') || el.classList.contains('cloze-passage') || el.classList.contains('options-bank')) return false;
                return true;
            });
        return sortElementsByPosition(gaps);
    }

    // ---- Unused Option Tile Locator ----
    function findUnusedTile(targetText, usedSet) {
        if (!targetText) return null;

        const targetExact = targetText.trim();
        const targetClean = normalizeStr(targetText);

        const tileSelectors = [
            '.cloze-option', '.draggable-option', '.option-tile', '.token', '.drag-item',
            'ep-drag-item', '.cloze-item', '[class*="drag"]', '[class*="option"]', '[class*="tile"]',
            '[class*="token"]', '[ng-repeat*="option"]', '[ng-repeat*="item"]', '[ng-repeat*="token"]',
            '.choice', '.item'
        ];

        let rawTiles = Array.from(document.querySelectorAll(tileSelectors.join(',')));
        if (rawTiles.length === 0) {
            rawTiles = Array.from(document.querySelectorAll('.options-bank *, .cloze-options *, .drag-container *, [class*="option-bank"] *, [class*="options"] *'));
        }

        const candidateTiles = rawTiles.filter(el => {
            if (el.offsetParent === null) return false;
            if (usedSet.has(el)) return false;
            if (el.closest('.gap, .cloze-gap, .drop-target, .drop-zone, .blank, ep-gap, [class*="gap"]')) return false;
            if (el.classList.contains('used') || el.classList.contains('placed') || el.classList.contains('disabled')) return false;
            return getTileText(el).length > 0;
        });

        // 1. Exact cleaned match
        let match = candidateTiles.find(el => getTileText(el) === targetExact);
        if (match) return match;

        // 2. Normalized match
        match = candidateTiles.find(el => normalizeStr(getTileText(el)) === targetClean);
        if (match) return match;

        // 3. Relaxed match
        match = candidateTiles.find(el => {
            const t = normalizeStr(getTileText(el));
            return t === targetClean || (targetClean.length === 1 && t.includes(targetClean));
        });
        if (match) return match;

        return null;
    }

    // ---- Interaction Emulation Pipelines ----
    function simulateComplexDrag(sourceEl, targetEl) {
        if (!sourceEl || !targetEl) return;

        const srcRect = sourceEl.getBoundingClientRect();
        const tgtRect = targetEl.getBoundingClientRect();
        const srcX = srcRect.left + srcRect.width / 2;
        const srcY = srcRect.top + srcRect.height / 2;
        const tgtX = tgtRect.left + tgtRect.width / 2;
        const tgtY = tgtRect.top + tgtRect.height / 2;

        const dataTransfer = new DataTransfer();

        function fireMouse(type, x, y) {
            sourceEl.dispatchEvent(new MouseEvent(type, {
                bubbles: true, cancelable: true, view: window,
                clientX: x, clientY: y, screenX: x, screenY: y, buttons: 1
            }));
        }

        function fireDrag(type, el, x, y) {
            el.dispatchEvent(new DragEvent(type, {
                bubbles: true, cancelable: true, view: window,
                clientX: x, clientY: y, dataTransfer: dataTransfer
            }));
        }

        fireDrag('dragstart', sourceEl, srcX, srcY);
        fireMouse('mousedown', srcX, srcY);

        setTimeout(() => {
            fireDrag('dragenter', targetEl, tgtX, tgtY);
            fireDrag('dragover', targetEl, tgtX, tgtY);
            fireDrag('drop', targetEl, tgtX, tgtY);
            targetEl.dispatchEvent(new MouseEvent('mouseup', {
                bubbles: true, cancelable: true, view: window, clientX: tgtX, clientY: tgtY
            }));
            fireDrag('dragend', sourceEl, tgtX, tgtY);
        }, 40);
    }

    function simulatePreciseClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const props = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, which: 1, buttons: 1 };

        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
            try { el.dispatchEvent(new MouseEvent(evt, props)); } catch (e) {}
        });
    }

    function findBestElement(targetText) {
        if (!targetText) return null;

        const targetExact = targetText.trim();
        const targetClean = normalizeStr(targetText);

        const rawCandidates = document.querySelectorAll('span, button, div, label, p, [role="checkbox"], [role="radio"], .option, .mc-option, .highlight-word, .hl-word, .word, [class*="option"]');

        const candidates = Array.from(rawCandidates).filter(el => {
            return el.offsetParent !== null && el.tagName !== 'OPTION' && el.innerText.length <= targetText.length + 60;
        });

        let match = candidates.find(el => getTileText(el) === targetExact);
        if (match) return match;

        match = candidates.find(el => el.innerText.trim() === targetExact);
        if (match) return match;

        let bestEl = null;
        let bestScore = Infinity;

        candidates.forEach(el => {
            const cleaned = getTileText(el);
            const elClean = normalizeStr(cleaned);
            if (elClean === targetClean || (targetClean.length > 1 && elClean.includes(targetClean))) {
                let score = cleaned.length + (el.children.length * 12);
                if (elClean === targetClean) score -= 300;
                if (cleaned === targetExact) score -= 500;

                if (score < bestScore) {
                    bestScore = score;
                    bestEl = el;
                }
            }
        });
        return bestEl;
    }

    function robustType(inputEl, text) {
        if (!inputEl) return;
        inputEl.focus();
        inputEl.value = text;
        if (inputEl.getAttribute('contenteditable') === 'true') inputEl.innerText = text;

        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));

        try {
            const ngModel = angular.element(inputEl).controller('ngModel');
            if (ngModel) {
                ngModel.$setViewValue(text);
                ngModel.$render();
            }
        } catch(e) {}
        inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function solveDropdownElement(el, correctText) {
        if (!el || !correctText) return false;

        const targetExact = correctText.trim();
        const targetClean = normalizeStr(correctText);

        if (el.tagName === 'SELECT' || el.querySelector('select')) {
            const selectEl = el.tagName === 'SELECT' ? el : el.querySelector('select');
            const options = Array.from(selectEl.options);

            let matchOpt = options.find(o => getTileText(o) === targetExact || o.value.trim() === targetExact);
            if (!matchOpt) matchOpt = options.find(o => normalizeStr(o.text) === targetClean || normalizeStr(o.value) === targetClean);

            if (matchOpt) {
                selectEl.value = matchOpt.value;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                selectEl.dispatchEvent(new Event('input', { bubbles: true }));

                try {
                    const ngEl = angular.element(selectEl);
                    const ngModel = ngEl.controller('ngModel');
                    if (ngModel) {
                        ngModel.$setViewValue(matchOpt.value);
                        ngModel.$render();
                    }
                } catch(e) {}
                return true;
            }
        }

        try {
            const ngEl = angular.element(el);
            const scope = ngEl.scope() || ngEl.isolateScope();
            if (scope) {
                const opts = scope.options || scope.model?.options || scope.items || scope.component?.Options;
                if (opts && Array.from(opts).length > 0) {
                    const optArray = Array.from(opts);

                    let matchObj = optArray.find(o => {
                        if (!o) return false;
                        const txt = (o.Description || o.Text || o.text || o.label || o.Label || (typeof o === 'string' ? o : '')).trim();
                        return getTileText(txt) === targetExact;
                    });

                    if (!matchObj) {
                        matchObj = optArray.find(o => {
                            if (!o) return false;
                            const txt = o.Description || o.Text || o.text || o.label || o.Label || (typeof o === 'string' ? o : '');
                            return normalizeStr(txt) === targetClean;
                        });
                    }

                    if (matchObj) {
                        const setterFunc = scope.selectOption || scope.select || scope.choose || scope.setValue || scope.onChange;
                        if (typeof setterFunc === 'function') {
                            setterFunc.call(scope, matchObj);
                            if (!scope.$$phase) scope.$apply();
                            return true;
                        }

                        const keys = ['selectedOption', 'selected', 'selectedValue', 'model', 'value', 'studentAnswer'];
                        for (let key of keys) {
                            if (scope[key] !== undefined) scope[key] = matchObj;
                        }
                        if (!scope.$$phase) scope.$apply();
                        return true;
                    }
                }
            }
        } catch(e) {}

        const elementsInside = el.querySelectorAll('span, div, li, a, option');
        for (let subEl of elementsInside) {
            if (getTileText(subEl) === targetExact && subEl.offsetParent !== null) {
                simulatePreciseClick(subEl);
                return true;
            }
        }
        return false;
    }

    function getGameScope() {
        let gs = null;
        document.querySelectorAll('*').forEach(el => {
            try {
                const s = angular.element(el).scope();
                if (s && s.game && s.game.model) gs = s;
            } catch(e) {}
        });
        return gs;
    }

    function isQuestionSlide(q) {
        if (!q || !q.questionDef || !q.questionDef.Components) return false;

        return q.questionDef.Components.some(c => {
            if (c.Gaps && c.Gaps.length > 0) return true;
            if (c.ComponentTypeCode && !['INFORMATION_COMPONENT', 'TEXT_COMPONENT', 'IMAGE_COMPONENT'].includes(c.ComponentTypeCode)) return true;
            if (c.Options && c.Options.length > 0) return true;
            return false;
        });
    }

    function getAnswers(q) {
        const answers = [];
        if (!q?.questionDef?.Components) return answers;

        q.questionDef.Components.forEach(c => {
            if (c.Gaps) {
                c.Gaps.forEach(g => { if (g.CorrectOptions?.[0]) answers.push(g.CorrectOptions[0]); });
            }
            if (c.ComponentTypeCode === 'MULTICHOICE_COMPONENT' && c.Options) {
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true || o.IsCorrect === 'true') {
                        const t = o.TextTemplate || o.Text || o.Label || o.Description;
                        if (t) answers.push(extractText(t));
                    }
                });
            }
            if (c.ComponentTypeCode === 'DROPDOWN_COMPONENT' && c.Options) {
                c.Options.forEach(o => { if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true || o.IsCorrect === 'true') answers.push(o.Description || o.Text); });
            }
            if (c.ComponentTypeCode === 'HIGHLIGHT_COMPONENT') {
                answers.push(...parseHighlight(c).map(d => d.text));
            }
            if (c.ComponentTypeCode === 'TEXT_BOX_COMPONENT' && c.Options?.[0]) {
                answers.push(c.Options[0].trim());
            }
        });
        return answers;
    }

    // ---- Core Auto-Solver Logic Engine ----
    function solveCurrentQuestion() {
        const gs = getGameScope();
        if (!gs) return false;
        const q = gs.game.model.currentQuestion;
        if (!q?.questionDef?.Components) return true;

        const totalSelects = sortElementsByPosition(document.querySelectorAll('select'));
        const totalCustomDropdowns = sortElementsByPosition(document.querySelectorAll('ep-dropdown, .ep-dropdown, [role="listbox"], .select-trigger, .dropdown-toggle, [class*="select-container"]'));
        const totalInputs = sortElementsByPosition(document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]')).filter(i => i.offsetParent !== null);

        let selectIdx = 0;
        let customDropIdx = 0;
        let inputIdx = 0;

        let trackingTotal = 0;
        let trackingSuccess = 0;

        const usedElementsSet = new Set();

        q.questionDef.Components.forEach(c => {
            if (c.ComponentTypeCode === 'DROPDOWN_COMPONENT' && c.Options) {
                let correctAns = null;
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true || o.IsCorrect === 'true') {
                        correctAns = o.Description || o.Text;
                    }
                });

                if (correctAns) {
                    trackingTotal++;
                    let solved = false;

                    if (selectIdx < totalSelects.length && solveDropdownElement(totalSelects[selectIdx], correctAns)) {
                        solved = true; selectIdx++;
                    }
                    if (!solved && customDropIdx < totalCustomDropdowns.length && solveDropdownElement(totalCustomDropdowns[customDropIdx], correctAns)) {
                        solved = true; customDropIdx++;
                    }
                    if (!solved) {
                        for (let sel of totalSelects) { if (solveDropdownElement(sel, correctAns)) { solved = true; break; } }
                    }

                    try {
                        c.SelectedOption = c.Options.find(o => getTileText(o.Description || o.Text) === getTileText(correctAns));
                        c.value = correctAns; c.studentAnswer = correctAns;
                        if (c.Answers) c.Answers[0] = correctAns;
                    } catch(e) {}

                    if (solved || correctAns) trackingSuccess++;
                }
            }

            if (c.Gaps && c.Gaps.length > 0) {
                trackingTotal += c.Gaps.length;
                const visualGaps = getVisualGaps();

                c.Gaps.forEach((g, idx) => {
                    const ans = g.CorrectOptions?.[0];
                    if (!ans) return;

                    // Sync Angular Model State
                    try {
                        g.value = ans; g.studentAnswer = ans; g.userAnswer = ans; g.answered = true; g.isCorrect = true; g.text = ans;
                        if (c.Options) {
                            const matchOpt = c.Options.find(o => {
                                const txt = o.Text || o.Description || o.Label || '';
                                return getTileText(txt) === getTileText(ans) && !o.Used && !o.IsUsed;
                            });
                            if (matchOpt) {
                                matchOpt.Used = true;
                                matchOpt.IsUsed = true;
                                matchOpt.used = true;
                                g.SelectedOption = matchOpt;
                                g.selectedOption = matchOpt;
                            }
                        }
                    } catch(e) {}

                    let gapSolved = false;

                    if (selectIdx < totalSelects.length && solveDropdownElement(totalSelects[selectIdx], ans)) {
                        gapSolved = true; selectIdx++; trackingSuccess++;
                    }
                    if (!gapSolved && customDropIdx < totalCustomDropdowns.length && solveDropdownElement(totalCustomDropdowns[customDropIdx], correctAns)) {
                        gapSolved = true; customDropIdx++; trackingSuccess++;
                    }
                    if (!gapSolved && totalInputs.length > 0 && totalInputs[inputIdx]) {
                        robustType(totalInputs[inputIdx], ans);
                        inputIdx++; gapSolved = true; trackingSuccess++;
                    }
                    if (!gapSolved) {
                        const tileElement = findUnusedTile(ans, usedElementsSet);
                        const targetGapEl = visualGaps[idx];

                        if (tileElement) {
                            usedElementsSet.add(tileElement);

                            if (targetGapEl) {
                                // Mode 1: Click gap then click tile
                                simulatePreciseClick(targetGapEl);
                                setTimeout(() => simulatePreciseClick(tileElement), 20);

                                // Mode 2: Drag tile onto gap
                                simulateComplexDrag(tileElement, targetGapEl);

                                // Mode 3: Click tile then click gap
                                setTimeout(() => {
                                    simulatePreciseClick(tileElement);
                                    simulatePreciseClick(targetGapEl);
                                }, 50);
                            } else {
                                simulatePreciseClick(tileElement);
                            }
                            gapSolved = true; trackingSuccess++;
                        }
                    }
                });
            }

            if (c.ComponentTypeCode === 'MULTICHOICE_COMPONENT' && c.Options) {
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true || o.IsCorrect === 'true') {
                        trackingTotal++;
                        try { o.Selected = true; o.selected = true; o.Chosen = true; } catch(e) {}

                        const rawText = o.TextTemplate || o.Text || o.Label || o.Description;
                        const targetEl = findBestElement(extractText(rawText));
                        if (targetEl) {
                            simulatePreciseClick(targetEl);
                            trackingSuccess++;
                        }
                    } else {
                        try { o.Selected = false; o.selected = false; o.Chosen = false; } catch(e) {}
                    }
                });
            }

            if (c.ComponentTypeCode === 'HIGHLIGHT_COMPONENT') {
                const correctData = parseHighlight(c);
                trackingTotal += correctData.length;

                const explicitWords = document.querySelectorAll('.highlight-word, .hl-word, span[class*="word"]');
                correctData.forEach(data => {
                    const targetExact = data.text.trim();
                    let target = [...explicitWords].find(w => getTileText(w) === targetExact);
                    if (!target) {
                        target = [...document.querySelectorAll('span, label, p')].find(el => getTileText(el) === targetExact && el.offsetParent !== null);
                    }
                    if (target) {
                        simulatePreciseClick(target);
                        trackingSuccess++;
                    }
                });
            }

            if (c.ComponentTypeCode === 'TEXT_BOX_COMPONENT' && c.Options?.[0]) {
                trackingTotal += 1;
                const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"]')).filter(i => i.offsetParent !== null);
                if (inputs.length > 0) {
                    inputs.forEach(inp => robustType(inp, c.Options[0].trim()));
                    trackingSuccess++;
                }
            }
        });

        try { gs.$apply(); } catch(e) {}

        if (trackingTotal === 0) return true;

        return (trackingSuccess >= trackingTotal);
    }

    // ---- Enhanced Continue/Submit Engine ----
    function pressSubmitOrContinue(isQuestion = false, isFilled = false) {
        if (isQuestion && !isFilled) {
            return false;
        }

        triggerBypass();

        const primarySelectors = [
            '#continue-button', '.continue-button', '.submit-button',
            '.submit-btn', '.continue-btn', '.next-button', '.next-slide',
            '[class*="continue"]', '[class*="submit"]', '[id*="continue"]',
            '[ng-click*="submit"]', '[ng-click*="continue"]', '[ng-click*="next"]',
            '[ng-click*="nextSlide"]'
        ];

        for (let selector of primarySelectors) {
            const btn = document.querySelector(selector);
            if (btn && btn.offsetParent !== null && btn.tagName !== 'BODY') {
                simulatePreciseClick(btn);
                return true;
            }
        }

        const candidates = document.querySelectorAll('button, .button, .ep-button, a, div[role="button"], span[role="button"], [class*="btn"]');
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

    // ---- Core Loop State Machine ----
    setInterval(() => {
        const now = Date.now();
        try {
            triggerBypass();

            const gs = getGameScope();

            if (!gs) {
                currentQuestionID = null;
                filledSuccess = false;
                if (autoModeActive) pressSubmitOrContinue(false, true);
                return;
            }

            const q = gs.game.model.currentQuestion;
            const answers = getAnswers(q);
            const questionType = isQuestionSlide(q);

            overlay.innerText = (autoModeActive ? '🤖 FULL AUTO ACTIVE (v23.0)\n' : '⏳ ENGINE STANDBY (v23.0)\n') +
                                (questionType ? 'Type: [QUESTION] | Ans: ' + (answers.length ? answers.join(' / ') : 'Solving...') : 'Type: [CONTEXT / INFO SLIDE]');

            if (!autoModeActive) return;

            if (q && q.contentID) {
                if (q.contentID !== currentQuestionID) {
                    currentQuestionID = q.contentID;
                    filledSuccess = false;
                    slideSettledTime = now;
                    return;
                }

                if (questionType) {
                    if (!filledSuccess && (now - slideSettledTime > SETTLE_DELAY)) {
                        const verified = solveCurrentQuestion();
                        if (verified) {
                            filledSuccess = true;
                            fillExecutedTime = now;
                        }
                        return;
                    }

                    if (filledSuccess && (now - fillExecutedTime > SUBMIT_DELAY)) {
                        pressSubmitOrContinue(true, true);

                        if (now - fillExecutedTime > 2500) {
                            filledSuccess = false;
                            slideSettledTime = now;
                        }
                    }
                } else {
                    if (now - slideSettledTime > SETTLE_DELAY) {
                        pressSubmitOrContinue(false, true);
                    }
                }
            } else {
                const feedbackActive = document.querySelector('.points-feedback, .feedback-container, [class*="feedback"], .correct-feedback, .incorrect-feedback, .summary-page');
                if (feedbackActive || !q) {
                    pressSubmitOrContinue(false, true);
                    currentQuestionID = null;
                    filledSuccess = false;
                }
            }
        } catch(e) {}
    }, LOOP_SPEED);

    // Keyboard Shortcuts: Ctrl+U (Toggle Overlay), Ctrl+Alt+L (Toggle Auto Mode)
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
        }
        if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            autoModeActive = !autoModeActive;
            overlay.style.borderRightColor = autoModeActive ? '#E11D48' : '#70B80B';
            if (!autoModeActive) {
                currentQuestionID = null;
                filledSuccess = false;
                overlay.innerText = 'Engine Halted Safely.';
            }
        }
    });
})();
