# Education Perfect (EP) API & Question Structure Notes

## Overview

EP is a micro-frontend app built on AngularJS (inside webpack bundles). Question data is **not** fetched per-question over the network — it's loaded upfront and stored in the AngularJS scope. The game runs inside `mfe-student-app`.

---

## Accessing Question Data (Browser Console)

```javascript
// Get the AngularJS game scope
var gameScope;
document.querySelectorAll('*').forEach(el => {
  try {
    var s = angular.element(el).scope();
    if (s && s.game && s.game.model) gameScope = s;
  } catch(e) {}
});

// Current question definition
var def = gameScope.game.model.currentQuestion.questionDef;
console.log(def);
```

Key fields on `currentQuestion`:
- `contentID` — unique ID for this question
- `questionDef` — the full question definition (see below)
- `translationDirection` — language direction
- `questionIndex` — index in the list

---

## questionDef Structure

```json
{
  "TypeCode": "COMP",
  "Title": "...",
  "TextTemplate": "...",         // markdown-like layout template
  "ExplanationTemplate": "...",  // shown after answering
  "Components": [...],           // array of interactive components
  "Variables": [...],            // internal variables
  "TimerSeconds": 120
}
```

---

## Component Types (ComponentTypeCode)

### FILL_IN_GAPS_COMPONENT (drag & drop / fill in blank)
```json
{
  "ComponentTypeCode": "FILL_IN_GAPS_COMPONENT",
  "Gaps": [
    {
      "ID": 0,
      "CorrectOptions": ["rock"],
      "IncorrectOptions": ["friend", "partner"]
    }
  ]
}
```
**Answer:** `gap.CorrectOptions` array

---

### MULTICHOICE_COMPONENT (Yes/No, multiple choice)
```json
{
  "ComponentTypeCode": "MULTICHOICE_COMPONENT",
  "Options": [
    {
      "TextTemplate": "[block align=\"left\"\nYes\n]",
      "Correct": "false"
    },
    {
      "TextTemplate": "[block align=\"left\"\nNo\n]",
      "Correct": "true"
    }
  ]
}
```
**Answer:** Options where `Correct === "true"`. Extract text by stripping `[block align="..."\n` and `\n]`.

Text extraction:
```javascript
function extractText(template) {
  return template
    .replace(/\[block[^\n]*\n/g, '')
    .replace(/\]/g, '')
    .replace(/\*\*/g, '')
    .trim();
}
```

---

### HIGHLIGHT_COMPONENT (tap/click words)
```json
{
  "ComponentTypeCode": "HIGHLIGHT_COMPONENT",
  "CorrectOptions": [0, 2],
  "TextTemplate": "[block align=\"left\"\n[hl 0:Shun:true] [hl 1:was:false] [hl 2:a cool summer breeze.:true]\n]"
}
```
**Answer:** Parse `[hl INDEX:TEXT:BOOL]` tokens, return TEXT where INDEX is in `CorrectOptions`.

```javascript
function parseHighlight(component) {
  const correct = component.CorrectOptions || [];
  const matches = [...component.TextTemplate.matchAll(/\[hl (\d+):([^:]+):/g)];
  return matches
    .filter(m => correct.includes(parseInt(m[1])))
    .map(m => m[2]);
}
```

---

### DROPDOWN_COMPONENT (select from dropdown)
Likely similar to MULTICHOICE — check `Options` array for `Correct === "true"`.

---

## API Endpoints

Base URL: `https://services.educationperfect.com/json.rpc`

All requests are JSON-RPC 2.0 POST with `Content-Type: application/json`.

Auth is via `access_token` cookie (JWT).

### Save Answer
```
Method: nz.co.LanguagePerfect.Services.PortalsAsync.App.AppServicesPortal.SaveFinalActivityAttemptAnswers
Params: [sessionID, [answerObjects]]
Response: { Success: true }
```
Write-only — does not return question data.

### Get Tasks
```
Method: nz.co.LanguagePerfect.Services.PortalsAsync.App.AppServicesPortal.GetCurrentTasksForUser
Response: { LearnContentTasks, CompleteActivityTasks, AssessmentTasks }
```

### Scoreboard
```
Method: nz.co.LanguagePerfect.Services.PortalsAsync.App.AppServicesPortal.GetScoreboardScores
```

---

## Network Architecture

- Main app: `app.educationperfect.com` (SPA shell)
- Services API: `services.educationperfect.com/json.rpc`
- Sockets: `wss://sockets-v4.educationperfect.com` (Socket.io — heartbeat only for live scoreboard)
- Static assets: `static.educationperfect.com`
- Question data is **cached by a Service Worker** and loaded from the MFE student app bundle — not fetched per-question

---

## Answer Overlay Script (Full)

Paste in browser console while on an EP activity:

```javascript
document.getElementById('ep-answer-overlay')?.remove();

const overlay = document.createElement('div');
overlay.id = 'ep-answer-overlay';
overlay.style.cssText = `
  position: fixed; top: 10px; right: 60px;
  background: #182552; color: #ffffff;
  padding: 8px 16px; border-radius: 6px;
  font-size: 14px; font-weight: 600;
  z-index: 999999; max-width: 320px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
`;
document.body.appendChild(overlay);

function extractText(t) {
  if (!t) return '';
  return t.replace(/\[block[^\n]*\n/g,'').replace(/\]/g,'').replace(/\*\*/g,'').trim();
}

function parseHighlight(c) {
  const correct = c.CorrectOptions || [];
  const matches = [...(c.TextTemplate||'').matchAll(/\[hl (\d+):([^:]+):/g)];
  return matches.filter(m => correct.includes(parseInt(m[1]))).map(m => m[2]);
}

setInterval(() => {
  try {
    var gameScope;
    document.querySelectorAll('*').forEach(el => {
      try {
        var s = angular.element(el).scope();
        if (s && s.game && s.game.model) gameScope = s;
      } catch(e) {}
    });
    if (!gameScope) return;
    var q = gameScope.game.model.currentQuestion;
    if (!q?.questionDef?.Components) return;

    var answers = [];
    q.questionDef.Components.forEach(c => {
      if (c.Gaps) c.Gaps.forEach(g => answers.push(...(g.CorrectOptions||[])));
      if (c.Options) c.Options.filter(o => o.Correct==='true'||o.IsCorrect).forEach(o => {
        const t = extractText(o.TextTemplate)||o.Text||o.Label;
        if (t) answers.push(t);
      });
      if (c.ComponentTypeCode === 'HIGHLIGHT_COMPONENT') answers.push(...parseHighlight(c));
    });

    document.querySelectorAll('.draggable').forEach(el => {
      el.style.outline = '';
      const label = el.querySelector('.drag-label');
      if (label && answers.some(a => a.toLowerCase()===label.innerText.trim().toLowerCase()))
        el.style.outline = '3px solid #70B80B';
    });

    overlay.innerText = answers.length ? 'Answer: ' + answers.join(' / ') : '⏳';
  } catch(e) {}
}, 500);
```
