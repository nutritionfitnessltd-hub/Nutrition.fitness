"""Account/admin browser acceptance using isolated, explicitly fake QA fixtures.

Every /api request is fulfilled in the browser. All origins except the supplied
static preview origin are blocked. This suite never signs in to a real account,
changes a real website record, sends email, or writes to a customer database.

Run against an already-built/static-served website, for example:
  NUFI_TEST_BASE_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/path/to/chromium \
    python tests/account-admin-browser.py
"""
import copy
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
BASE = os.environ.get("NUFI_TEST_BASE_URL", "http://127.0.0.1:4173").rstrip("/")
CHECKS = []
ERRORS = []
ALL_CALLS = []
PASSWORD = "QA-only-fixture-password-2026!"
MEMBER_ID = "22222222-2222-4222-8222-222222222222"
ADMIN_ID = "11111111-1111-4111-8111-111111111111"
STAMP = "2026-09-21T12:00:00.000Z"


def ok(name, value=True):
    if not value:
        raise AssertionError(name)
    CHECKS.append(name)
    print("PASS", name, flush=True)


def fixture_user(admin=False):
    return {
        "id": ADMIN_ID if admin else MEMBER_ID,
        "email": "qa-admin@example.invalid" if admin else "qa-member@example.invalid",
        "firstName": "QA Administrator" if admin else "QA Member",
        "admin": admin,
        "status": "active",
    }


TURNSTILE_FIXTURE = """
(() => {
  const widgets = new Map();
  let sequence = 0;
  const issue = options => {
    const token = 'qa-fixture-security-' + (++sequence);
    setTimeout(() => options.callback(token), 0);
  };
  window.__qaSecurity = { renders: 0, resets: 0 };
  window.turnstile = {
    render(host, options) {
      const id = 'qa-widget-' + widgets.size;
      widgets.set(id, options);
      host.textContent = 'QA fixture: security check completed';
      host.dataset.qaSecurity = 'fixture-only';
      window.__qaSecurity.renders++;
      issue(options);
      return id;
    },
    reset(id) {
      window.__qaSecurity.resets++;
      if (widgets.has(id)) issue(widgets.get(id));
    },
    remove(id) { widgets.delete(id); }
  };
})();
"""


class Fixtures:
    """In-memory fake service; all data disappears when the test ends."""

    def __init__(self, session=None, configured=True, password_configured=True):
        self.session = copy.deepcopy(session)
        self.configured = configured
        self.password_configured = password_configured
        self.fail_next_login = False
        self.recovery = False
        self.calls = []
        self.pending_name = "QA Member"
        self.access = "account"
        self.page_record = {
            "id": "home",
            "path": "/",
            "label": "QA Homepage fixture",
            "title": "QA original homepage heading",
            "intro": "QA introduction used only by the isolated browser test.",
            "metaTitle": "QA homepage search title",
            "metaDescription": "QA search description.",
            "publicationStatus": "published",
            "version": 4,
            "updatedAt": STAMP,
            "publishedAt": STAMP,
        }
        self.member_record = {
            "userId": MEMBER_ID,
            "email": "qa-member@example.invalid",
            "firstName": "QA Member",
            "role": "member",
            "status": "active",
            "createdAt": STAMP,
            "updatedAt": STAMP,
            "emailVerified": True,
            "onboarding": {"targets": {"protein": 130}, "diet": "QA fixture preference"},
            "workspaceVersion": 3,
            "workspaceUpdatedAt": STAMP,
        }

    def response(self, route, value, status=200):
        route.fulfill(status=status, content_type="application/json", body=json.dumps(value))

    def handler(self, route):
        req = route.request
        parsed = urlparse(req.url)
        path = parsed.path
        params = parse_qs(parsed.query)
        try:
            payload = req.post_data_json if req.post_data else {}
        except Exception:
            payload = {}
        call = {"path": path, "method": req.method, "payload": payload, "url": req.url}
        self.calls.append(call)
        ALL_CALLS.append({"path": path, "method": req.method, "action": payload.get("action")})

        if path == "/api/auth":
            if req.method == "GET":
                return self.response(route, {
                    "configured": self.configured,
                    "passwordConfigured": self.password_configured,
                    "turnstileSiteKey": "qa-fixture-public-key",
                })
            action = payload.get("action")
            if action == "logout":
                self.session = None
                return self.response(route, {"status": "signed-out"})
            if action == "login-password":
                if self.fail_next_login:
                    self.fail_next_login = False
                    return self.response(route, {"error": "QA fixture: email or password was not accepted."}, 401)
                self.session = fixture_user()
                return self.response(route, {"status": "signed-in"})
            if action == "signup-password":
                self.pending_name = payload.get("firstName", "QA New Member")
                return self.response(route, {"status": "verification-required"})
            if action == "send-code":
                if not self.configured:
                    return self.response(route, {"error": "QA fixture: email-code login unavailable."}, 503)
                return self.response(route, {"status": "code-sent"})
            if action == "verify-code":
                self.session = fixture_user()
                self.session["firstName"] = self.pending_name
                return self.response(route, {"status": "signed-in"})
            if action == "request-reset":
                return self.response(route, {"status": "code-sent"})
            if action == "verify-recovery":
                self.recovery = True
                return self.response(route, {"status": "recovery-verified"})
            if action == "reset-password":
                if not self.recovery:
                    return self.response(route, {"error": "QA fixture: recovery verification required."}, 401)
                self.recovery = False
                self.session = None
                return self.response(route, {"status": "password-reset"})
            return self.response(route, {"error": "QA fixture: unknown auth action."}, 400)

        if path == "/api/account":
            if not self.session:
                return self.response(route, {"error": "QA fixture: sign in required."}, 401)
            if req.method == "PATCH":
                self.session["firstName"] = payload["firstName"]
                return self.response(route, {"status": "saved", "profile": {"firstName": payload["firstName"]}})
            if req.method == "POST":
                self.session = None
                return self.response(route, {"status": "password-changed"})
            return self.response(route, {
                "user": self.session,
                "profile": {"firstName": self.session["firstName"]},
                "workspace": {"version": 0, "updatedAt": None, "savedRecipes": 4, "courseProgress": ["core-1", "core-2", "build-1"]},
                "access": {"recipes": self.access},
                "onboarding": None,
            })

        if path == "/api/member-data":
            if not self.session:
                return self.response(route, {"error": "QA fixture: sign in required."}, 401)
            if req.method != "GET":
                return self.response(route, {"error": "QA fixture: planner writes are not part of this test."}, 409)
            return self.response(route, {"user": self.session, "version": 0, "state": None})

        if path == "/api/manage":
            if not self.session:
                return self.response(route, {"error": "QA fixture: sign in required."}, 401)
            if not self.session.get("admin"):
                return self.response(route, {"error": "QA fixture: administrator required."}, 403)
            if req.method == "POST":
                action = payload.get("action")
                if action == "save-page":
                    if payload["record"]["version"] != self.page_record["version"]:
                        return self.response(route, {"error": "QA fixture: reload the latest version."}, 409)
                    self.page_record.update(payload["record"])
                    self.page_record["version"] += 1
                    self.page_record["updatedAt"] = STAMP
                    return self.response(route, {"record": self.page_record})
                if action == "update-member":
                    if payload["record"]["role"] == "admin" and not payload.get("confirmAdmin"):
                        return self.response(route, {"error": "QA fixture: confirm administrator access."}, 400)
                    self.member_record.update(payload["record"])
                    return self.response(route, {"record": self.member_record})
                return self.response(route, {"error": "QA fixture: unsupported management mutation."}, 400)
            section = params.get("section", ["overview"])[0]
            if section == "page":
                return self.response(route, {"record": self.page_record})
            if section == "overview":
                return self.response(route, {
                    "counts": {"members": 7, "activeMembers": 6, "suspendedMembers": 1, "admins": 1,
                               "freeRecipes": 100, "accountRecipes": 9, "heldRecipes": 2, "pages": 1, "products": 0},
                    "recentAudit": [], "configured": {"management": True, "recipes": True},
                })
            items = [self.member_record] if section == "members" else [self.page_record] if section == "pages" else []
            return self.response(route, {"items": items, "total": len(items), "page": 1, "pageSize": 25})

        if path == "/api/admin" and payload.get("action") == "rerun-onboarding":
            self.member_record["onboarding"] = None
            self.member_record["workspaceVersion"] += 1
            return self.response(route, {"version": self.member_record["workspaceVersion"], "updatedAt": STAMP})

        # Public scripts may ask for readiness. Never let unlisted requests reach
        # a real endpoint even when BASE points at a hosted deployment.
        return self.response(route, {"error": "QA fixture: endpoint deliberately disabled."}, 503)

    def mutations(self, action=None):
        return [c for c in self.calls if c["method"] not in ("GET", "HEAD")
                and (action is None or c["payload"].get("action") == action)]


def create_context(browser, fixtures):
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    ctx.add_init_script(TURNSTILE_FIXTURE)
    ctx.route("**/*", lambda route: route.continue_() if route.request.url.startswith(BASE + "/") else route.abort())
    ctx.route("**/api/**", fixtures.handler)
    page = ctx.new_page()
    page.set_default_timeout(15000)
    page.on("pageerror", lambda error: ERRORS.append(str(error)))
    return ctx, page


def ready_auth(page, path):
    page.goto(BASE + path)
    expect(page.locator("[data-auth-form] fieldset")).to_be_enabled()
    expect(page.locator("dialog[open]")).to_have_count(0)


def no_overflow(page, width, label):
    ok(f"No horizontal page overflow: {label} at {width}px",
       page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    box = page.locator("[data-nf-portal]").bounding_box()
    ok(f"Portal fits viewport: {label} at {width}px", box["x"] >= -1 and box["x"] + box["width"] <= width + 1)


with sync_playwright() as playwright:
    options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if os.environ.get("CHROMIUM_PATH"):
        options["executable_path"] = os.environ["CHROMIUM_PATH"]
    elif Path("/usr/bin/chromium").exists():
        options["executable_path"] = "/usr/bin/chromium"
    browser = playwright.chromium.launch(**options)
    contexts = []
    active_page = None
    try:
        fixtures = Fixtures(configured=False, password_configured=False)
        ctx, p = create_context(browser, fixtures); contexts.append(ctx); active_page = p
        p.goto(BASE + "/login/")
        expect(p.locator("[data-portal-message]")).to_contain_text("temporarily unavailable")
        expect(p.get_by_label("Email address", exact=True)).to_be_disabled()
        expect(p.get_by_role("button", name="Sign in", exact=True)).to_be_disabled()
        ok("Unconfigured sign-in reports availability and disables submission", not fixtures.mutations())
        ctx.close()

        fixtures = Fixtures(); fixtures.fail_next_login = True
        ctx, p = create_context(browser, fixtures); contexts.append(ctx); active_page = p
        ready_auth(p, "/login/?next=%2Faccount%2F")
        p.get_by_label("Email address", exact=True).fill("qa-member@example.invalid")
        p.locator("#password").fill(PASSWORD)
        p.get_by_role("button", name="Show password", exact=True).click()
        expect(p.locator("#password")).to_have_attribute("type", "text")
        p.get_by_role("button", name="Hide password", exact=True).click()
        expect(p.locator("#password")).to_have_attribute("type", "password")
        p.get_by_role("button", name="Sign in", exact=True).click()
        expect(p.locator("[data-portal-message]")).to_contain_text("not accepted")
        expect(p.get_by_role("button", name="Sign in", exact=True)).to_be_enabled()
        p.get_by_role("button", name="Sign in", exact=True).click()
        expect(p).to_have_url(BASE + "/account/")
        expect(p.locator("#nf-account-heading")).to_contain_text("QA Member")
        expect(p.locator('.nf-side-nav a[href="/courses/"]')).to_be_visible()
        expect(p.locator('[data-course-card]')).to_have_count(7)
        expect(p.locator('[data-member-stat="courses"]')).to_contain_text("3 / 21")
        expect(p.locator('[data-member-stat="saved"]')).to_contain_text("4")
        expect(p.locator('[data-course-card="core"]')).to_contain_text("2 of 3")
        expect(p.locator('[data-course-card="core"] .nf-text-link')).to_have_attribute("href", "/courses/core/lesson-3/")
        ok("Free member hub shows synced favourites, all seven courses and course progress")
        logins = fixtures.mutations("login-password")
        ok("Password login handles rejection, enables retry and opens the account", len(logins) == 2)
        ok("Consumed CAPTCHA tokens are refreshed before retry", logins[0]["payload"]["botToken"] != logins[1]["payload"]["botToken"])
        ok("Password is sent in JSON POST only", all(c["method"] == "POST" and PASSWORD not in c["url"] for c in logins))
        ok("Credentials never appear in local/session storage", p.evaluate("JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)])").find(PASSWORD) == -1)
        expect(p.locator("[data-admin-link]")).to_be_hidden()
        p.locator("[data-profile-form] #firstName").fill("QA Updated Member")
        p.locator("[data-profile-form]").get_by_role("button", name="Save details").click()
        expect(p.locator("[data-portal-message]")).to_contain_text("details have been saved")
        p.reload()
        expect(p.locator("[data-profile-form] #firstName")).to_have_value("QA Updated Member")
        expect(p.locator("#nf-account-heading")).to_contain_text("QA Updated Member")
        ok("Profile edit persists through a fresh account read")
        expect(p.locator("[data-account-sync]")).to_contain_text("Saved plan & sync")
        ok("Account retains the saved-plan and sync controls")
        fixtures.access = "pending"; p.reload()
        expect(p.locator(".nf-account-banner")).to_contain_text("being prepared")
        ok("Pending recipe access does not claim member recipes are unlocked")
        fixtures.access = "membership-required"; p.reload()
        expect(p.locator(".nf-account-banner")).to_contain_text("requires an eligible membership")
        ok("Membership-required access is presented accurately")
        p.locator("[data-password-details] summary").click()
        expect(p.locator("[data-password-form] fieldset")).to_be_enabled()
        p.locator("#currentPassword").fill(PASSWORD)
        p.locator("#newPassword").fill("QA-replacement-fixture-password-2026!")
        p.locator("#confirmNewPassword").fill("QA-replacement-fixture-password-2026!")
        p.locator("[data-password-form]").get_by_role("button", name="Change password", exact=True).click()
        expect(p).to_have_url(BASE + "/login/?password=changed")
        expect(p.locator("[data-portal-message]")).to_contain_text("password has been updated")
        password_changes = fixtures.mutations("change-password")
        ok("Account password change verifies current password and returns to sign in",
           len(password_changes) == 1 and password_changes[0]["path"] == "/api/account"
           and password_changes[0]["payload"]["currentPassword"] == PASSWORD
           and bool(password_changes[0]["payload"]["botToken"]))
        ctx.close()

        fixtures = Fixtures()
        ctx, p = create_context(browser, fixtures); contexts.append(ctx); active_page = p
        ready_auth(p, "/register/")
        p.get_by_label("First name", exact=True).fill("QA New Member")
        p.get_by_label("Email address", exact=True).fill("qa-new@example.invalid")
        p.locator("#password").fill(PASSWORD)
        p.get_by_role("button", name="Create account", exact=True).click()
        expect(p.locator("#nf-auth-heading")).to_have_text("Check your inbox.")
        p.get_by_label("Six-digit code", exact=True).fill("123456")
        p.get_by_role("button", name="Verify and sign in", exact=True).click()
        expect(p).to_have_url(BASE + "/account/")
        expect(p.locator("#nf-account-heading")).to_contain_text("QA New Member")
        ok("Registration requires email verification before opening the account",
           [c["payload"]["action"] for c in fixtures.mutations()] == ["signup-password", "verify-code"])
        ctx.close()

        fixtures = Fixtures(configured=True, password_configured=False)
        ctx, p = create_context(browser, fixtures); contexts.append(ctx); active_page = p
        ready_auth(p, "/login/")
        expect(p.locator("#password")).to_have_count(0)
        p.get_by_label("Email address", exact=True).fill("qa-member@example.invalid")
        p.get_by_role("button", name="Email my sign-in code", exact=True).click()
        p.get_by_label("Six-digit code", exact=True).fill("123456")
        p.get_by_role("button", name="Verify and sign in", exact=True).click()
        expect(p).to_have_url(BASE + "/account/")
        ok("Existing email-code sign-in remains usable without password readiness",
           [c["payload"]["action"] for c in fixtures.mutations()] == ["send-code", "verify-code"])
        ctx.close()

        fixtures = Fixtures(configured=False, password_configured=True)
        ctx, p = create_context(browser, fixtures); contexts.append(ctx); active_page = p
        ready_auth(p, "/login/")
        expect(p.locator("[data-auth-toggle]")).to_be_hidden()
        ready_auth(p, "/register/")
        p.get_by_label("First name", exact=True).fill("QA Password Member")
        p.get_by_label("Email address", exact=True).fill("qa-password-only@example.invalid")
        p.locator("#password").fill(PASSWORD)
        p.get_by_role("button", name="Create account", exact=True).click()
        p.get_by_role("button", name="Request another code", exact=True).click()
        expect(p.locator("[data-auth-form]")).to_have_attribute("data-auth-form", "register")
        expect(p.get_by_label("Email address", exact=True)).to_have_value("qa-password-only@example.invalid")
        ok("Password-only deployments hide unsupported email-code actions and can retry signup", not fixtures.mutations("send-code"))
        ctx.close()

        fixtures = Fixtures()
        ctx, p = create_context(browser, fixtures); contexts.append(ctx); active_page = p
        ready_auth(p, "/forgot-password/")
        p.get_by_label("Email address", exact=True).fill("qa-member@example.invalid")
        p.get_by_role("button", name="Send reset code", exact=True).click()
        p.get_by_label("Six-digit code", exact=True).fill("123456")
        p.get_by_role("button", name="Verify reset code", exact=True).click()
        expect(p).to_have_url(BASE + "/reset-password/")
        expect(p.locator("[data-auth-form] fieldset")).to_be_enabled()
        p.locator("#password").fill(PASSWORD)
        p.locator("#confirmPassword").fill("QA-different-password-2026!")
        p.get_by_role("button", name="Save new password", exact=True).click()
        expect(p.locator("[data-portal-message]")).to_contain_text("do not match")
        ok("Mismatched reset passwords do not reach the API", not fixtures.mutations("reset-password"))
        p.locator("#confirmPassword").fill(PASSWORD)
        p.get_by_role("button", name="Save new password", exact=True).click()
        expect(p).to_have_url(BASE + "/login/?password=reset")
        expect(p.locator("[data-portal-message]")).to_contain_text("password has been updated")
        ok("Recovery verifies the code, resets the password and returns to sign in",
           [c["payload"]["action"] for c in fixtures.mutations()] == ["request-reset", "verify-recovery", "reset-password"])
        ctx.close()

        for user, description in [(None, "Signed-out visitor"), (fixture_user(), "Regular member")]:
            fixtures = Fixtures(session=user)
            ctx, p = create_context(browser, fixtures); contexts.append(ctx); active_page = p
            p.goto(BASE + "/admin/members/")
            expect(p.locator("[data-admin-content] h2")).to_have_text("Sign in to manage the website" if user is None else "Administrator access required")
            expect(p.locator(".nf-table")).to_have_count(0)
            ok(description + " cannot trigger management data reads", not any(c["path"] == "/api/manage" for c in fixtures.calls))
            ctx.close()

        fixtures = Fixtures(session=fixture_user(admin=True))
        ctx, p = create_context(browser, fixtures); contexts.append(ctx); active_page = p
        p.goto(BASE + "/admin/pages/?edit=home")
        expect(p.locator("#title")).to_have_value("QA original homepage heading")
        p.locator("#title").fill("QA updated homepage heading")
        p.locator("#intro").fill("QA updated introduction, confined to the in-memory fixture.")
        p.get_by_label("Status", exact=True).select_option("published")
        p.get_by_role("button", name="Save page", exact=True).click()
        expect(p.locator("[data-portal-message]")).to_contain_text("Saved and published")
        saves = fixtures.mutations("save-page")
        ok("Admin page editor saves only after explicit submission with expected version",
           len(saves) == 1 and saves[0]["payload"]["record"]["version"] == 4
           and saves[0]["payload"]["record"]["title"] == "QA updated homepage heading")
        p.reload(); expect(p.locator("#title")).to_have_value("QA updated homepage heading")
        p.get_by_label("Status", exact=True).select_option("draft")
        p.get_by_role("button", name="Save page", exact=True).click()
        expect(p.locator("[data-portal-message]")).to_contain_text("Draft saved")
        ok("Admin page changes can be saved as a draft with a new version",
           fixtures.mutations("save-page")[-1]["payload"]["record"]["version"] == 5)
        p.goto(BASE + "/admin/members/")
        p.get_by_role("button", name="Manage", exact=True).click()
        p.get_by_label("Account role", exact=True).select_option("admin")
        p.get_by_role("button", name="Save member", exact=True).click()
        ok("Administrator promotion is blocked without explicit confirmation", not fixtures.mutations("update-member"))
        p.locator("input[name=confirmAdmin]").check()
        p.get_by_role("button", name="Save member", exact=True).click()
        expect(p.locator("[data-portal-message]")).to_contain_text("Member details saved")
        ok("Confirmed administrator promotion sends the expected role and confirmation",
           fixtures.mutations("update-member")[0]["payload"]["confirmAdmin"] is True)
        p.locator("input[name=confirmRerun]").check()
        p.get_by_role("button", name="Request new onboarding", exact=True).click()
        expect(p.locator("[data-portal-message]")).to_contain_text("Onboarding has been cleared")
        ok("Onboarding reset submits the selected user and current workspace version",
           fixtures.mutations("rerun-onboarding")[0]["payload"] == {"action": "rerun-onboarding", "userId": MEMBER_ID, "version": 3})

        for width in [390, 768, 1440, 320]:
            p.set_viewport_size({"width": width, "height": 1000 if width >= 768 else 844})
            ready_auth(p, "/login/")
            no_overflow(p, width, "login")
            if width in (390, 1440):
                p.screenshot(path=str(OUT / f"account-admin-fixture-login-{width}.png"), full_page=False)
            p.goto(BASE + "/account/")
            expect(p.locator("[data-profile-form]")).to_be_visible()
            no_overflow(p, width, "account")
            if width in (390, 1440):
                p.screenshot(path=str(OUT / f"account-admin-fixture-account-{width}.png"), full_page=False)
            p.goto(BASE + "/admin/members/")
            expect(p.locator(".nf-table")).to_be_visible()
            no_overflow(p, width, "member list")
            p.goto(BASE + "/admin/pages/?edit=home")
            expect(p.locator("[data-editor-form]")).to_be_visible()
            no_overflow(p, width, "page editor")
            if width == 390:
                p.screenshot(path=str(OUT / "account-admin-fixture-page-editor-390.png"), full_page=False)
        p.set_viewport_size({"width": 1440, "height": 1000})
        p.goto(BASE + "/admin/"); expect(p.locator(".nf-stat")).to_have_count(4)
        p.screenshot(path=str(OUT / "account-admin-fixture-overview-1440.png"), full_page=False)
        p.set_viewport_size({"width": 390, "height": 844})
        p.screenshot(path=str(OUT / "account-admin-fixture-overview-390.png"), full_page=False)
        ok("Admin overview uses the values returned by the fixture API", p.locator(".nf-stat strong").all_text_contents() == ["7", "9", "100", "2"])
        ok("No unhandled JavaScript exceptions", not ERRORS)
        ok("All mutations remained inside intercepted QA fixtures", all(c["path"].startswith("/api/") for c in ALL_CALLS))
    except Exception:
        if active_page and not active_page.is_closed():
            active_page.screenshot(path=str(OUT / "account-admin-fixture-failure.png"), full_page=False)
        raise
    finally:
        (OUT / "account-admin-browser.json").write_text(json.dumps({
            "baseURL": BASE, "fixturesOnly": True, "passed": len(CHECKS), "checks": CHECKS,
            "errors": ERRORS, "interceptedRequests": ALL_CALLS,
        }, indent=2))
        for context in contexts:
            try:
                context.close()
            except Exception:
                pass
        browser.close()
