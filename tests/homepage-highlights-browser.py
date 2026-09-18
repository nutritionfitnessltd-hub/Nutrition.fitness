"""Homepage-only acceptance. Isolated storage and mocked APIs, including live runs.
No customer, account, CRM or payment writes are made.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
BASE=os.environ.get('NUFI_TEST_BASE_URL','http://127.0.0.1:4173').rstrip('/')
checks=[]; errors=[]
def ok(name,value=True):
 if not value: raise AssertionError(name)
 checks.append(name); print('PASS',name,flush=True)
with sync_playwright() as w:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_PATH'): opts['executable_path']=os.environ['CHROMIUM_PATH']
 elif Path('/usr/bin/chromium').exists(): opts['executable_path']='/usr/bin/chromium'
 browser=w.chromium.launch(**opts)
 ctx=browser.new_context(reduced_motion='reduce')
 ctx.route('**/api/**',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"QA: no real submission"}'))
 p=ctx.new_page();p.set_default_timeout(15000);p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  for width in [320,390,768,1024,1440]:
   p.set_viewport_size({'width':width,'height':1000 if width>760 else 844})
   p.goto(BASE+'/');p.wait_for_function('document.documentElement.dataset.nfFormModals==="ready"')
   expect(p.locator('#coaches,.coach-card')).to_have_count(0)
   expect(p.locator('#home-programmes')).to_have_count(1);expect(p.locator('#home-products')).to_have_count(1)
   expect(p.locator('.home-programme-tile')).to_have_count(3);expect(p.locator('.home-product-tile')).to_have_count(4)
   ok(f'Coach section replaced by exactly two rows at {width}px')
   expect(p.locator('#hero-heading')).to_contain_text('Getting fit is')
   expect(p.locator('.hero-phone')).to_have_attribute('src','/assets/phone-in-hand.webp')
   expect(p.locator('.launch-banner')).to_have_count(1)
   expect(p.locator('#recipes,#shop,#about')).to_have_count(3)
   expect(p.locator('.feature-strip a')).to_have_count(5)
   expect(p.locator('.feature-strip a[href="/coaches/"]')).to_have_count(1)
   expect(p.locator('.home-showcase-note')).to_have_count(2)
   ok(f'Hero, countdown, existing sections and doodles retained at {width}px')
   for img in p.locator('.home-showcase img').all():
    img.scroll_into_view_if_needed()
    expect(img).to_have_js_property('complete',True)
    assert img.evaluate('(el)=>el.naturalWidth>0'),img.get_attribute('src')
    img.evaluate('async(el)=>{await el.decode();}')
   ok(f'All seven existing images load at {width}px')
   ok(f'No horizontal page overflow at {width}px',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
   for cls in ['.home-programme-row','.home-product-row']:
    cards=p.locator(cls+' > article').all()
    for card in cards:
     box=card.bounding_box();assert box['x']>=0 and box['x']+box['width']<=width+1
   ok(f'Every card fits its row at {width}px')
   if width==1440:
    a=p.locator('.home-programme-tile').all();b=p.locator('.home-product-tile').all()
    assert len({round(c.bounding_box()['y']) for c in a})==1
    assert len({round(c.bounding_box()['y']) for c in b})==1
    ok('Desktop has one three-programme row and one four-product row')
   p.evaluate('async()=>{await document.fonts.ready;}')
   if width in (390,1440):
    p.locator('#home-programmes').screenshot(path=str(OUT/f'home-programmes-{width}.png'))
    p.locator('#home-products').screenshot(path=str(OUT/f'home-products-{width}.png'))
    p.screenshot(path=str(OUT/f'homepage-highlights-{width}.png'),full_page=True)
  # Follow actual card destinations without buying, signing in or sending anything.
  for href in ['/programmes/core/','/programmes/build/','/programmes/fit/','/shop/plain-whey/','/shop/creatine/','/shop/?category=shots','/shop/high-protein-kitchen/']:
   p.goto(BASE+'/');p.locator(f'.home-showcase a[href="{href}"]').click()
   expect(p).to_have_url(BASE+href);expect(p.locator('#main')).to_be_visible()
   ok('Working card destination '+href)
  p.goto(BASE+'/');p.wait_for_function('document.documentElement.dataset.nfFormModals==="ready"');p.locator('.hero-button').click()
  f=p.frame_locator('dialog[open] iframe');expect(f.locator('.finder-free-note')).to_contain_text('Actually free.')
  expect(f.locator('.finder-option-art')).to_have_count(7)
  p.locator('dialog[open] .nf-form-close').click()
  ok('Existing illustrated programme-finder modal still opens and closes')
  p.goto(BASE+'/coaches/');expect(p.locator('img[src="/assets/jeff.webp"]').first).to_be_visible();expect(p.locator('img[src="/assets/steff.webp"]').first).to_be_visible()
  ok('Dedicated coaches page remains available')
  ok('No unhandled JavaScript errors',not errors)
 except Exception:
  p.screenshot(path=str(OUT/'homepage-highlights-failure.png'),full_page=True)
  raise
 finally:
  (OUT/'homepage-highlights-browser.json').write_text(json.dumps({'baseURL':BASE,'passed':len(checks),'checks':checks,'errors':errors},indent=2))
  browser.close()
