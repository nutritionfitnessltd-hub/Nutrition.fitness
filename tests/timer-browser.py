"""Countdown presentation regression. CI uses HTTP; --offline embeds local assets.
The offline mode verifies local layout/behaviour only, not a deployed service.
"""
from pathlib import Path
from datetime import datetime, timezone
import base64, json, mimetypes, os, re, sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
OFFLINE = '--offline' in sys.argv
BASE_URL = os.environ.get('NUFI_TEST_BASE_URL', 'http://127.0.0.1:4173').rstrip('/')
checks = []
errors = []

def check(name, value):
    if not value:
        raise AssertionError(name)
    checks.append(name)


def local_html():
    """Embed this build's own assets; do not change the application JavaScript."""
    cache = {}
    def module(path):
        path = path.resolve()
        if path in cache:
            return cache[path]
        code = re.sub(r"from ['\"](\.[^'\"]+)['\"]",
                      lambda m: "from '" + module(path.parent / m[1]) + "'", path.read_text())
        uri = 'data:text/javascript;base64,' + base64.b64encode(code.encode()).decode()
        cache[path] = uri
        return uri
    def asset(path):
        return 'data:' + (mimetypes.guess_type(path)[0] or 'application/octet-stream') + ';base64,' + base64.b64encode(path.read_bytes()).decode()
    html = (DIST / 'index.html').read_text()
    def stylesheet(m):
        href = re.search(r'href="([^"]+)"', m[0])
        if 'rel="stylesheet"' in m[0] and href and href[1].startswith('/'):
            return '<style>' + (DIST / href[1].lstrip('/')).read_text() + '</style>'
        return ''
    html = re.sub(r'<link[^>]+>', stylesheet, html)
    html = re.sub(r'<script type="module" src="([^"]+)"></script>',
                  lambda m: '<script type="module" src="' + module(DIST / m[1].lstrip('/')) + '"></script>', html)
    html = re.sub(r'src="(/assets/[^"]+)"', lambda m: 'src="' + asset(DIST / m[1].lstrip('/')) + '"', html)
    return html

with sync_playwright() as pw:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        options['executable_path'] = os.environ['CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').exists():
        options['executable_path'] = '/usr/bin/chromium'
    browser = pw.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.clock.install(time=datetime(2026, 9, 16, 9, 0, tzinfo=timezone.utc))
    if OFFLINE:
        page.set_content(local_html(), wait_until='load')
    else:
        page.goto(BASE_URL+'/', wait_until='load')
    page.wait_for_function('document.querySelector("[data-days]").textContent !== "—"')
    check('Explicit goes-live headline', page.locator('[data-launch-kicker]').get_attribute('aria-label') == 'Nutrition.Fitness goes live in…')
    check('Fixed launch date visible', page.locator('.launch-date time').get_attribute('aria-label') == '1 November 2026 · 9am UK time')
    check('Whole-system launch explained', 'The full system launches together' in page.locator('.launch-widget').text_content())
    check('Timer accessible without repetitive announcements', page.locator('[role="timer"]').get_attribute('aria-live') == 'off')
    check('Original hero headline retained', 'Getting fit is' in page.locator('#hero-heading').inner_text())
    check('Original phone image retained', page.locator('.hero-phone').count() == 1)
    check('Quiz remains the primary action', page.locator('.hero-button').get_attribute('href') == '/get-started/')
    for width in [320, 370, 371, 390, 760, 761, 900, 901, 1024, 1190, 1191, 1280, 1440]:
        page.set_viewport_size({'width': width, 'height': 1100})
        page.wait_for_timeout(80)
        check(f'No horizontal page overflow at {width}px', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check(f'Countdown is larger at {width}px', page.locator('[data-days]').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)') >= (26 if width <= 900 else 44))
        check(f'Numbers and labels fit at {width}px', page.locator('[data-launch-clock]').evaluate('''(e)=>{const box=e.getBoundingClientRect();return [...e.querySelectorAll('strong,span')].filter(n=>getComputedStyle(n).display!=='none').every(n=>{const r=n.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1;});}'''))
        check(f'Launch date fits at {width}px', page.locator('.launch-date').evaluate('(e)=>e.scrollWidth <= e.clientWidth'))
        check(f'Banner between navigation and hero at {width}px', page.evaluate("""(()=>{const b=document.querySelector('.launch-banner').getBoundingClientRect(),h=document.querySelector('.site-header').getBoundingClientRect(),hero=document.querySelector('.hero').getBoundingClientRect();return b.top>=h.bottom-1 && b.bottom<=hero.top+1 && !document.querySelector('.hero .launch-widget');})()"""))
        check(f'Banner contents stay on one horizontal row at {width}px', page.locator('.launch-banner-inner').evaluate("""e=>{const box=e.getBoundingClientRect(),items=[...e.children].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.getBoundingClientRect());return items.every((r,i)=>r.left>=box.left-1&&r.right<=box.right+1&&Math.abs(r.y+r.height/2-(box.y+box.height/2))<2&&(!i||r.left>=items[i-1].right));}"""))
        if width in [390, 1440]:
            page.screenshot(path=str(OUT / f'launch-hero-{width}.png'))
            page.locator('.launch-widget').screenshot(path=str(OUT / f'launch-countdown-{width}.png'))
    page.clock.set_system_time(datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc))
    page.clock.fast_forward(20000)
    check('Clock disappears after launch rather than counting backwards', page.locator('[data-launch-clock]').is_hidden())
    check('Timer alone does not claim unfinished services are live', 'The countdown is complete.' in page.locator('[data-launch-kicker]').inner_text())
    check('No application JavaScript errors', not errors)
    browser.close()
report = {'mode': 'offline embedded assets' if OFFLINE else 'HTTP '+BASE_URL, 'passed': len(checks), 'checks': checks}
(OUT / 'launch-countdown.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
