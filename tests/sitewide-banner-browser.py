"""Read-only HTTP verification of the shared banner on representative page types."""
from pathlib import Path
from datetime import datetime, timezone
import json, os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
BASE=os.environ.get('NUFI_TEST_BASE_URL','http://127.0.0.1:4173').rstrip('/')
ROUTES=['/recipes/','/recipes/blueberry-lemon-oats/','/meal-planner/','/shopping-list/','/programmes/','/courses/','/shop/','/shop/high-protein-kitchen/','/account/','/get-started/','/knowledge-centre/','/knowledge-centre/am-i-going-to-pay-for-another-fitness-app-and-stop-using-it/','/privacy/']
checks=[]; errors=[]
def check(label,result):
    if not result: raise AssertionError(label)
    checks.append(label)
with sync_playwright() as pw:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'): options['executable_path']=os.environ['CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').exists(): options['executable_path']='/usr/bin/chromium'
    browser=pw.chromium.launch(**options)
    page=browser.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.clock.install(time=datetime(2026,9,16,9,0,tzinfo=timezone.utc))
    for route in ROUTES:
        for width in (390,1440):
            page.set_viewport_size({'width':width,'height':1100})
            page.goto(BASE+route,wait_until='load')
            page.wait_for_function('document.querySelector("[data-days]").textContent !== "—"')
            name=f'{route} at {width}px'
            check('One working banner: '+name,page.locator('.launch-banner').count()==1)
            check('November launch date: '+name,page.locator('.launch-date time').get_attribute('datetime')=='2026-11-01T09:00:00.000Z')
            check('Below navigation and above main content: '+name,page.evaluate("""(()=>{const b=document.querySelector('.launch-banner').getBoundingClientRect(),h=document.querySelector('.site-header').getBoundingClientRect(),m=document.querySelector('main').getBoundingClientRect();return b.top>=h.bottom-1&&b.bottom<=m.top+1})()"""))
            check('Banner fits screen: '+name,page.locator('.launch-banner').evaluate('(e)=>{const b=e.getBoundingClientRect();return b.left>=-1&&b.right<=innerWidth+1&&e.scrollWidth<=e.clientWidth}'))
            if route in ['/recipes/','/shop/','/knowledge-centre/']:
                page.screenshot(path=str(OUT/(route.strip('/')+f'-banner-{width}.png')))
    check('No JavaScript runtime errors',not errors)
    browser.close()
report={'baseURL':BASE,'passed':len(checks),'checks':checks,'errors':errors}
(OUT/'sitewide-banner.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
