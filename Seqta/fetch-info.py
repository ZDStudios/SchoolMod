#!/usr/bin/env python3
"""
fetch-info.py  -  Fetch SEQTA data and save to JSON
CONFIGURE THESE THREE LINES THEN RUN:  python fetch-info.py <command>
"""

SEQTA_BASE_URL = "https://students.trinity.wa.edu.au"
SEQTA_EMAIL    = "your@email.com"
SEQTA_PASSWORD = "yourpassword"

# ─────────────────────────────────────────────────────────────────────────────

import sys, json, re, datetime, requests
from pathlib import Path
from urllib.parse import urljoin

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("[!] Run: pip install requests beautifulsoup4"); sys.exit(1)

BASE_URL   = SEQTA_BASE_URL
TENANT_ID  = "5f441b77-a931-4aaf-ad37-3273bf7fa459"
MS_BASE    = "https://login.microsoftonline.com"
STUDENT_ID = 4284
TOKEN_FILE = Path(__file__).parent / ".session"


# ── Auth (same flow as fetch-session.py) ─────────────────────────────────────

def extract_config(html):
    idx = html.find('$Config=')
    if idx == -1: return {}
    idx += len('$Config=')
    while idx < len(html) and html[idx] in ' \t\n\r': idx += 1
    if idx >= len(html) or html[idx] != '{': return {}
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
    if not url.startswith("http"): url = MS_BASE + url
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
            if "Kmsi" not in pid: return html, cfg, url
        if cfg.get("oPostParams") and cfg.get("urlPost"):
            r = ms_post(session, cfg["urlPost"], cfg["oPostParams"], url)
            html, url = r.text, r.url; continue
        soup = BeautifulSoup(html, "html.parser")
        form = soup.find("form")
        if form:
            action = urljoin(url, form.get("action", url))
            fields = {i["name"]: i.get("value","") for i in form.find_all("input") if i.get("name")}
            r = ms_post(session, action, fields, url)
            html, url = r.text, r.url; continue
        raise RuntimeError(f"Could not reach MS login form.\n{html[:300]}")
    raise RuntimeError("Too many hops.")

def follow_to_saml(session, html, url):
    for _ in range(10):
        soup = BeautifulSoup(html, "html.parser")
        si = soup.find("input", {"name": "SAMLResponse"})
        if si:
            relay = soup.find("input", {"name": "RelayState"})
            form  = soup.find("form")
            action = form["action"] if form else "/saml2"
            if not action.startswith("http"):
                action = f"{BASE_URL}{action if action.startswith('/') else '/' + action}"
            return si["value"], (relay["value"] if relay else f"{BASE_URL}/"), action
        cfg = extract_config(html)
        if cfg.get("oPostParams") and cfg.get("urlPost") and not cfg.get("sFT"):
            r = ms_post(session, cfg["urlPost"], cfg["oPostParams"], url)
            html, url = r.text, r.url; continue
        if cfg.get("sFT") and cfg.get("sCtx") and cfg.get("urlPost"):
            r = ms_post(session, cfg["urlPost"], {
                "LoginOptions": "1", "type": "28",
                "ctx": cfg["sCtx"], "hpgrequestid": "",
                "flowToken": cfg["sFT"], "canary": cfg.get("canary",""), "i19": "2000",
            }, url)
            html, url = r.text, r.url; continue
        form = soup.find("form")
        if form:
            action = urljoin(url, form.get("action", url))
            fields = {i["name"]: i.get("value","") for i in form.find_all("input") if i.get("name")}
            r = ms_post(session, action, fields, url)
            html, url = r.text, r.url; continue
        raise RuntimeError(f"Stuck.\n{html[:300]}")
    raise RuntimeError("Too many hops.")

def do_auth() -> str:
    """Full SSO flow → returns JSESSIONID."""
    print("[*] Authenticating...", flush=True)
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36"})

    r = s.post(f"{BASE_URL}/seqta/student/login",
        json={"mode": "normal", "query": None, "redirect_url": f"{BASE_URL}/"},
        headers={"Content-type": "application/json; charset=UTF-8",
                 "X-Requested-With": "XMLHttpRequest", "Referer": f"{BASE_URL}/", "Origin": BASE_URL})
    r.raise_for_status()
    pl = r.json().get("payload", {})
    if pl.get("personUUID") and not pl.get("saml"):
        return {c.name: c.value for c in s.cookies}.get("JSESSIONID", "")

    saml = pl.get("saml", [{}])[0]
    r = s.post(saml["url"], data={
        "SAMLRequest": saml["request"], "RelayState": saml["relaystate"],
        "SigAlg": saml["sigalg"], "Signature": saml["signature"],
    }, headers={"Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Origin": BASE_URL, "Referer": f"{BASE_URL}/",
        "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site", "Upgrade-Insecure-Requests": "1",
    }, allow_redirects=True)
    r.raise_for_status()

    html, cfg, cur = navigate_to_login_form(s, r.text, r.url)
    ft, ctx, canary = cfg["sFT"], cfg["sCtx"], cfg.get("canary","")

    r = s.post(f"{MS_BASE}/common/GetCredentialType?mkt=en-GB", json={
        "username": SEQTA_EMAIL, "isOtherIdpSupported": True, "checkPhones": False,
        "isRemoteNGCSupported": True, "isCookieBannerShown": False,
        "isFidoSupported": True, "originalRequest": ctx, "country": "AU",
        "forceotclogin": False, "isExternalFederationDisallowed": False,
        "isRemoteConnectSupported": False, "federationFlags": 0,
        "isSignup": False, "flowToken": ft,
        "isAccessPassSupported": True, "isQrCodePinSupported": True,
    }, headers={"Content-Type": "application/json; charset=UTF-8", "Accept": "application/json",
        "Origin": MS_BASE, "Referer": cur,
        "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin"})
    r.raise_for_status()
    req_id = r.headers.get("x-ms-request-id","")
    ft = r.json().get("FlowToken", ft)

    r = s.post(f"{MS_BASE}/{TENANT_ID}/login", data={
        "i13": "0", "login": SEQTA_EMAIL, "loginfmt": SEQTA_EMAIL,
        "type": "11", "LoginOptions": "3", "passwd": SEQTA_PASSWORD,
        "ps": "2", "canary": canary, "ctx": ctx, "hpgrequestid": req_id, "flowToken": ft,
        "NewUser": "1", "fspost": "0", "i21": "0",
        "CookieDisclosure": "0", "IsFidoSupported": "1", "isSignupPost": "0", "i19": "29195",
    }, headers={"Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Origin": MS_BASE, "Referer": cur,
        "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin", "Upgrade-Insecure-Requests": "1"}, allow_redirects=True)
    r.raise_for_status()
    if "AADSTS50126" in r.text: raise RuntimeError("Wrong email or password.")

    sr, rs, acs = follow_to_saml(s, r.text, r.url)
    r = s.post(acs, data={"SAMLResponse": sr, "RelayState": rs},
        headers={"Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Origin": MS_BASE, "Referer": MS_BASE+"/",
            "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "cross-site"}, allow_redirects=False)

    r = s.post(f"{BASE_URL}/seqta/student/login",
        json={"mode": "normal", "query": None, "redirect_url": f"{BASE_URL}/"},
        headers={"Content-type": "application/json; charset=UTF-8",
                 "X-Requested-With": "XMLHttpRequest", "Referer": f"{BASE_URL}/", "Origin": BASE_URL})
    r.raise_for_status()
    if "personUUID" not in r.json().get("payload",{}): raise RuntimeError("Session confirmation failed.")

    jsid = {c.name: c.value for c in s.cookies}.get("JSESSIONID","")
    print(f"[*] Auth OK — JSESSIONID obtained.", flush=True)
    TOKEN_FILE.write_text(jsid)
    return jsid

def get_token() -> str:
    """Get token: fresh auth, or fall back to cached .session file."""
    try:
        return do_auth()
    except Exception as e:
        print(f"[!] Auth failed: {e}", flush=True)
        if TOKEN_FILE.exists():
            print("[*] Using cached token.", flush=True)
            return TOKEN_FILE.read_text().strip()
        raise


def make_session() -> requests.Session:
    jsid = get_token()
    s = requests.Session()
    s.cookies.set("JSESSIONID", jsid, domain=BASE_URL.replace("https://",""))
    s.headers.update({
        "Content-Type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE_URL, "Referer": f"{BASE_URL}/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36",
    })
    return s


# ── API helpers ───────────────────────────────────────────────────────────────

_http = None  # reuse session within a run

def session():
    global _http
    if _http is None:
        _http = make_session()
    return _http

def api(endpoint, body=None, method="POST"):
    url = f"{BASE_URL}{endpoint}"
    r = session().get(url) if method=="GET" else session().post(url, json=body or {})
    r.raise_for_status()
    return r.json()

def pl(endpoint, body=None):
    return api(endpoint, body).get("payload", {})

def save(name, data):
    out = Path(__file__).parent / f"{name}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[+] Saved → {out}")

def today():    return datetime.date.today().isoformat()
def wstart():
    d = datetime.date.today()
    return (d - datetime.timedelta(days=d.weekday())).isoformat()
def wend():
    d = datetime.date.today()
    return (d - datetime.timedelta(days=d.weekday()) + datetime.timedelta(days=6)).isoformat()


# ── Fetch functions ───────────────────────────────────────────────────────────

def get_subjects():
    data = pl("/seqta/student/load/subjects")
    subjects = []
    for period in (data if isinstance(data, list) else []):
        for s in period.get("subjects", []):
            subjects.append(s)
    return subjects

def fetch_timetable(f=None, u=None):
    return api("/seqta/student/load/timetable", {"from": f or wstart(), "until": u or wend(), "student": STUDENT_ID})
def fetch_events(f=None, t=None):
    return api("/seqta/student/events/load", {"dateFrom": f or wstart(), "dateTo": t or wend(), "person": STUDENT_ID, "personType": "student"})
def fetch_notices(d=None):  return api("/seqta/student/load/notices", {"date": d or today()})
def fetch_notice_labels():  return api("/seqta/student/load/notices", {"mode": "labels"})
def fetch_reports():        return api("/seqta/student/load/reports")
def fetch_documents():      return api("/seqta/student/load/documents")
def fetch_homework():       return api("/seqta/student/dashlet/summary/homework")
def fetch_dashboard():      return api("/seqta/student/dashboard")
def fetch_messages():       return api("/seqta/student/load/message", {"action": "labels"})
def fetch_messages_list():
    return api("/seqta/student/load/message", {"action": "list", "label": "inbox",
               "offset": 0, "limit": 100, "sortBy": "date", "sortOrder": "desc",
               "searchValue": "", "datetimeUntil": None})
def fetch_prefs():
    return api("/seqta/student/load/prefs", {"request": "userPrefs", "asArray": True, "user": STUDENT_ID})
def fetch_assessments_upcoming(subjects):
    results = {}
    for s in subjects:
        data = api("/seqta/student/assessment/list/upcoming",
                   {"student": STUDENT_ID, "metaclass": s["metaclass"], "programme": s["programme"]})
        results[s["code"]] = {"subject": s["title"], "data": data.get("payload", [])}
    return results
def fetch_assessments_past(subjects):
    results = {}
    for s in subjects:
        data = api("/seqta/student/assessment/list/past",
                   {"programme": s["programme"], "metaclass": s["metaclass"], "student": STUDENT_ID})
        results[s["code"]] = {"subject": s["title"], "data": data.get("payload", {})}
    return results
def fetch_course(mc, prog):
    return api("/seqta/student/load/courses", {"programme": str(prog), "metaclass": str(mc)})
def fetch_all_courses(subjects):
    results = {}
    for s in subjects:
        print(f"  Fetching course: {s['title']}...", flush=True)
        data = fetch_course(s["metaclass"], s["programme"])
        results[s["code"]] = {"subject": s["title"], "data": data.get("payload", {})}
    return results


# ── CLI ───────────────────────────────────────────────────────────────────────

COMMANDS = {
    "timetable":            "Timetable for current week  [from_date until_date]",
    "events":               "Calendar events for current week  [from_date to_date]",
    "notices":              "Daily notices  [date]",
    "notice-labels":        "Notice label categories",
    "subjects":             "All enrolled subjects",
    "assessments-upcoming": "Upcoming assessments for all subjects",
    "assessments-past":     "Past assessments + marks for all subjects",
    "course <mc> <prog>":   "Course content by metaclass+programme ID",
    "courses-all":          "Course content for every subject",
    "course-<keyword>":     "Course content by subject name (e.g. course-english)",
    "messages":             "Inbox/outbox counts",
    "messages-list":        "Full inbox",
    "reports":              "Report cards",
    "documents":            "School documents",
    "homework":             "Homework summary",
    "dashboard":            "Dashboard layout",
    "prefs":                "User preferences",
    "all":                  "Fetch everything",
}

def usage():
    print(f"Usage: python {sys.argv[0]} <command> [args]\n\nCommands:")
    for k,v in COMMANDS.items():
        print(f"  {k:<30} {v}")
    print("\nEdit SEQTA_EMAIL and SEQTA_PASSWORD at the top of this file.")
    sys.exit(0)

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h","--help","help"):
        usage()

    cmd  = sys.argv[1].lower()
    args = sys.argv[2:]

    if cmd == "timetable":
        save("timetable", fetch_timetable(*args[:2]))
    elif cmd == "events":
        save("events", fetch_events(*args[:2]))
    elif cmd == "notices":
        save("notices", fetch_notices(args[0] if args else None))
    elif cmd == "notice-labels":
        save("notice-labels", fetch_notice_labels())
    elif cmd == "subjects":
        save("subjects", {"subjects": get_subjects()})
    elif cmd == "assessments-upcoming":
        print("[*] Fetching subjects...", flush=True)
        save("assessments-upcoming", fetch_assessments_upcoming(get_subjects()))
    elif cmd == "assessments-past":
        print("[*] Fetching subjects...", flush=True)
        save("assessments-past", fetch_assessments_past(get_subjects()))
    elif cmd == "course":
        if len(args) < 2: print("[!] Usage: course <metaclass> <programme>"); sys.exit(1)
        save(f"course-{args[0]}", fetch_course(args[0], args[1]))
    elif cmd == "courses-all":
        print("[*] Fetching subjects...", flush=True)
        save("courses-all", fetch_all_courses(get_subjects()))
    elif cmd.startswith("course-"):
        kw = cmd[7:]
        subjects = get_subjects()
        matched = [s for s in subjects if kw in s["title"].lower() or kw in s["code"].lower() or kw in s["description"].lower()]
        if not matched:
            print(f"[!] No subject matching '{kw}'. Available:")
            for s in subjects: print(f"  {s['code']} — {s['title']}")
            sys.exit(1)
        results = {}
        for s in matched:
            print(f"  Fetching: {s['title']}...", flush=True)
            data = fetch_course(s["metaclass"], s["programme"])
            results[s["code"]] = {"subject": s["title"], "data": data.get("payload",{})}
        save(f"course-{kw}", results)
    elif cmd == "messages":
        save("messages", fetch_messages())
    elif cmd == "messages-list":
        save("messages-list", fetch_messages_list())
    elif cmd == "reports":
        save("reports", fetch_reports())
    elif cmd == "documents":
        save("documents", fetch_documents())
    elif cmd == "homework":
        save("homework", fetch_homework())
    elif cmd == "dashboard":
        save("dashboard", fetch_dashboard())
    elif cmd == "prefs":
        save("prefs", fetch_prefs())
    elif cmd == "all":
        print("[*] Fetching everything...", flush=True)
        subjects = get_subjects()
        save("subjects",      {"subjects": subjects})
        save("timetable",     fetch_timetable())
        save("events",        fetch_events())
        save("notices",       fetch_notices())
        save("notice-labels", fetch_notice_labels())
        save("reports",       fetch_reports())
        save("documents",     fetch_documents())
        save("homework",      fetch_homework())
        save("dashboard",     fetch_dashboard())
        save("messages",      fetch_messages())
        save("messages-list", fetch_messages_list())
        save("prefs",         fetch_prefs())
        print("[*] Fetching assessments...", flush=True)
        save("assessments-upcoming", fetch_assessments_upcoming(subjects))
        save("assessments-past",     fetch_assessments_past(subjects))
        print("[*] Fetching all courses...", flush=True)
        save("courses-all", fetch_all_courses(subjects))
        print("[+] Done!")
    else:
        # Try as a course keyword
        kw = cmd
        subjects = get_subjects()
        matched = [s for s in subjects if kw in s["title"].lower() or kw in s["code"].lower() or kw in s.get("description","").lower()]
        if matched:
            results = {}
            for s in matched:
                print(f"  Fetching: {s['title']}...", flush=True)
                data = fetch_course(s["metaclass"], s["programme"])
                results[s["code"]] = {"subject": s["title"], "data": data.get("payload",{})}
            save(f"course-{kw}", results)
        else:
            print(f"[!] Unknown command '{cmd}'")
            usage()


if __name__ == "__main__":
    import traceback
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        print(f"[!] Error: {e}", flush=True)
        traceback.print_exc()