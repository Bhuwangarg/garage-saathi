"""ITS PNR lookup for the review trace (step 3 of the rating-trace plan).

A redBus review carries a PNR. ITS's PNR page (Branch/Company_PNRDetails.aspx) turns a PNR into
the trip: route and time ids, journey date and start time, and the DRIVER'S CONTACT NUMBER the
office entered for that trip. The phone is an exact identifier, so it is matched to the crew bank
by number, never by name.

It signs in as a dedicated ITS user kept for these lookups only (ITS_LOOKUP_USER /
ITS_LOOKUP_PASSWORD, set in Vercel by the owner). It must never be the office's everyday login:
on 16 Oct 2026 submitting this page from the company-level browser session signed that session out.

Standard library only (Garage Saathi's server has no httpx). The page parsing follows the
Passenger Issue Desk's tested client (passenger-issues/app/its.py), which reads the same page.

Nothing here stores or logs a passenger's details: lookup() returns trip fields and the driver's
number, and the caller keeps only the matched crew id and a masked number.
"""
import http.cookiejar
import os
import re
import urllib.parse
import urllib.request
from html import unescape
from html.parser import HTMLParser

BASE_URL = os.environ.get("ITS_BASE_URL", "https://www.itspl.net").rstrip("/")
TIMEOUT = 30
LOGIN_PATH = "/Login.aspx"
PNR_PATH = "/Branch/Company_PNRDetails.aspx"
PREFIX = "ctl00_ContentPlaceHolder1_"


class ItsError(Exception):
    pass


class ItsAuthError(ItsError):
    pass


def credentials():
    return (os.environ.get("ITS_LOOKUP_USER", "").strip(), os.environ.get("ITS_LOOKUP_PASSWORD", ""))


def branch_code():
    return os.environ.get("ITS_BRANCH_CODE", "").strip()


def configured():
    u, p = credentials()
    return bool(u and p)


def clean(text):
    return re.sub(r"\s+", " ", unescape(text or "").replace("‎", "")).strip()


class _FormState(HTMLParser):
    """ASP.NET hidden fields and every named control on a page."""

    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.fields, self.buttons = {}, []

    def handle_starttag(self, tag, attrs):
        if tag not in ("input", "select", "textarea"):
            return
        a = dict(attrs)
        name, kind = a.get("name"), (a.get("type") or "text").lower()
        if not name:
            return
        if kind in ("submit", "image", "button"):
            self.buttons.append((name, kind, a.get("id") or ""))
        elif kind in ("checkbox", "radio"):
            if a.get("checked") is not None:
                self.fields[name] = a.get("value", "on")
        else:
            self.fields[name] = a.get("value", "")


def form_state(html):
    p = _FormState()
    p.feed(html or "")
    return p


def form_inputs(html, prefix=PREFIX):
    """Every <input> value, keyed by id without the ASP.NET prefix."""
    out = {}

    class _P(HTMLParser):
        def handle_starttag(self, tag, attrs):
            if tag != "input":
                return
            a = dict(attrs)
            i = a.get("id") or ""
            if i.startswith(prefix):
                out[i[len(prefix):]] = clean(a.get("value", ""))

    _P(convert_charrefs=True).feed(re.sub(r"&#x200[eE];", "", html or ""))
    return out


def looks_logged_out(html):
    low = (html or "").lower()
    return 'id="txtpassword"' in low or "login.aspx" in low[:2000]


def phone10(s):
    d = re.sub(r"\D", "", s or "")
    return d[-10:] if len(d) >= 10 else ""


def trip_from(values):
    """The fields the trace needs, from a parsed PNR page. Empty dict = PNR not found."""
    if not clean(values.get("txtPassengerName", "")) and not clean(values.get("txt_RouteID", "")):
        return {}
    return {
        "routeId": values.get("txt_RouteID", ""), "timeId": values.get("txt_TimeID", ""),
        "journeyDate": values.get("txtJourneyDate", ""), "startTime": values.get("txtJourneyStartTime", ""),
        "cityTime": values.get("txtJourneyCityTime", ""), "routeName": values.get("txtRouteName", "")[:120],
        "fromCity": values.get("txtFromCity", "")[:80], "toCity": values.get("txtToCity", "")[:80],
        "ticketStatus": values.get("txtTicketStatus", "")[:40], "driverPhone": phone10(values.get("txtDriverContact", "")),
    }


class Session:
    """One signed-in ITS session for a batch of lookups."""

    def __init__(self, opener=None):
        self.user, self.password = credentials()
        if not (self.user and self.password):
            raise ItsAuthError("ITS lookups are off: ITS_LOOKUP_USER / ITS_LOOKUP_PASSWORD are not set")
        self.jar = http.cookiejar.CookieJar()
        self.open = opener or urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar)).open
        self.authed = False

    def _req(self, path, data=None):
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        req = urllib.request.Request(BASE_URL + path, data=body, headers={
            "User-Agent": "GarageSaathiReviewTrace/1.0",
            **({"Content-Type": "application/x-www-form-urlencoded"} if body else {})})
        with self.open(req, timeout=TIMEOUT) as r:
            html = r.read().decode("utf-8", "replace")
            if getattr(self, "diag", None) is not None:
                # Where each step landed: path and query KEYS only, never values.
                u = urllib.parse.urlsplit(getattr(r, "geturl", lambda: "")() or "")
                keys = sorted(urllib.parse.parse_qs(u.query).keys())
                self.diag.append(dict(shape_of_answer(html), step=("POST " if body else "GET ") + path,
                                      landed=u.path + ("?" + "&".join(keys) if keys else "")))
            return html

    def login(self):
        """ITS's login (seen 16 Oct 2026): a Company/Branch radio named "Login" (rbtCompany /
        rbtBranch), txtCompanyCode labelled "Branch Code:", txtUserName, txtPassword, btnSubmit.
        The page always carries an OTP box (txtOTP) too, so its mere presence proves nothing."""
        state = form_state(self._req(LOGIN_PATH))
        names = list(state.fields)
        pick = lambda exact, rx: exact if exact in state.fields else next(
            (n for n in names if re.search(rx, n, re.I) and n not in ("Login",) and not n.startswith("__")
             and "state" not in n.lower()), None)
        uf = pick("txtUserName", r"user\s*name|username|uid")
        pf = pick("txtPassword", r"pass")
        cf = pick("txtCompanyCode", r"(company|branch)\s*code")
        if not uf or not pf:
            raise ItsAuthError("could not find the username/password fields on ITS's login page")
        payload = {k: v for k, v in state.fields.items() if k not in ("txtOTP", "txtAuthenticateRemarks")}
        payload[uf], payload[pf] = self.user, self.password
        if cf:
            if not branch_code():
                raise ItsAuthError("ITS's login wants a branch code: set ITS_BRANCH_CODE in Vercel")
            payload[cf] = branch_code()
        if "Login" in payload:
            # The lookup user is a branch user: ITS's PNR page lives under /Branch/.
            payload["Login"] = os.environ.get("ITS_LOGIN_AS", "rbtBranch")
        btn = "btnSubmit" if any(n == "btnSubmit" for n, _k, _i in state.buttons) else next(
            (n for n, kind, _ in state.buttons if kind == "submit"), None)
        if btn:
            payload[btn] = "Login"
        body = self._req(LOGIN_PATH, payload)
        if not looks_logged_out(body):
            self.authed = True
            return
        msg = re.search(r'id="[^"]*(lblMessage|lblMsg|lblError)[^"]*"[^>]*>(.*?)<', body, re.S)
        if msg and clean(msg.group(2)):
            raise ItsAuthError("ITS refused the lookup login: " + clean(msg.group(2))[:120])
        # Only a message that an OTP was actually SENT means an OTP step; the empty OTP box is always there.
        if re.search(r"otp\s*(has\s*been\s*|is\s*)?sent|sent\s.{0,40}otp|otp\s*send\s*successfully", body, re.I):
            raise ItsAuthError("ITS sent the lookup user an OTP; it must be switched off for this user")
        alerts = [clean(a) for a in re.findall(r"alert\(['\"](.*?)['\"]\)", body)][:2]
        raise ItsAuthError("the lookup login did not take" + (": " + "; ".join(alerts)[:120] if alerts else
                           " (check the branch code, user name and password in Vercel)"))

    def lookup(self, pnr):
        """PNR -> trip dict ({} when ITS has no such PNR). Signs in again once if the session lapsed."""
        if not re.fullmatch(r"\d{5,15}", str(pnr or "")):
            return {}
        for attempt in (1, 2):
            if not self.authed:
                self.login()
            page = self._req(PNR_PATH)
            if looks_logged_out(page):
                self.authed = False
                continue
            state = form_state(page)
            payload = dict(state.fields)
            for n in list(payload):
                if n.endswith("txtPNRNO"):
                    payload[n] = str(pnr)
            btn = next((n for n, _k, ident in state.buttons if ident.endswith("btnLoad")), None)
            if btn:
                payload[btn] = "Load"
            res = self._req(PNR_PATH, payload)
            if looks_logged_out(res):
                self.authed = False
                continue
            return trip_from(form_inputs(res))
        raise ItsAuthError("ITS keeps signing the lookup user out")


def shape_of_answer(html):
    """What ITS's answer looks like, with no values: for finding out why a PNR reads as "not found"
    without ever seeing a passenger's details."""
    vals = form_inputs(html)
    title = re.search(r"<title>(.*?)</title>", html or "", re.S | re.I)
    msgs = [clean(m.group(2))[:120] for m in re.finditer(r'id="[^"]*(lbl\w*)"[^>]*>(.*?)<', html or "", re.S)
            if clean(m.group(2)) and not re.search(r"\d{6,}", clean(m.group(2)))]
    alerts = [clean(a)[:120] for a in re.findall(r"alert\(['\"](.*?)['\"]\)", html or "") if not re.search(r"\d{6,}", a)]
    btns = sorted({n for n, _k, _i in form_state(html).buttons})[:12]
    return {"title": clean(title.group(1))[:80] if title else "", "bytes": len(html or ""), "buttons": btns,
            "filled": sorted(k for k, v in vals.items() if v), "empty": sorted(k for k, v in vals.items() if not v)[:40],
            "messages": msgs[:8], "alerts": alerts[:4],
            "pnrEchoed": bool(vals.get("txtPNRNO")), "hasPnrBox": "txtPNRNO" in vals}
