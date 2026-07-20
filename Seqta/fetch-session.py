#!/usr/bin/env python3
"""
fetch-session.py  -  Get your SEQTA JSESSIONID via Microsoft SSO
Usage:  python fetch-session.py <email> <password>

Outputs JSON with JSESSIONID and other session info.
Use the JSESSIONID cookie for all subsequent SEQTA API calls.
"""

import sys

try:
    import re, json, requests
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin
except ImportError as e:
    print(f"[!] Missing dependency: {e}")
    print("[!] Run:  pip install requests beautifulsoup4")
    sys.exit(1)

BASE_URL  = "https://students.trinity.wa.edu.au"
TENANT_ID = "5f441b77-a931-4aaf-ad37-3273bf7fa459"
MS_BASE   = "https://login.microsoftonline.com"


def log(msg):   pass
def abort(msg): print(f"[!] {msg}", flush=True); sys.exit(1)


def extract_config(html):
    """Extract $Config={...} from MS login pages using a balanced-brace parser."""
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
    """POST to a Microsoft login page with correct navigation headers."""
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
    """Follow MS intermediate pages until we reach the username/password form (has sFT+sCtx)."""
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
        abort(f"Could not reach MS login form.\nSnippet: {html[:400]}")
    abort("Too many hops to MS login form.")


def follow_to_saml(session, html, url):
    """Follow post-auth MS pages until we find a SAMLResponse form."""
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

        # BssoInterrupt: oPostParams present but no sFT
        if cfg.get("oPostParams") and cfg.get("urlPost") and not cfg.get("sFT"):
            r = ms_post(session, cfg["urlPost"], cfg["oPostParams"], url)
            html, url = r.text, r.url
            continue

        # KMSI / post-auth page: has sFT + sCtx + urlPost
        if cfg.get("sFT") and cfg.get("sCtx") and cfg.get("urlPost"):
            r = ms_post(session, cfg["urlPost"], {
                "LoginOptions": "1", "type": "28",
                "ctx": cfg["sCtx"], "hpgrequestid": "",
                "flowToken": cfg["sFT"], "canary": cfg.get("canary", ""),
                "i19": "2000",
            }, url)
            html, url = r.text, r.url
            continue

        # Plain form fallback
        form = soup.find("form")
        if form:
            action = urljoin(url, form.get("action", url))
            fields = {i["name"]: i.get("value","") for i in form.find_all("input") if i.get("name")}
            r = ms_post(session, action, fields, url)
            html, url = r.text, r.url
            continue

        abort(f"Stuck in MS redirect loop.\nSnippet: {html[:400]}")
    abort("Too many MS redirect hops.")


def fetch_session(email, password):
    s = requests.Session()
    s.headers.update({"User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
    )})

    # 1. Get SAMLRequest from SEQTA
    log("Authenticating with SEQTA...")
    r = s.post(f"{BASE_URL}/seqta/student/login",
        json={"mode": "normal", "query": None, "redirect_url": f"{BASE_URL}/"},
        headers={"Content-type": "application/json; charset=UTF-8",
                 "X-Requested-With": "XMLHttpRequest",
                 "Referer": f"{BASE_URL}/", "Origin": BASE_URL})
    r.raise_for_status()
    payload = r.json().get("payload", {})

    if payload.get("personUUID") and not payload.get("saml"):
        log("Already authenticated.")
        return _build_result(s, payload)

    saml = payload.get("saml", [{}])[0]
    if not saml.get("url"):
        abort(f"No SAML providers returned: {payload}")

    # 2. POST SAMLRequest to Microsoft → navigate to login form
    log("Contacting Microsoft SSO...")
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

    # 3. GetCredentialType
    r = s.post(f"{MS_BASE}/common/GetCredentialType?mkt=en-GB", json={
        "username": email, "isOtherIdpSupported": True, "checkPhones": False,
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

    # 4. Submit credentials
    log("Submitting credentials...")
    r = s.post(f"{MS_BASE}/{TENANT_ID}/login", data={
        "i13": "0", "login": email, "loginfmt": email,
        "type": "11", "LoginOptions": "3", "passwd": password,
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
        abort("Wrong email or password.")
    if "sErrorCode" in r.text:
        m = re.search(r'"sErrorCode"\s*:\s*"([^"]+)"', r.text)
        abort(f"Microsoft error: {m.group(1) if m else 'unknown'}")

    # 5. Follow all remaining MS pages to get SAMLResponse
    log("Completing SSO flow...")
    saml_resp, relay_state, acs_url = follow_to_saml(s, r.text, r.url)

    # 6. POST SAMLResponse to SEQTA (don't follow redirects — cookie is set on the 302)
    r = s.post(acs_url, data={"SAMLResponse": saml_resp, "RelayState": relay_state},
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Origin": MS_BASE, "Referer": MS_BASE + "/",
            "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "cross-site",
        }, allow_redirects=False)

    # 7. Confirm session
    r = s.post(f"{BASE_URL}/seqta/student/login",
        json={"mode": "normal", "query": None, "redirect_url": f"{BASE_URL}/"},
        headers={"Content-type": "application/json; charset=UTF-8",
                 "X-Requested-With": "XMLHttpRequest",
                 "Referer": f"{BASE_URL}/", "Origin": BASE_URL})
    r.raise_for_status()
    payload = r.json().get("payload", {})

    if "personUUID" not in payload:
        abort(f"Session confirmation failed: {json.dumps(payload)}")

    return _build_result(s, payload)


def _build_result(session, payload):
    cookies    = {c.name: c.value for c in session.cookies}
    jsessionid = cookies.get("JSESSIONID", "")
    if not jsessionid:
        log(f"Warning: JSESSIONID not found. Cookies: {list(cookies.keys())}")
    return {
        "JSESSIONID":   jsessionid,
        "person_uuid":  payload.get("personUUID"),
        "student_code": payload.get("meta", {}).get("code"),
        "base_url":     BASE_URL,
        "cookies":      cookies,
    }


def main():
    if len(sys.argv) < 3:
        print(f"Usage: python {sys.argv[0]} <email> <password>")
        sys.exit(1)
    try:
        result = fetch_session(sys.argv[1], sys.argv[2])
    except requests.RequestException as e:
        abort(f"Network error: {e}")

    print(result['JSESSIONID'])


if __name__ == "__main__":
    main()