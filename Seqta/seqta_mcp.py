#!/usr/bin/env python3
"""
seqta_mcp.py  -  MCP server for SEQTA Learn
Auto-refreshes the session token every 10 minutes.

CONFIGURE THESE THREE LINES:
"""

SEQTA_BASE_URL = "https://students.trinity.wa.edu.au"
SEQTA_EMAIL    = "30delozay@students.trinity.wa.edu.au"
SEQTA_PASSWORD = "TownTank87"

# ─────────────────────────────────────────────────────────────────────────────

import re, json, time, threading, requests
from urllib.parse import urljoin
from pathlib import Path

try:
    from bs4 import BeautifulSoup
    from mcp.server.fastmcp import FastMCP
except ImportError as e:
    import sys
    sys.stderr.write(f"Missing dependency: {e}\nRun: pip install mcp requests beautifulsoup4\n")
    sys.exit(1)

BASE_URL   = SEQTA_BASE_URL
TENANT_ID  = "5f441b77-a931-4aaf-ad37-3273bf7fa459"
MS_BASE    = "https://login.microsoftonline.com"
STUDENT_ID = 4284
TOKEN_FILE = Path(__file__).parent / ".session"

mcp = FastMCP(
    "SEQTA",
    instructions=(
        "Access SEQTA Learn student data: timetable, assessments, notices, "
        "messages, courses, reports, and homework."
    ),
)

# ── Session store (thread-safe) ───────────────────────────────────────────────

_session_lock = threading.Lock()
_jsessionid   = ""
_last_refresh = 0.0
REFRESH_INTERVAL = 600  # 10 minutes

def log(msg):
    import sys
    print(f"[seqta] {msg}", file=sys.stderr, flush=True)


# ── Auth helpers (from fetch-session.py) ─────────────────────────────────────

def extract_config(html):
    idx = html.find('$Config=')
    if idx == -1:
        return {}
    idx += len('$Config=')
    while idx < len(html) and html[idx] in ' \t\n\r':
        idx += 1
    if idx >= len(html) or html[idx] != '{':
        return {}
    depth, in_str, esc = 0, False, False
    for i in range(idx, len(html)):
        c = html[i]
        if esc:                  esc = False; continue
        if c == '\\' and in_str: esc = True;  continue
        if c == '"':             in_str = not in_str; continue
        if in_str:               continue
        if c == '{':             depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                try:    return json.loads(html[idx:i+1])
                except: return {}
    return {}


def ms_post(session, url, data, referer):
    if not url.startswith("http"):
        url = MS_BASE + url
    r = session.post(url, data=data, headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Referer": referer, "Origin": MS_BASE,
        "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-site", "Upgrade-Insecure-Requests": "1",
    }, allow_redirects=True)
    r.raise_for_status()
    return r


def navigate_to_login_form(session, html, url):
    for _ in range(6):
        cfg = extract_config(html)
        if cfg.get("sFT") and cfg.get("sCtx"):
            pid = re.search(r'content="([^"]*)"[^>]*name="PageID"|name="PageID"[^>]*content="([^"]*)"', html)
            pid = (pid.group(1) or pid.group(2)) if pid else ""
            if "Kmsi" not in pid:
                return html, cfg, url
        if cfg.get("oPostParams") and cfg.get("urlPost"):
            r = ms_post(session, cfg["urlPost"], cfg["oPostParams"], url)
            html, url = r.text, r.url
            continue
        soup = BeautifulSoup(html, "html.parser")
        form = soup.find("form")
        if form:
            action = urljoin(url, form.get("action", url))
            fields = {i["name"]: i.get("value","") for i in form.find_all("input") if i.get("name")}
            r = ms_post(session, action, fields, url)
            html, url = r.text, r.url
            continue
        raise RuntimeError(f"Could not reach MS login form.\nSnippet: {html[:400]}")
    raise RuntimeError("Too many hops to MS login form.")


def follow_to_saml(session, html, url):
    for _ in range(10):
        soup = BeautifulSoup(html, "html.parser")
        saml_input = soup.find("input", {"name": "SAMLResponse"})
        if saml_input:
            relay  = soup.find("input", {"name": "RelayState"})
            form   = soup.find("form")
            action = form["action"] if form else "/saml2"
            if not action.startswith("http"):
                action = f"{BASE_URL}{action if action.startswith('/') else '/' + action}"
            return saml_input["value"], (relay["value"] if relay else f"{BASE_URL}/"), action
        cfg = extract_config(html)
        if cfg.get("oPostParams") and cfg.get("urlPost") and not cfg.get("sFT"):
            r = ms_post(session, cfg["urlPost"], cfg["oPostParams"], url)
            html, url = r.text, r.url
            continue
        if cfg.get("sFT") and cfg.get("sCtx") and cfg.get("urlPost"):
            r = ms_post(session, cfg["urlPost"], {
                "LoginOptions": "1", "type": "28",
                "ctx": cfg["sCtx"], "hpgrequestid": "",
                "flowToken": cfg["sFT"], "canary": cfg.get("canary", ""),
                "i19": "2000",
            }, url)
            html, url = r.text, r.url
            continue
        form = soup.find("form")
        if form:
            action = urljoin(url, form.get("action", url))
            fields = {i["name"]: i.get("value","") for i in form.find_all("input") if i.get("name")}
            r = ms_post(session, action, fields, url)
            html, url = r.text, r.url
            continue
        raise RuntimeError(f"Stuck in MS redirect loop.\nSnippet: {html[:400]}")
    raise RuntimeError("Too many MS redirect hops.")


def do_auth() -> str:
    """Full SSO auth flow. Returns JSESSIONID string."""
    log("Authenticating via Microsoft SSO...")
    s = requests.Session()
    s.headers.update({"User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
    )})

    r = s.post(f"{BASE_URL}/seqta/student/login",
        json={"mode": "normal", "query": None, "redirect_url": f"{BASE_URL}/"},
        headers={"Content-type": "application/json; charset=UTF-8",
                 "X-Requested-With": "XMLHttpRequest",
                 "Referer": f"{BASE_URL}/", "Origin": BASE_URL})
    r.raise_for_status()
    payload = r.json().get("payload", {})

    if payload.get("personUUID") and not payload.get("saml"):
        cookies = {c.name: c.value for c in s.cookies}
        return cookies.get("JSESSIONID", "")

    saml = payload.get("saml", [{}])[0]
    if not saml.get("url"):
        raise RuntimeError(f"No SAML providers: {payload}")

    r = s.post(saml["url"], data={
        "SAMLRequest": saml["request"], "RelayState": saml["relaystate"],
        "SigAlg": saml["sigalg"], "Signature": saml["signature"],
    }, headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Origin": BASE_URL, "Referer": f"{BASE_URL}/",
        "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site", "Upgrade-Insecure-Requests": "1",
    }, allow_redirects=True)
    r.raise_for_status()

    html, cfg, current_url = navigate_to_login_form(s, r.text, r.url)
    flow_token = cfg["sFT"]
    ctx        = cfg["sCtx"]
    canary     = cfg.get("canary", "")

    r = s.post(f"{MS_BASE}/common/GetCredentialType?mkt=en-GB", json={
        "username": SEQTA_EMAIL, "isOtherIdpSupported": True, "checkPhones": False,
        "isRemoteNGCSupported": True, "isCookieBannerShown": False,
        "isFidoSupported": True, "originalRequest": ctx, "country": "AU",
        "forceotclogin": False, "isExternalFederationDisallowed": False,
        "isRemoteConnectSupported": False, "federationFlags": 0,
        "isSignup": False, "flowToken": flow_token,
        "isAccessPassSupported": True, "isQrCodePinSupported": True,
    }, headers={
        "Content-Type": "application/json; charset=UTF-8", "Accept": "application/json",
        "Origin": MS_BASE, "Referer": current_url,
        "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin",
    })
    r.raise_for_status()
    req_id     = r.headers.get("x-ms-request-id", "")
    flow_token = r.json().get("FlowToken", flow_token)

    r = s.post(f"{MS_BASE}/{TENANT_ID}/login", data={
        "i13": "0", "login": SEQTA_EMAIL, "loginfmt": SEQTA_EMAIL,
        "type": "11", "LoginOptions": "3", "passwd": SEQTA_PASSWORD,
        "ps": "2", "canary": canary, "ctx": ctx,
        "hpgrequestid": req_id, "flowToken": flow_token,
        "NewUser": "1", "fspost": "0", "i21": "0",
        "CookieDisclosure": "0", "IsFidoSupported": "1",
        "isSignupPost": "0", "i19": "29195",
    }, headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Origin": MS_BASE, "Referer": current_url,
        "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin", "Upgrade-Insecure-Requests": "1",
    }, allow_redirects=True)
    r.raise_for_status()

    if "AADSTS50126" in r.text or "AADSTS50034" in r.text:
        raise RuntimeError("Wrong email or password.")

    saml_resp, relay_state, acs_url = follow_to_saml(s, r.text, r.url)

    r = s.post(acs_url, data={"SAMLResponse": saml_resp, "RelayState": relay_state},
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Origin": MS_BASE, "Referer": MS_BASE + "/",
            "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "cross-site",
        }, allow_redirects=False)

    # Confirm
    r = s.post(f"{BASE_URL}/seqta/student/login",
        json={"mode": "normal", "query": None, "redirect_url": f"{BASE_URL}/"},
        headers={"Content-type": "application/json; charset=UTF-8",
                 "X-Requested-With": "XMLHttpRequest",
                 "Referer": f"{BASE_URL}/", "Origin": BASE_URL})
    r.raise_for_status()
    final = r.json().get("payload", {})
    if "personUUID" not in final:
        raise RuntimeError("Session confirmation failed.")

    cookies = {c.name: c.value for c in s.cookies}
    jsid = cookies.get("JSESSIONID", "")
    log(f"Auth OK — personUUID={final.get('personUUID')}")
    return jsid


def get_token() -> str:
    """Return a valid JSESSIONID, refreshing if needed."""
    global _jsessionid, _last_refresh
    now = time.time()
    with _session_lock:
        if not _jsessionid or (now - _last_refresh) > REFRESH_INTERVAL:
            try:
                _jsessionid = do_auth()
                _last_refresh = now
                TOKEN_FILE.write_text(_jsessionid)
                log("Token refreshed.")
            except Exception as e:
                log(f"Auth failed: {e}")
                # Fall back to saved token if available
                if TOKEN_FILE.exists():
                    _jsessionid = TOKEN_FILE.read_text().strip()
                    log("Using cached token.")
        return _jsessionid


def make_session() -> requests.Session:
    jsid = get_token()
    s = requests.Session()
    s.cookies.set("JSESSIONID", jsid, domain=BASE_URL.replace("https://", ""))
    s.headers.update({
        "Content-Type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE_URL,
        "Referer": f"{BASE_URL}/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36",
    })
    return s


def api(endpoint: str, body: dict = None, method: str = "POST") -> dict:
    s = make_session()
    url = f"{BASE_URL}{endpoint}"
    r = s.get(url) if method == "GET" else s.post(url, json=body or {})
    r.raise_for_status()
    return r.json()


def payload(endpoint: str, body: dict = None):
    return api(endpoint, body).get("payload", {})


def today():
    import datetime
    return datetime.date.today().isoformat()

def week_start():
    import datetime
    d = datetime.date.today()
    return (d - datetime.timedelta(days=d.weekday())).isoformat()

def week_end():
    import datetime
    d = datetime.date.today()
    return (d - datetime.timedelta(days=d.weekday()) + datetime.timedelta(days=6)).isoformat()


def get_subjects():
    data = payload("/seqta/student/load/subjects")
    subjects = []
    for period in (data if isinstance(data, list) else []):
        for s in period.get("subjects", []):
            subjects.append(s)
    return subjects

def find_subject(keyword: str):
    kw = keyword.lower()
    return [s for s in get_subjects()
            if kw in s.get("title","").lower()
            or kw in s.get("code","").lower()
            or kw in s.get("description","").lower()]


# ── MCP Tools ─────────────────────────────────────────────────────────────────

@mcp.tool()
def get_timetable(from_date: str = "", until_date: str = "") -> str:
    """Get the school timetable for a date range. Defaults to the current week. Dates in YYYY-MM-DD."""
    data = payload("/seqta/student/load/timetable", {
        "from":    from_date  or week_start(),
        "until":   until_date or week_end(),
        "student": STUDENT_ID,
    })
    items = data.get("items", [])
    if not items:
        return "No timetable entries found for this period."
    lines = []
    for item in sorted(items, key=lambda x: (x["date"], x["from"])):
        lines.append(
            f"{item['date']} {item['from'][:5]}-{item['until'][:5]}  "
            f"[{item['period']}] {item['description']} ({item['code']})  "
            f"Room: {item.get('room','?')}  Teacher: {item.get('staff','?')}"
        )
    return "\n".join(lines)


@mcp.tool()
def get_subjects_list() -> str:
    """Get all enrolled subjects with their metaclass and programme IDs."""
    subjects = get_subjects()
    if not subjects:
        return "No subjects found."
    return "\n".join(
        f"{s['code']} — {s['title']} (metaclass={s['metaclass']}, programme={s['programme']})"
        for s in subjects
    )


@mcp.tool()
def get_notices(date: str = "") -> str:
    """Get school notices for a specific date (YYYY-MM-DD). Defaults to today."""
    data = payload("/seqta/student/load/notices", {"date": date or today()})
    if not data:
        return "No notices for this date."
    notices = data if isinstance(data, list) else []
    lines = []
    for n in notices:
        lines.append(f"[{n.get('label_title','General')}]\n{_strip_html(n.get('contents',''))}\n")
    return "\n---\n".join(lines) if lines else "No notices."


@mcp.tool()
def get_upcoming_assessments(subject_keyword: str = "") -> str:
    """Get upcoming assessments. Optionally filter by subject keyword (e.g. 'english', 'maths')."""
    subjects = find_subject(subject_keyword) if subject_keyword else get_subjects()
    if not subjects:
        return f"No subjects found matching '{subject_keyword}'."
    all_items = []
    for s in subjects:
        data = payload("/seqta/student/assessment/list/upcoming", {
            "student":   STUDENT_ID,
            "metaclass": s["metaclass"],
            "programme": s["programme"],
        })
        items = data if isinstance(data, list) else []
        for item in items:
            item["_subject_title"] = s["title"]
            all_items.append(item)
    if not all_items:
        return "No upcoming assessments found."
    all_items.sort(key=lambda x: x.get("due", "9999"))
    lines = []
    for a in all_items:
        overdue = " ⚠️ OVERDUE" if a.get("overdue") else ""
        lines.append(
            f"[{a.get('due','?')}]{overdue} {a['_subject_title']}: {a['title']} "
            f"(status: {a.get('status','?')})"
        )
    return "\n".join(lines)


@mcp.tool()
def get_past_assessments(subject_keyword: str) -> str:
    """Get past assessments and marks for a subject. Provide a keyword like 'english' or 'italian'."""
    subjects = find_subject(subject_keyword)
    if not subjects:
        return f"No subjects found matching '{subject_keyword}'."
    results = []
    for s in subjects:
        data = payload("/seqta/student/assessment/list/past", {
            "programme": s["programme"],
            "metaclass":  s["metaclass"],
            "student":    STUDENT_ID,
        })
        syllabus = data.get("syllabus", []) if isinstance(data, dict) else []
        results.append(f"=== {s['title']} ===")
        for syl in syllabus:
            for a in syl.get("assessments", []):
                criteria_str = ""
                for c in a.get("criteria", []):
                    criteria_str += f"\n    • {c['label']}: {c.get('score','?')}/{c.get('target','?')} ({c.get('percentage','?')}%)"
                results.append(
                    f"[{a.get('due','?')}] {a['title']} — {a.get('status','?')}"
                    + criteria_str
                )
    return "\n".join(results) if results else "No past assessments found."


@mcp.tool()
def get_today_lessons(date: str = "") -> str:
    """
    Get detailed lesson content for each class on a given date (YYYY-MM-DD).
    Defaults to today. Shows the lesson topic, resources and files for each class.
    Much more detailed than get_timetable - use this when asked what's happening
    in a specific subject today.
    """
    import datetime as dt
    target = date or dt.date.today().isoformat()

    # Step 1: get timetable for that day to know what subjects are on
    timetable = payload("/seqta/student/load/timetable", {
        "from": target, "until": target, "student": STUDENT_ID,
    })
    items = timetable.get("items", [])
    if not items:
        return f"No classes on {target}."

    results = []
    results.append(f"Classes on {target}:")

    for item in sorted(items, key=lambda x: x["from"]):
        subject_line = (
            f"\n{'='*40}\n"
            f"{item['from'][:5]}-{item['until'][:5]}  {item['description']} ({item['code']})\n"
            f"Period: {item['period']}  Room: {item.get('room','?')}  Teacher: {item.get('staff','?')}"
        )
        results.append(subject_line)

        prog_id  = item.get("programmeID")
        meta_id  = item.get("metaID")
        if not prog_id or not meta_id:
            results.append("  (No course data available)")
            continue

        # Step 2: load course content for this subject
        try:
            course = payload("/seqta/student/load/courses", {
                "programme": str(prog_id),
                "metaclass":  str(meta_id),
            })
        except Exception as e:
            results.append(f"  (Could not load course: {e})")
            continue

        d_weeks = course.get("d", [])  # lesson schedule array
        w_weeks = course.get("w", [])  # lesson content array (parallel to d)

        # Find which week index contains today's date
        week_idx = None
        for i, week in enumerate(d_weeks):
            for lesson in week.get("l", []):
                if lesson.get("d") == target:
                    week_idx = i
                    break
            if week_idx is not None:
                break

        if week_idx is None:
            results.append("  No lesson content found for this date.")
            continue

        week_d = d_weeks[week_idx]
        results.append(f"  Term {week_d.get('t')}, Week {week_d.get('w')}")

        if week_idx < len(w_weeks):
            week_content = w_weeks[week_idx]
            for lesson_item in (week_content if isinstance(week_content, list) else [week_content]):
                title = lesson_item.get("t", "")
                if title:
                    results.append(f"  Topic: {title}")
                files = lesson_item.get("r", [])
                if files:
                    results.append("  Resources:")
                    for f in files:
                        results.append(f"    • {f['filename']}")
                notes = lesson_item.get("n", "")
                if notes:
                    results.append(f"  Notes: {_strip_html(str(notes))[:300]}")
        else:
            results.append("  No lesson plan for this week yet.")

    return "\n".join(results)


    subjects = find_subject(subject_keyword)
    if not subjects:
        return f"No subjects found matching '{subject_keyword}'."
    results = []
    for s in subjects:
        data = payload("/seqta/student/load/courses", {
            "programme": str(s["programme"]),
            "metaclass":  str(s["metaclass"]),
        })
        results.append(f"=== {s['title']} ===")
        results.append(f"Course: {data.get('c', '?')}")
        files = data.get("cf", [])
        if files:
            results.append("Files:")
            for f in files:
                results.append(f"  • {f['filename']} ({int(f.get('size',0))//1024}KB)")
        weeks = data.get("d", [])
        results.append(f"Weeks of content: {len(weeks)}")
    return "\n".join(results)


@mcp.tool()
def get_messages(label: str = "inbox", limit: int = 20) -> str:
    """Get messages from inbox or outbox. label can be 'inbox' or 'outbox'. Default limit is 20."""
    data = payload("/seqta/student/load/message", {
        "action": "list", "label": label,
        "offset": 0, "limit": limit,
        "sortBy": "date", "sortOrder": "desc",
        "searchValue": "", "datetimeUntil": None,
    })
    messages = data.get("messages", []) if isinstance(data, dict) else []
    if not messages:
        return f"No messages in {label}."
    lines = []
    for m in messages:
        read = "" if m.get("read") else " [UNREAD]"
        lines.append(f"[{m['date'][:10]}]{read} From: {m['sender']} — {m['subject']} (id:{m['id']})")
    return "\n".join(lines)


@mcp.tool()
def get_message(message_id: int) -> str:
    """Read the full content of a specific message by its ID, including any embedded images."""
    raw = api("/seqta/student/load/message", {"action": "message", "id": message_id})
    msg = raw if isinstance(raw, dict) else {}
    if "payload" in msg and isinstance(msg["payload"], dict):
        msg = msg["payload"]

    sender   = msg.get("sender", "?")
    date     = msg.get("date", "?")
    subject  = msg.get("subject", "?")
    contents = msg.get("contents", "") or ""

    img_srcs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', contents, re.IGNORECASE)
    b64_images = [s for s in img_srcs if s.startswith("data:image")]

    contents = re.sub(r'<tr[^>]*>', '\n', contents, flags=re.IGNORECASE)
    contents = re.sub(r'<t[dh][^>]*>', '\t', contents, flags=re.IGNORECASE)
    contents = re.sub(r'</t[dh]>', '', contents, flags=re.IGNORECASE)
    contents = re.sub(r'<br\s*/?>', '\n', contents, flags=re.IGNORECASE)
    contents = re.sub(r'<p[^>]*>', '\n', contents, flags=re.IGNORECASE)
    contents = re.sub(r'<[^>]+>', '', contents)
    contents = contents.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    contents = re.sub(r'\t+', '\t', contents)
    contents = re.sub(r'\n{3,}', '\n\n', contents)
    contents = contents.strip()

    files  = msg.get("files", [])
    result = f"From: {sender}\nDate: {date}\nSubject: {subject}\n\n{contents}"

    if b64_images:
        result += "\n\n[This message contains embedded images with additional content:]\n"
        for i, img in enumerate(b64_images, 1):
            result += f"\nIMAGE_{i}: {img}\n"

    if files:
        result += "\n\nAttachments:\n" + "\n".join(f"  • {f['filename']}" for f in files)
    return result or "Message appears to be empty."


@mcp.tool()
def get_course_content(subject_keyword: str) -> str:
    """Get course overview, files and weekly lesson plan for a subject. Provide a keyword like 'english' or 'science'."""
    subjects = find_subject(subject_keyword)
    if not subjects:
        return f"No subjects found matching '{subject_keyword}'."
    results = []
    for s in subjects:
        data = payload("/seqta/student/load/courses", {
            "programme": str(s["programme"]),
            "metaclass":  str(s["metaclass"]),
        })
        results.append(f"=== {s['title']} ===")
        results.append(f"Course: {data.get('c', '?')}")
        files = data.get("cf", [])
        if files:
            results.append("Course files:")
            for f in files:
                results.append(f"  • {f['filename']}")
        # Show week-by-week topics from 'w' array
        d_weeks = data.get("d", [])
        w_weeks = data.get("w", [])
        results.append(f"\nLesson plan ({len(d_weeks)} weeks):")
        for i, week_d in enumerate(d_weeks):
            if i >= len(w_weeks):
                break
            week_content = w_weeks[i]
            items = week_content if isinstance(week_content, list) else [week_content]
            for item in items:
                title = item.get("t", "")
                if title:
                    results.append(f"  T{week_d.get('t')} W{week_d.get('w')}: {title}")
    return "\n".join(results)


@mcp.tool()
def get_lesson_for_subject(subject_keyword: str, date: str = "") -> str:
    """
    Get the specific lesson topic and resources for a subject on a given date.
    Use this when asked 'what am I doing in [subject] today/tomorrow/on [date]'.
    Provide a subject keyword (e.g. 'RE', 'maths', 'english') and optional date (YYYY-MM-DD).
    Defaults to today.
    """
    import datetime as dt
    target = date or dt.date.today().isoformat()

    subjects = find_subject(subject_keyword)
    if not subjects:
        return f"No subjects found matching '{subject_keyword}'."

    results = []
    for s in subjects:
        try:
            course = payload("/seqta/student/load/courses", {
                "programme": str(s["programme"]),
                "metaclass":  str(s["metaclass"]),
            })
        except Exception as e:
            results.append(f"{s['title']}: Could not load course — {e}")
            continue

        d_weeks = course.get("d", [])
        w_weeks = course.get("w", [])

        # Find the week containing the target date
        week_idx = None
        for i, week in enumerate(d_weeks):
            for lesson in week.get("l", []):
                if lesson.get("d") == target:
                    week_idx = i
                    break
            if week_idx is not None:
                break

        results.append(f"=== {s['title']} on {target} ===")

        if week_idx is None:
            # Check if there's a lesson near this date (within the week)
            results.append("No lesson scheduled on this date.")
            # Show the most recent week's content instead
            today = dt.date.today()
            closest_idx = None
            closest_diff = 9999
            for i, week in enumerate(d_weeks):
                for lesson in week.get("l", []):
                    try:
                        ld = dt.date.fromisoformat(lesson.get("d",""))
                        diff = abs((ld - today).days)
                        if diff < closest_diff:
                            closest_diff = diff
                            closest_idx = i
                    except:
                        pass
            if closest_idx is not None and closest_diff <= 7:
                week_idx = closest_idx
                results.append(f"(Showing nearest week's content instead):")
            else:
                continue

        week_d = d_weeks[week_idx]
        results.append(f"Term {week_d.get('t')}, Week {week_d.get('w')}")

        # Show lesson time for this date
        for lesson in week_d.get("l", []):
            if lesson.get("d") == target:
                results.append(f"Time: {lesson.get('s','?')[:5]} – {lesson.get('e','?')[:5]}")

        if week_idx < len(w_weeks):
            week_content = w_weeks[week_idx]
            items = week_content if isinstance(week_content, list) else [week_content]
            for item in items:
                title = item.get("t", "")
                if title:
                    results.append(f"Topic: {title}")
                notes = item.get("n", "")
                if notes:
                    results.append(f"Notes: {_strip_html(str(notes))[:400]}")
                files = item.get("r", [])
                if files:
                    results.append("Resources:")
                    for f in files:
                        results.append(f"  • {f['filename']}")
        else:
            results.append("No lesson plan content for this week.")

        results.append("")

    return "\n".join(results).strip() or "No lesson content found."


@mcp.tool()
def get_homework() -> str:
    """Get the homework summary from the dashboard."""
    data = payload("/seqta/student/dashlet/summary/homework")
    items = data if isinstance(data, list) else []
    if not items:
        return "No homework items found."
    lines = []
    for subject in items:
        lines.append(f"\n=== {subject['title']} ===")
        for item in subject.get("items", []):
            lines.append(_strip_html(item).strip())
    return "\n".join(lines)


@mcp.tool()
def get_reports() -> str:
    """Get the list of student report cards."""
    data = payload("/seqta/student/load/reports")
    reports = data if isinstance(data, list) else []
    if not reports:
        return "No reports found."
    return "\n".join(
        f"[{r.get('terms','?')} {r.get('year','?')}] {r.get('types','?')} — {r.get('created_date','?')[:10]}"
        for r in reports
    )


@mcp.tool()
def get_events(from_date: str = "", to_date: str = "") -> str:
    """Get calendar events for a date range. Defaults to the current week. Dates in YYYY-MM-DD."""
    data = payload("/seqta/student/events/load", {
        "dateFrom":   from_date or week_start(),
        "dateTo":     to_date   or week_end(),
        "person":     STUDENT_ID,
        "personType": "student",
    })
    events = data if isinstance(data, list) else []
    if not events:
        return "No events for this period."
    return "\n".join(f"[{e.get('date','?')}] {e.get('title','?')}" for e in events)


@mcp.tool()
def get_session_info() -> str:
    """Check the current session status and return student information."""
    data = payload("/seqta/student/login", {
        "mode": "normal", "query": None,
        "redirect_url": f"{BASE_URL}/"
    })
    if "personUUID" not in data:
        return "Session appears to be invalid or expired."
    meta = data.get("meta", {})
    import datetime
    next_refresh = int(REFRESH_INTERVAL - (time.time() - _last_refresh))
    return (
        f"Session active ✓\n"
        f"Person UUID: {data.get('personUUID')}\n"
        f"Student code: {meta.get('code','?')}\n"
        f"Next token refresh in: {next_refresh}s"
    )


# ── utility ───────────────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log(f"Starting SEQTA MCP server for {SEQTA_EMAIL}...")

    # Auth in background so the server starts instantly
    # (Claude Desktop times out if startup takes too long)
    def _startup():
        get_token()
        log(f"Token auto-refresh every {REFRESH_INTERVAL}s started.")
        while True:
            time.sleep(REFRESH_INTERVAL)
            try:
                get_token()
            except Exception as e:
                log(f"Background refresh failed: {e}")

    t = threading.Thread(target=_startup, daemon=True)
    t.start()

    mcp.run(transport="stdio")