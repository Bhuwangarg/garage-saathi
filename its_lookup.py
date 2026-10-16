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
            return r.read().decode("utf-8", "replace")

    def login(self):
        state = form_state(self._req(LOGIN_PATH))
        uf = next((n for n in state.fields if re.search(r"user(name)?|login|uid", n, re.I)
                   and not n.startswith("__") and "hidden" not in n.lower()), None)
        pf = next((n for n in state.fields if re.search(r"pass", n, re.I)), None)
        if not uf or not pf:
            raise ItsAuthError("could not find the username/password fields on ITS's login page")
        payload = dict(state.fields)
        payload[uf], payload[pf] = self.user, self.password
        btn = next((n for n, kind, _ in state.buttons if kind == "submit"), None)
        if btn:
            payload[btn] = "Login"
        body = self._req(LOGIN_PATH, payload)
        msg = re.search(r'id="[^"]*lblMessage"[^>]*>(.*?)<', body, re.S)
        if msg and clean(msg.group(1)):
            raise ItsAuthError("ITS refused the lookup login: " + clean(msg.group(1))[:120])
        if re.search(r"otp|one\s*time\s*password", body, re.I) and looks_logged_out(body):
            raise ItsAuthError("ITS asks the lookup user for an OTP; someone must clear it once in a browser")
        if looks_logged_out(body):
            raise ItsAuthError("the lookup login did not take, and ITS gave no reason")
        self.authed = True

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
