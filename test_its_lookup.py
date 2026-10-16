"""ITS PNR fallback: the lookup client against a fake ITS, and what the server keeps.

Everything here is synthetic: no real passenger, phone or PNR.
Run: python3 test_its_lookup.py
"""
import http.server
import json
import os
import tempfile
import threading
import urllib.parse

_tmp = tempfile.mkdtemp(prefix="gs-its-")
os.environ["DB_PATH"] = os.path.join(_tmp, "test.db")
os.environ.pop("TURSO_URL", None)
os.environ.pop("TURSO_DATABASE_URL", None)
os.environ["ITS_LOOKUP_USER"] = "lookup-test"
os.environ["ITS_LOOKUP_PASSWORD"] = "not-a-real-password"
os.environ["ITS_BRANCH_CODE"] = "MLX"

import its_lookup as L  # noqa: E402
import sync_server as S  # noqa: E402

fails = []


def check(name, cond):
    print(("  ok  " if cond else " FAIL ") + name)
    if not cond:
        fails.append(name)


P = "ctl00_ContentPlaceHolder1_"
# The shape of ITS's real Login.aspx (16 Oct 2026): Company/Branch radios named "Login", a branch
# code, user, password, and an OTP box that is ALWAYS on the page.
LOGIN = """<html><form action="Login.aspx"><input type="hidden" name="__VIEWSTATE" value="vs1">
<input id="rbtCompany" type="radio" name="Login" value="rbtCompany" checked="checked" />
<input id="rbtBranch" type="radio" name="Login" value="rbtBranch" checked="checked" />
<label for="user_name">Branch Code:</label><input name="txtCompanyCode" id="txtCompanyCode">
<input type="hidden" name="VCECC_ClientState" value="">
<input name="txtUserName" id="txtUserName"><input type="password" name="txtPassword" id="txtPassword">
<input type="submit" name="btnSubmit" value="Login"><input type="submit" name="btnPopUpOpen" value="x">
<input name="txtOTP" placeholder="Enter OTP"><input type="submit" name="btnSubmitOTP" value="Verify OTP">
</form></html>"""
PNR_FORM = f"""<html><form><input type="hidden" name="__VIEWSTATE" value="vs2">
<input name="ctl00$ContentPlaceHolder1$txtPNRNO" id="{P}txtPNRNO">
<input type="submit" name="ctl00$ContentPlaceHolder1$btnLoad" id="{P}btnLoad" value="Load"></form></html>"""


def pnr_page(found):
    vals = {"txtPNRNO": "252074004", "txtPassengerName": "Test Passenger", "txtPhone": "9000000001",
            "txtEmail": "p@example.com", "txt_RouteID": "4521", "txt_TimeID": "88",
            "txtJourneyDate": "15-10-2026", "txtJourneyStartTime": "09:30 PM", "txtJourneyCityTime": "11:40 PM",
            "txtRouteName": "Jaipur-Meerut", "txtFromCity": "Jaipur", "txtToCity": "Meerut",
            "txtTicketStatus": "Confirm", "txtDriverContact": "+91 98290&#x200E;11111"} if found else {"txtPNRNO": "1"}
    return "<html>" + "".join(f'<input id="{P}{k}" value="{v}">' for k, v in vals.items()) + "</html>"


class FakeIts:
    def __init__(self):
        self.posts, self.logged, outer = [], False, self

        class H(http.server.BaseHTTPRequestHandler):
            def _send(self, html, cookie=None):
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                if cookie:
                    self.send_header("Set-Cookie", cookie)
                self.end_headers()
                self.wfile.write(html.encode())

            def do_GET(self):
                if self.path.startswith("/Login.aspx"):
                    return self._send(LOGIN)
                if "sid=ok" not in (self.headers.get("Cookie") or ""):
                    return self._send(LOGIN)              # signed out -> ITS shows its login page
                return self._send(PNR_FORM)

            def do_POST(self):
                body = urllib.parse.parse_qs(self.rfile.read(int(self.headers.get("Content-Length", 0))).decode())
                outer.posts.append((self.path, body))
                if self.path.startswith("/Login.aspx"):
                    outer.last_login = body
                    if body.get("txtPassword") == ["not-a-real-password"] and body.get("txtCompanyCode") == ["MLX"] \
                            and body.get("Login") == ["rbtBranch"] and body.get("txtUserName") == ["lookup-test"]:
                        return self._send("<html>welcome</html>", "sid=ok; Path=/")
                    return self._send(LOGIN.replace("</form>", '<span id="lblMessage">Invalid password</span></form>'))
                pnr = (body.get(f"ctl00$ContentPlaceHolder1$txtPNRNO") or [""])[0]
                return self._send(pnr_page(pnr == "252074004"))

            def log_message(self, *a):
                pass
        self.srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        L.BASE_URL = "http://127.0.0.1:%d" % self.srv.server_address[1]


its = FakeIts()

# --- the client -----------------------------------------------------------
s = L.Session()
trip = s.lookup("252074004")
check("signs in and reads a PNR", trip.get("routeId") == "4521" and trip.get("journeyDate") == "15-10-2026")
check("driver's number read as 10 digits (LRM and +91 removed)", trip.get("driverPhone") == "9829011111")
check("no passenger details in what it returns", not any(k in json.dumps(trip) for k in ("Test Passenger", "9000000001", "p@example.com")))
check("the PNR form was submitted with the PNR and Load", any(p == L.PNR_PATH and b.get("ctl00$ContentPlaceHolder1$txtPNRNO") == ["252074004"]
      and "ctl00$ContentPlaceHolder1$btnLoad" in b for p, b in its.posts))
check("login sends the branch code, Branch, the user and btnSubmit",
      its.last_login.get("txtCompanyCode") == ["MLX"] and its.last_login.get("Login") == ["rbtBranch"]
      and its.last_login.get("txtUserName") == ["lookup-test"] and "btnSubmit" in its.last_login
      and "btnSubmitOTP" not in its.last_login)
check("an unknown PNR is {} (not found)", s.lookup("111111111") == {})
check("a malformed PNR is never sent", s.lookup("12; DROP") == {} and s.lookup("") == {})
os.environ["ITS_LOOKUP_PASSWORD"] = "wrong"
try:
    L.Session().lookup("252074004")
    check("a refused login raises", False)
except L.ItsAuthError as e:
    check("a refused login raises with ITS's reason", "Invalid password" in str(e))
os.environ["ITS_LOOKUP_PASSWORD"] = "not-a-real-password"
os.environ["ITS_BRANCH_CODE"] = "WRONG"
try:
    L.Session().lookup("252074004")
    check("a wrong branch code fails", False)
except L.ItsAuthError as e:
    check("a wrong branch code is not mistaken for an OTP", "OTP" not in str(e) and "Invalid password" in str(e))
os.environ["ITS_BRANCH_CODE"] = ""
try:
    L.Session().lookup("252074004")
    check("no branch code fails", False)
except L.ItsAuthError as e:
    check("a missing branch code says which setting to add", "ITS_BRANCH_CODE" in str(e))
os.environ["ITS_BRANCH_CODE"] = "MLX"

# --- what the server keeps ---------------------------------------------------
OWNER = {"id": "u-owner", "role": "owner"}
c = S.db()
rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
rev = S._upsert_record(c, "drivers", "d-ravi", {"id": "d-ravi", "name": "Ravindra", "phone": "98290 11111"}, S.now_ms(), rev)
c.commit()
c.close()

code, res = S.its_lookup_batch(["252074004", "111111111", "x"], OWNER)
check("batch looks up the valid PNRs", code == 200 and res["lookedUp"] == 2 and res["found"] == 1 and res["driverMatched"] == 1)


def stored(rid):
    c = S.db()
    r = c.execute("SELECT data FROM records WHERE store='itslookup' AND id=?", (rid,)).fetchone()
    c.close()
    return json.loads(r[0]) if r else None


rec = stored("it-252074004")
check("the driver is matched to the crew bank by exact number", rec["crewId"] == "d-ravi")
check("the driver's number is kept masked only", rec["driverPhoneMasked"] == "•••••• 1111" and "9829011111" not in json.dumps(rec))
check("no passenger details kept", not any(k in json.dumps(rec) for k in ("Test Passenger", "9000000001", "p@example.com")))
check("a PNR ITS does not know is recorded as not found", stored("it-111111111")["found"] is False)

n = len(its.posts)
code, res = S.its_lookup_batch(["252074004", "111111111"], OWNER)
check("found PNRs and fresh not-founds are not asked again", res["skipped"] == 2 and len(its.posts) == n)

c = S.db()
rev = c.execute("SELECT COALESCE(MAX(rev),0) FROM records").fetchone()[0]
S._upsert_record(c, "drivers", "d-dup", {"id": "d-dup", "name": "Other", "altPhone": "9829011111"}, S.now_ms(), rev)
c.commit()
check("two crew records with one number match nobody", S._crew_by_phone(c, "9829011111") is None)
c.close()

check("only the server writes lookups", not S.may_write("owner", "itslookup"))
check("crew phones do not receive lookups",
      S.redact_for({"id": "d", "role": "driver"}, {"store": "itslookup", "id": "it-1", "data": rec}) is None)
check("ten PNRs at most per request", S.ITS_BATCH_MAX == 10)
os.environ["ITS_LOOKUP_USER"] = ""
check("off without the lookup user", S.its_lookup_batch(["252074004"], OWNER)[0] == 503)

print("\n%d failed" % len(fails) if fails else "\nall passed")
raise SystemExit(1 if fails else 0)
