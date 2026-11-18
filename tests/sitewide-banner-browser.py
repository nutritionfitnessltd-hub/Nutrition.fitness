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
    page.clock.install(time=datetime(2026,11,18,9,0,tzinfo=timezone.utc))
    for route in ROUTES:
        for width in (390,1440):
            page.set_viewport_size({'width':width,'height':1100})
            page.goto(BASE+route,wait_until='load')
            name=f'{route} at {width}px'
            check('No expired banner: '+name,page.locator('.launch-banner:visible').count()==0)
            check('Main content is available: '+name,page.locator('main').is_visible())
            check('Page fits screen: '+name,page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
            if route in ['/recipes/','/shop/','/knowledge-centre/']:
                page.screenshot(path=str(OUT/(route.strip('/')+f'-banner-{width}.png')))
    check('No JavaScript runtime errors',not errors)
    browser.close()
report={'baseURL':BASE,'passed':len(checks),'checks':checks,'errors':errors}
(OUT/'sitewide-banner.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
