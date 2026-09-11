# SEQTA Learn API Documentation

> **Base URL:** `https://students.trinity.wa.edu.au`  
> **Auth:** Session cookie `JSESSIONID` required on all `/seqta/student/` endpoints  
> **Method:** All endpoints are `POST` with `Content-Type: application/json` unless noted  
> **Headers required:**
> ```
> Content-Type: application/json; charset=UTF-8
> X-Requested-With: XMLHttpRequest
> Cookie: JSESSIONID=<your-token>
> ```

---

## Authentication

### Login / Session Check
`POST /seqta/student/login`

```json
{ "mode": "normal", "query": null, "redirect_url": "https://students.trinity.wa.edu.au/" }
```

If session is active, returns `personUUID` directly. Otherwise returns a `saml` array to initiate SSO. Use `fetch-session.py` to get your `JSESSIONID`.

**Response (authenticated):**
```json
{
  "payload": {
    "personUUID": "13a2e2e9-2311-4abc-bcc5-6469c47200df",
    "meta": { "code": "33855", "governmentID": "36951990" },
    "clientIP": "10.14.24.3"
  }
}
```

### Heartbeat (keep session alive)
`POST /seqta/student/heartbeat`

```json
{ "timestamp": "1970-01-01 00:00:00.0", "hash": "" }
```

**Response:**
```json
{
  "payload": {
    "identifier": "au_wa_trinity",
    "version": "2026.4.3-master-20260424-242",
    "uuid": "f3b88b2a-d5ff-4877-ab10-d008f40c5e53",
    "notifications": [],
    "ts": "2026-06-06 08:33:53.06300"
  },
  "status": "200"
}
```

---

## General

### Settings
`POST /seqta/student/load/settings`

```json
{}
```

Returns all feature flags and school configuration values as a flat key→`{value}` map.

### Subjects
`POST /seqta/student/load/subjects`

```json
{}
```

**Response:**
```json
{
  "payload": [
    {
      "code": "2026S1",
      "subjects": [
        {
          "code": "8EN21",
          "classunit": 106314,
          "description": "English Course 2 (Mainstream)",
          "metaclass": 106883,
          "title": "8EN2 English",
          "programme": 6759,
          "marksbook_type": "graded"
        }
      ]
    }
  ]
}
```

**Key fields:**
| Field | Description |
|---|---|
| `code` | Semester/period code e.g. `2026S1` |
| `subjects[].metaclass` | Metaclass ID — used in assessment, courses, syllabus calls |
| `subjects[].programme` | Programme ID — used in assessment, courses, syllabus calls |
| `subjects[].classunit` | Class unit ID |

### Preferences
`POST /seqta/student/load/prefs`

```json
{ "request": "userPrefs", "asArray": true, "user": 4284 }
```

Returns user preferences including timetable colours, UI settings.

### Portals
`POST /seqta/student/load/portals`

```json
{}
```
or `{ "splash": true }` for the splash portal with full HTML content.

### Documents
`POST /seqta/student/load/documents`

```json
{}
```

Returns school documents organised by category.

### Reports
`POST /seqta/student/load/reports`

```json
{}
```

**Response:**
```json
{
  "payload": [
    {
      "types": "Interim 1",
      "filename": "2026-03-30_33855.pdf",
      "terms": "2026S1",
      "year": "Y08",
      "uuid": "0bf75c1b-0ce1-4c03-a5cb-50ed4aee4a82",
      "created_date": "2026-03-30 10:51:14.328349+08",
      "mimetype": "application/pdf"
    }
  ]
}
```

### Themes
`POST /seqta/student/themes/list`

```json
{}
```

Returns available UI themes with colours and font settings.

### Branding
`POST /seqta/student/branding/load`

```json
{ "logo": true }
```

### Storage / Health
`POST /seqta/student/storage`

```json
{}
```

**Response:**
```json
{
  "payload": {
    "component": { "database": "OK", "system": "OK", "userfiles": "OK", "backups": "CRITICAL" },
    "timestamp": 1780705979499
  }
}
```

### Release Alerts
`POST /seqta/student/releasealert/get`

```json
{}
```

### Forums
`POST /seqta/student/load/forums`

```json
{ "mode": "list" }
```

---

## Timetable

### Get Timetable
`POST /seqta/student/load/timetable`

```json
{ "from": "2026-06-01", "until": "2026-06-07", "student": 4284 }
```

**Response:**
```json
{
  "payload": {
    "cycles": {
      "2026-06-02": ["Tuesday"],
      "2026-06-03": ["Wednesday"]
    },
    "items": [
      {
        "date": "2026-06-05",
        "period": "Period 0",
        "code": "8HE5",
        "description": "Health",
        "staff": "Mr Stephen Leahy",
        "staffID": 57,
        "room": "S118",
        "from": "08:40:00",
        "until": "09:24:00",
        "type": "class",
        "metaID": 106904,
        "ci": 1575659,
        "programmeID": 6763,
        "programme": "8HE Health",
        "assessments": [],
        "attendance": { "icon": "attendance/yes", "label": "In-class" },
        "teamSync": false
      }
    ]
  }
}
```

### Dashboard Timetable (today/tomorrow)
`POST /seqta/student/dashlet/timetable`

```json
{ "from": "2026-06-06", "until": "2026-06-07" }
```

### Events
`POST /seqta/student/events/load`

```json
{ "dateFrom": "2026-06-01", "dateTo": "2026-06-07", "person": 4284, "personType": "student" }
```

---

## Courses & Subjects

### Course Content
`POST /seqta/student/load/courses`

```json
{ "programme": "6759", "metaclass": "106883" }
```

Returns full course content including files, lesson plan (`d` array), and course metadata.

**Response fields:**
| Field | Description |
|---|---|
| `c` | Course code string |
| `cf` | Course files (attachments) |
| `d` | Lesson data array — weeks and lessons |
| `im` | Cover image UUID |

### Syllabus
`POST /seqta/student/load/syllabus`

```json
{ "programme": "6759", "metaclass": "106883" }
```

Returns the curriculum syllabus for the subject.

### File Download
`GET /seqta/student/load/file?uuid=<file-uuid>`  
`GET /seqta/student/files/stream?uuid=<file-uuid>`

Both require `JSESSIONID` cookie. `/load/file` redirects (301) to `/files/stream`.

---

## Assessments

### Upcoming Assessments
`POST /seqta/student/assessment/list/upcoming`

```json
{ "student": 4284, "metaclass": 106883, "programme": 6759 }
```

**Response:**
```json
{
  "payload": [
    {
      "id": 45057,
      "title": "Task 3: Writing & Grammar (EP) T2 Wk 8",
      "subject": "Italian",
      "code": "8ITAL5",
      "due": "2026-06-08",
      "status": "UPCOMING",
      "graded": false,
      "overdue": false,
      "metaclassID": 106920,
      "programmeID": 6628,
      "hasFeedback": false,
      "availability": "details",
      "reflectionsEnabled": false,
      "expectationsEnabled": false
    }
  ]
}
```

### Past Assessments
`POST /seqta/student/assessment/list/past`

```json
{ "programme": 6628, "metaclass": 106920, "student": 4284 }
```

Returns completed assessments with scores, criteria, and feedback info.

**Response item fields:**
| Field | Description |
|---|---|
| `id` | Assessment ID |
| `title` | Assessment title |
| `due` | Due date |
| `status` | `MARKS_RELEASED`, `SUBMITTED`, etc. |
| `criteria` | Array of `{id, label, score, percentage, target}` |
| `hasFeedback` | Whether feedback is available |
| `reflectionsEnabled` / `expectationsEnabled` | Feature flags |

### Assessment Details
`POST /seqta/student/assessment/get`

```json
{ "assessment": 45057, "student": 4284, "metaclass": 106920 }
```

Returns full assessment with rubric, criteria descriptors, and submission details.

### Assessment Submissions
`POST /seqta/student/assessment/submissions/get`

```json
{ "assessment": 45057, "metaclass": 106920, "student": 4284 }
```

### WISP Submissions
`POST /seqta/student/assessment/wisp/get`

```json
{ "assessment": 45057, "metaclass": 106920 }
```

---

## Notices

### Get Notices by Date
`POST /seqta/student/load/notices`

```json
{ "date": "2026-06-06" }
```

**Response item:**
```json
{
  "colour": "#d4a16b",
  "label_title": "Year 7, 8, 9, 10, 11 & 12",
  "contents": "HTML content of the notice..."
}
```

### Get Notice Labels
`POST /seqta/student/load/notices`

```json
{ "mode": "labels" }
```

**Response:**
```json
{
  "payload": [
    { "colour": "#108a54", "id": 28, "title": "Middle School" },
    { "colour": "#5596b2", "id": 31, "title": "Senior School" }
  ]
}
```

---

## Messages (Direct Messages)

### Get Message Labels / Counts
`POST /seqta/student/load/message`

```json
{ "action": "labels" }
```

**Response:**
```json
{
  "payload": [
    { "unread": 0, "label": "inbox" },
    { "unread": 0, "label": "outbox" },
    { "unread": 2, "label": "trash" }
  ]
}
```

### List Messages
`POST /seqta/student/load/message`

```json
{
  "action": "list",
  "label": "inbox",
  "offset": 0,
  "limit": 100,
  "sortBy": "date",
  "sortOrder": "desc",
  "searchValue": "",
  "datetimeUntil": null
}
```

**Response item:**
```json
{
  "id": 690941,
  "subject": "Bus v CCGS - 05/06/2026",
  "sender": "Mr John Black",
  "sender_id": 964,
  "sender_type": "staff",
  "date": "2026-06-05 07:55:00.461404+08",
  "read": 1,
  "attachments": false,
  "attachmentCount": 0,
  "participants": [{ "name": "Zayn de Lobel", "photo": "<uuid>", "type": "student" }]
}
```

### Get Single Message
`POST /seqta/student/load/message`

```json
{ "action": "get", "id": 690941 }
```

### Send Message
`POST /seqta/student/save/message`

```json
{
  "subject": "Hello",
  "contents": "Message body here",
  "participants": [{ "staff": true, "id": 964 }],
  "blind": false,
  "files": []
}
```

**Response:**
```json
{ "payload": { "subject": "Hello", "recipients": 1, "id": 635615 }, "status": "200" }
```

### Get People (for composing)
`POST /seqta/student/message/people`

```json
{ "mode": "staff" }
```

`mode` can be `"student"`, `"staff"`, or `"tutor"`.

---

## Dashboard

### Dashboard Layout
`POST /seqta/student/dashboard`

```json
{}
```

Returns `available` and `used` dashlet configurations.

### Homework Dashlet
`POST /seqta/student/dashlet/summary/homework`

```json
{}
```

Returns homework notes grouped by subject.

### Message of the Day
`POST /seqta/student/dashlet/motd`

```json
{}
```

### Tasks
`POST /seqta/student/dashlet/tasks`

```json
{ "completed": true, "load": true }
```

### Pastoral
`POST /seqta/student/dashlet/pastoral`

```json
{ "from": "2026-05-06", "to": "2026-06-06" }
```

### Notes
`POST /seqta/student/dashlet/notes`

```json
{ "load": true }
```

### Absence Summary
`POST /seqta/student/dashlet/summary/absence`

```json
{}
```

---

## Student Photo
`GET /seqta/student/photo/get?uuid=<personUUID>`

Returns the student photo as an image.

---

## Endpoint Quick Reference

| Endpoint | Body | Description |
|---|---|---|
| `POST /seqta/student/login` | `{"mode":"normal",...}` | Session check / initiate SSO |
| `POST /seqta/student/heartbeat` | `{"timestamp":"1970-...","hash":""}` | Keep-alive |
| `POST /seqta/student/load/settings` | `{}` | Feature flags |
| `POST /seqta/student/load/subjects` | `{}` | Enrolled subjects + metaclass/programme IDs |
| `POST /seqta/student/load/timetable` | `{"from":"YYYY-MM-DD","until":"YYYY-MM-DD","student":ID}` | Weekly timetable |
| `POST /seqta/student/events/load` | `{"dateFrom":"...","dateTo":"...","person":ID,"personType":"student"}` | Calendar events |
| `POST /seqta/student/load/courses` | `{"programme":"ID","metaclass":"ID"}` | Course content + files |
| `POST /seqta/student/load/syllabus` | `{"programme":"ID","metaclass":"ID"}` | Subject syllabus |
| `POST /seqta/student/assessment/list/upcoming` | `{"student":ID,"metaclass":ID,"programme":ID}` | Upcoming assessments |
| `POST /seqta/student/assessment/list/past` | `{"programme":ID,"metaclass":ID,"student":ID}` | Past assessments + marks |
| `POST /seqta/student/assessment/get` | `{"assessment":ID,"student":ID,"metaclass":ID}` | Assessment detail + rubric |
| `POST /seqta/student/load/notices` | `{"date":"YYYY-MM-DD"}` | Daily notices |
| `POST /seqta/student/load/notices` | `{"mode":"labels"}` | Notice label categories |
| `POST /seqta/student/load/message` | `{"action":"labels"}` | Inbox/outbox counts |
| `POST /seqta/student/load/message` | `{"action":"list","label":"inbox",...}` | List messages |
| `POST /seqta/student/load/message` | `{"action":"get","id":ID}` | Read message |
| `POST /seqta/student/save/message` | `{"subject":"...","contents":"...","participants":[...]}` | Send message |
| `POST /seqta/student/message/people` | `{"mode":"staff"}` | Get people to message |
| `POST /seqta/student/load/documents` | `{}` | School documents |
| `POST /seqta/student/load/reports` | `{}` | Student reports (PDFs) |
| `POST /seqta/student/load/prefs` | `{"request":"userPrefs","asArray":true,"user":ID}` | User preferences |
| `POST /seqta/student/load/portals` | `{}` | Student portals |
| `POST /seqta/student/load/forums` | `{"mode":"list"}` | Forums |
| `POST /seqta/student/dashboard` | `{}` | Dashboard layout |
| `POST /seqta/student/dashlet/summary/homework` | `{}` | Homework summary |
| `POST /seqta/student/dashlet/motd` | `{}` | Message of the day |
| `POST /seqta/student/dashlet/timetable` | `{"from":"YYYY-MM-DD","until":"YYYY-MM-DD"}` | Dashboard timetable |
| `POST /seqta/student/themes/list` | `{}` | UI themes |
| `POST /seqta/student/storage` | `{}` | System health |
| `GET /seqta/student/photo/get?uuid=UUID` | — | Student photo |
| `GET /seqta/student/files/stream?uuid=UUID` | — | Download file |

---

## Notes

- **Student ID:** `4284` — your numeric user ID (from preferences/timetable requests)
- **Metaclass & Programme IDs:** obtained from `load/subjects` — required for assessment/course calls
- **Date format:** Always `YYYY-MM-DD`
- **Session expiry:** Call `heartbeat` periodically to keep alive
- **File downloads:** Use `JSESSIONID` cookie + `GET /seqta/student/files/stream?uuid=<uuid>`