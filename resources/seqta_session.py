#!/usr/bin/env python3
"""
seqta_session.py  -  Acquire a SEQTA session via Microsoft SSO and print identity as JSON.
Bundled with SchoolMod. Generalised from the user's fetch-session.py.

Usage:
    python seqta_session.py <base_url> <email> <password>
    python seqta_session.py <base_url> --cookie <JSESSIONID>   (validate existing cookie)

Prints ONE line of JSON to stdout:
    {"ok": true, "jsessionid": "...", "personUUID": "...", "id": 4284,
     "name": "Zayn de Lobel", "code": "33855", "base_url": "..."}
All diagnostics go to stderr.
"""

import sys, re, json, requests
from urllib.parse import urljoin

try:
    from bs4 import BeautifulSoup
except ImportError:
    print(json.dumps({"ok": False, "error": "Missing dependency. Run: pip install requests beautifulsoup4"}))
    sys.exit(0)

MS_BASE = "https://login.microsoftonline.com"


def err(msg):
    print(json.dumps({"ok": False, "error": str(msg)}))
    sys.exit(0)


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
            html, url = r.text, r.url; continue
        soup = BeautifulSoup(html, "html.parser")
        form = soup.find("form")
        if form:
            action = urljoin(url, form.get("action", url))
            fields = {i["name"]: i.get("value", "") for i in form.find_all("input") if i.get("name")}
            r = ms_post(session, action, fields, url)
            html, url = r.text, r.url; continue
        raise RuntimeError("Could not reach Microsoft login form.")
    raise RuntimeError("Too many hops to MS login form.")


def follow_to_saml(session, base_url, html, url):
    for _ in range(10):
        soup = BeautifulSoup(html, "html.parser")
        si = soup.find("input", {"name": "SAMLResponse"})
        if si:
            relay = soup.find("input", {"name": "RelayState"})
            form = soup.find("form")
            action = form["action"] if form else "/saml2"
            if not action.startswith("http"):
                action = f"{base_url}{action if action.startswith('/') else '/' + action}"
            return si["value"], (relay["value"] if relay else f"{base_url}/"), action
        cfg = extract_config(html)
        if cfg.get("oPostParams") and cfg.get("urlPost") and not cfg.get("sFT"):
            r = ms_post(session, cfg["urlPost"], cfg["oPostParams"], url)
            html, url = r.text, r.url; continue
        if cfg.get("sFT") and cfg.get("sCtx") and cfg.get("urlPost"):
            r = ms_post(session, cfg["urlPost"], {
                "LoginOptions": "1", "type": "28", "ctx": cfg["sCtx"], "hpgrequestid": "",
                "flowToken": cfg["sFT"], "canary": cfg.get("canary", ""), "i19": "2000",
            }, url)
            html, url = r.text, r.url; continue
        form = soup.find("form")
        if form:
            action = urljoin(url, form.get("action", url))
            fields = {i["name"]: i.get("value", "") for i in form.find_all("input") if i.get("name")}
            r = ms_post(session, action, fields, url)
            html, url = r.text, r.url; continue
        raise RuntimeError("Stuck in Microsoft redirect loop.")
    raise RuntimeError("Too many Microsoft redirect hops.")


def sso_login(base_url, email, password):
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36"})

    r = s.post(f"{base_url}/seqta/student/login",
        json={"mode": "normal", "query": None, "redirect_url": f"{base_url}/"},
        headers={"Content-type": "application/json; charset=UTF-8", "X-Requested-With": "XMLHttpRequest",
                 "Referer": f"{base_url}/", "Origin": base_url})
    r.raise_for_status()
    payload = r.json().get("payload", {})
    if payload.get("personUUID") and not payload.get("saml"):
        return s

    saml = payload.get("saml", [{}])[0]
    if not saml.get("url"):
        raise RuntimeError("This school does not use Microsoft SSO (no SAML). Use Direct login instead.")

    r = s.post(saml["url"], data={"SAMLRequest": saml["request"], "RelayState": saml["relaystate"],
        "SigAlg": saml["sigalg"], "Signature": saml["signature"]},
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Origin": base_url, "Referer": f"{base_url}/", "Sec-Fetch-Site": "cross-site",
            "Upgrade-Insecure-Requests": "1"}, allow_redirects=True)
    r.raise_for_status()

    html, cfg, cur = navigate_to_login_form(s, r.text, r.url)
    ft, ctx, canary = cfg["sFT"], cfg["sCtx"], cfg.get("canary", "")

    r = s.post(f"{MS_BASE}/common/GetCredentialType?mkt=en-GB", json={
        "username": email, "isOtherIdpSupported": True, "checkPhones": False, "isRemoteNGCSupported": True,
        "isCookieBannerShown": False, "isFidoSupported": True, "originalRequest": ctx, "country": "AU",
        "forceotclogin": False, "isExternalFederationDisallowed": False, "isRemoteConnectSupported": False,
        "federationFlags": 0, "isSignup": False, "flowToken": ft, "isAccessPassSupported": True,
        "isQrCodePinSupported": True}, headers={"Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json", "Origin": MS_BASE, "Referer": cur})
    r.raise_for_status()
    req_id = r.headers.get("x-ms-request-id", "")
    ft = r.json().get("FlowToken", ft)

    r = s.post(f"{MS_BASE}/{extract_tenant(saml['url'], cur)}/login", data={
        "i13": "0", "login": email, "loginfmt": email, "type": "11", "LoginOptions": "3", "passwd": password,
        "ps": "2", "canary": canary, "ctx": ctx, "hpgrequestid": req_id, "flowToken": ft, "NewUser": "1",
        "fspost": "0", "i21": "0", "CookieDisclosure": "0", "IsFidoSupported": "1", "isSignupPost": "0",
        "i19": "29195"}, headers={"Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Origin": MS_BASE, "Referer": cur,
        "Upgrade-Insecure-Requests": "1"}, allow_redirects=True)
    r.raise_for_status()
    if "AADSTS50126" in r.text or "AADSTS50034" in r.text:
        raise RuntimeError("Wrong email or password.")

    sr, rs, acs = follow_to_saml(s, base_url, r.text, r.url)
    s.post(acs, data={"SAMLResponse": sr, "RelayState": rs},
        headers={"Content-Type": "application/x-www-form-urlencoded", "Origin": MS_BASE,
            "Referer": MS_BASE + "/", "Sec-Fetch-Site": "cross-site"}, allow_redirects=False)

    r = s.post(f"{base_url}/seqta/student/login",
        json={"mode": "normal", "query": None, "redirect_url": f"{base_url}/"},
        headers={"Content-type": "application/json; charset=UTF-8", "X-Requested-With": "XMLHttpRequest",
                 "Referer": f"{base_url}/", "Origin": base_url})
    r.raise_for_status()
    if "personUUID" not in r.json().get("payload", {}):
        raise RuntimeError("Session confirmation failed.")
    return s


def extract_tenant(saml_url, cur_url):
    # The tenant GUID appears in the MS URLs during the flow.
    for u in (cur_url, saml_url):
        m = re.search(r'login\.microsoftonline\.com/([0-9a-f-]{36})', u or "")
        if m:
            return m.group(1)
    return "common"


def identity(session, base_url):
    jsid = {c.name: c.value for c in session.cookies}.get("JSESSIONID", "")
    r = session.post(f"{base_url}/seqta/student/login", json={"mode": "normal", "query": None,
        "redirect_url": f"{base_url}/"}, headers={"Content-type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest", "Referer": f"{base_url}/", "Origin": base_url})
    p = r.json().get("payload", {})
    return {
        "ok": True, "jsessionid": jsid, "personUUID": p.get("personUUID"),
        "id": p.get("id"), "name": p.get("userDesc") or "", "code": (p.get("meta") or {}).get("code"),
        "base_url": base_url,
    }


def main():
    if len(sys.argv) < 3:
        err("Usage: seqta_session.py <base_url> <email> <password>")
    base_url = sys.argv[1].rstrip("/")

    if sys.argv[2] == "--cookie":
        jsid = sys.argv[3]
        s = requests.Session()
        s.cookies.set("JSESSIONID", jsid, domain=base_url.replace("https://", "").replace("http://", ""))
        s.headers.update({"Content-Type": "application/json; charset=UTF-8", "X-Requested-With": "XMLHttpRequest",
                          "Origin": base_url, "Referer": f"{base_url}/"})
        info = identity(s, base_url)
        if not info.get("personUUID"):
            err("Cookie invalid or expired.")
        print(json.dumps(info)); return

    email, password = sys.argv[2], sys.argv[3]
    try:
        s = sso_login(base_url, email, password)
    except requests.RequestException as e:
        err(f"Network error: {e}")
    except Exception as e:
        err(e)
    info = identity(s, base_url)
    print(json.dumps(info))


if __name__ == "__main__":
    main()
