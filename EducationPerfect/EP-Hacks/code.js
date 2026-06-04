// ==UserScript==
// @name         EP Ultimate Automation Helper (v12.0)
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  Layout Settling Buffer State Machine with native HTML5 DragEvent Simulation.
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

    const LOOP_SPEED = 200; // High-frequency polling loop

    // ---- UI Overlay Setup ----
    let overlay = document.getElementById('ep-ultimate-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'ep-ultimate-overlay';
    overlay.style.cssText = `
        position: fixed; top: 12px; right: 12px;
        background: rgba(15, 23, 42, 0.96); color: #ffffff;
        padding: 8px 14px; border-radius: 6px;
        font-size: 12px; font-weight: 600;
        z-index: 999999; max-width: 290px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.4);
        font-family: system-ui, -apple-system, sans-serif;
        pointer-events: none; word-wrap: break-word;
        border-right: 4px solid #70B80B;
        line-height: 1.4;
    `;
    document.body.appendChild(overlay);
    overlay.innerText = 'Ready (v12.0)';

    // ---- Normalizer Utilities ----
    function extractText(t) {
        if (!t) return '';
        return t.replace(/\[block[^\n]*\n/g,'').replace(/\]/g,'').replace(/\*\*/g,'').trim();
    }

    function normalizeStr(str) {
        if (!str) return '';
        return str.toLowerCase().replace(/[\n\r\s]+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
    }

    function parseHighlight(c) {
        const correct = c.CorrectOptions || [];
        const matches = [...(c.TextTemplate || '').matchAll(/\[hl (\d+):([^:]+):/g)];
        return matches.filter(m => correct.includes(parseInt(m[1]))).map(m => ({
            index: parseInt(m[1]),
            text: m[2]
        }));
    }

    // ---- DOM Selection Engine ----
    function findBestElement(targetText) {
        const targetClean = normalizeStr(targetText);
        if (!targetClean) return null;

        let bestEl = null;
        let bestScore = Infinity;

        const candidates = document.querySelectorAll('span, button, div, label, p, [role="checkbox"], [role="radio"], .option, .mc-option, .highlight-word, .hl-word, [class*="drag"], .word');
        candidates.forEach(el => {
            if (el.offsetParent === null || el.innerText.length > targetText.length + 50) return;

            const elClean = normalizeStr(el.innerText);
            if (elClean === targetClean || elClean.includes(targetClean)) {
                let score = el.innerText.length + (el.children.length * 15);
                if (elClean === targetClean) score -= 200;

                if (score < bestScore) {
                    bestScore = score;
                    bestEl = el;
                }
            }
        });
        return bestEl;
    }

    function isAlreadySelected(el) {
        if (!el) return false;
        if (el.checked || el.classList.contains('selected') || el.classList.contains('active') || el.classList.contains('checked') || el.classList.contains('is-correct')) return true;

        let parent = el.parentElement;
        for (let i = 0; i < 4 && parent; i++) {
            if (parent.classList.contains('selected') || parent.classList.contains('active') || parent.classList.contains('checked')) return true;
            parent = parent.parentElement;
        }
        return false;
    }

    // ---- Event Simulators ----
    function triggerFullClickSequence(el) {
        if (!el) return;
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
            try {
                const eventObj = evt.startsWith('mouse') ? new MouseEvent(evt, { bubbles: true }) : new Event(evt, { bubbles: true });
                el.dispatchEvent(eventObj);
            } catch (e) {}
        });
    }

    function robustType(inputEl, text) {
        if (!inputEl) return;
        inputEl.focus();
        inputEl.value = text;
        if (inputEl.getAttribute('contenteditable') === 'true') {
            inputEl.innerText = text;
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
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

    function getAnswers(q) {
        const answers = [];
        if (!q?.questionDef?.Components) return answers;

        q.questionDef.Components.forEach(c => {
            if (c.Gaps) {
                c.Gaps.forEach(g => {
                    if (g.CorrectOptions?.[0]) answers.push(g.CorrectOptions[0]);
                });
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
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true) {
                        answers.push(o.Description || o.Text);
                    }
                });
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

    // ---- Core Auto-Solver Engine ----
    function solveCurrentQuestion() {
        const gs = getGameScope();
        if (!gs) return false;
        const q = gs.game.model.currentQuestion;
        if (!q?.questionDef?.Components) return false;

        let filledAny = false;

        q.questionDef.Components.forEach(c => {
            // Drag and Drop Summary Boxes & Sorting Layouts
            if (c.Gaps) {
                const textInputs = Array.from(document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]')).filter(i => !i.readOnly && i.offsetParent !== null);

                const gapSelectors = ['.gap', '[class*="gap"]', '.drop-zone', '.placeholder', '.target-zone', '.word-gap-container', '[class*="placeholder"]', '.blank', 'ep-gap', '.drop-target', '.cloze-gap', '.drag-target'];
                const visualGaps = Array.from(document.querySelectorAll(gapSelectors.join(',')))
                    .filter(el => el.offsetParent !== null)
                    .sort((a, b) => {
                        const rA = a.getBoundingClientRect();
                        const rB = b.getBoundingClientRect();
                        if (Math.abs(rA.top - rB.top) < 25) return rA.left - rB.left;
                        return rA.top - rB.top;
                    });

                c.Gaps.forEach((g, index) => {
                    const ans = g.CorrectOptions?.[0];
                    if (!ans) return;

                    // Layer 1: Directly mutate the AngularJS model representation
                    try {
                        g.value = ans; g.Value = ans; g.studentAnswer = ans; g.userAnswer = ans;
                    } catch(e) {}

                    if (textInputs.length > 0 && textInputs[index]) {
                        robustType(textInputs[index], ans);
                        filledAny = true;
                    } else {
                        const tokenButton = findBestElement(ans);
                        const targetGap = visualGaps[index];
                        if (tokenButton && targetGap) {
                            // Layer 2: Click Simulation Sequence
                            triggerFullClickSequence(tokenButton);
                            setTimeout(() => triggerFullClickSequence(targetGap), 40);

                            // Layer 3: High-Fidelity Native HTML5 Drag and Drop Event Descriptors Simulation
                            try {
                                const dataTransfer = new DataTransfer();
                                tokenButton.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
                                targetGap.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
                                targetGap.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
                                targetGap.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
                                tokenButton.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
                            } catch(err) {}

                            filledAny = true;
                        }
                    }
                });
                try { gs.$apply(); } catch(e) {}
            }

            // Multiple Choice Cards
            if (c.ComponentTypeCode === 'MULTICHOICE_COMPONENT' && c.Options) {
                c.Options.forEach(o => {
                    if (o.Correct === 'true' || o.Correct === true || o.IsCorrect === true || o.IsCorrect === 'true') {
                        const rawText = o.TextTemplate || o.Text || o.Label || o.Description;
                        const targetEl = findBestElement(extractText(rawText));
                        if (targetEl && !isAlreadySelected(targetEl)) {
                            triggerFullClickSequence(targetEl);
                            filledAny = true;
                        }
                    }
                });
            }

            // Text Highlight Phrases
            if (c.ComponentTypeCode === 'HIGHLIGHT_COMPONENT') {
                const correctData = parseHighlight(c);
                const explicitWords = document.querySelectorAll('.highlight-word, .hl-word, span[class*="word"]');
                correctData.forEach(data => {
                    const normalizedTargetText = normalizeStr(data.text);
                    let target = [...explicitWords].find(w => normalizeStr(w.innerText) === normalizedTargetText);
                    if (!target) {
                        target = [...document.querySelectorAll('span, label, p')].find(el => normalizeStr(el.innerText) === normalizedTargetText && el.offsetParent !== null);
                    }
                    if (target && !isAlreadySelected(target)) {
                        triggerFullClickSequence(target);
                        filledAny = true;
                    }
                });
            }

            // Standard Input Workspaces
            if (c.ComponentTypeCode === 'TEXT_BOX_COMPONENT' && c.Options?.[0]) {
                const inputs = Array.from(document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]')).filter(i => !i.readOnly && i.offsetParent !== null);
                inputs.forEach(inp => {
                    robustType(inp, c.Options[0].trim());
                    filledAny = true;
                });
            }
        });

        return filledAny;
    }

    function pressSubmitOrContinue() {
        const btn = document.querySelector('.submit-btn, .continue-btn, [class*="submit"], [class*="continue"], [ng-click*="submit"], [ng-click*="continue"], [ng-click*="next"]');
        if (btn && btn.offsetParent !== null && btn.tagName !== 'BODY') {
            triggerFullClickSequence(btn);
            return true;
        }

        const genericBtn = [...document.querySelectorAll('button, .button, .ep-button, a')].find(b => {
            if (b.offsetParent === null) return false;
            const txt = b.innerText?.toLowerCase() || '';
            return txt.includes('submit') || txt.includes('continue') || txt.includes('next') || txt.includes('check');
        });

        if (genericBtn) {
            triggerFullClickSequence(genericBtn);
            return true;
        }
        return false;
    }

    function isTimerGateActive() {
        const genericBtn = [...document.querySelectorAll('button, .button, .ep-button')].find(b => b.offsetParent !== null);
        if (genericBtn) {
            return /^\d+\s+second/.test(genericBtn.innerText?.toLowerCase() || '');
        }
        return false;
    }

    // ---- Main Sync Lifecycle State Machine Loop ----
    setInterval(() => {
        const now = Date.now();
        try {
            const gs = getGameScope();

            if (!gs) {
                currentQuestionID = null;
                filledSuccess = false;
                if (autoModeActive) pressSubmitOrContinue();
                return;
            }

            const q = gs.game.model.currentQuestion;
            const answers = getAnswers(q);

            overlay.innerText = (autoModeActive ? '🤖 FULL AUTO RUNNING (v12.0)\n' : '⏳ READY\n') + (answers.length ? 'Ans: ' + answers.join(' / ') : 'Syncing workflow...');

            if (!autoModeActive) return;

            if (isTimerGateActive()) {
                pressSubmitOrContinue();
                return;
            }

            if (q && q.contentID) {
                // Step 1: Initialize New Slide State Variables
                if (q.contentID !== currentQuestionID) {
                    currentQuestionID = q.contentID;
                    filledSuccess = false;
                    slideSettledTime = now;
                    return;
                }

                // Step 2: Layout Settling Phase (Wait 250ms for elements to construct on screen)
                if (!filledSuccess && (now - slideSettledTime > 250)) {
                    const success = solveCurrentQuestion();
                    if (success || answers.length > 0) {
                        filledSuccess = true;
                        fillExecutedTime = now;
                    }
                    return;
                }

                // Step 3: Buffered Submission Phase (Wait 450ms for values to register with Angular)
                if (filledSuccess && (now - fillExecutedTime > 450)) {
                    pressSubmitOrContinue();
                }

                // Step 4: Self-Healing Safeguard (If stuck on a slide for over 3.5 seconds, clear and retry)
                if (now - slideSettledTime > 3500) {
                    filledSuccess = false;
                    slideSettledTime = now;
                }
            } else {
                // Instantly wipe intermediate points screens and feedback flags
                const feedbackActive = document.querySelector('.points-feedback, .feedback-container, [class*="feedback"], .correct-feedback, .incorrect-feedback');
                if (feedbackActive || !q) {
                    pressSubmitOrContinue();
                    currentQuestionID = null;
                    filledSuccess = false;
                }
            }
        } catch(e) {}
    }, LOOP_SPEED);

    // Command Configurations (Ctrl+U view panel toggler, Ctrl+Alt+L toggle Auto loop)
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
            }
        }
    });
})();
