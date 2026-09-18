"""Read-only layout acceptance and developer PDF render. All APIs are mocked."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[1];OUT=R/'test-results';OUT.mkdir(exist_ok=True)
BASE=os.getenv('NUFI_TEST_BASE_URL','http://127.0.0.1:4173').rstrip('/')
checks=[];errors=[]
def ok(name,value=True):
 assert value,name
 checks.append(name);print('PASS',name,flush=True)
def overlap(a,b):
 return min(a['x']+a['width'],b['x']+b['width'])-max(a['x'],b['x'])>1 and min(a['y']+a['height'],b['y']+b['height'])-max(a['y'],b['y'])>1
with sync_playwright() as w:
 opts={'headless':True}
 if os.getenv('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 elif Path('/usr/bin/chromium').exists():opts['executable_path']='/usr/bin/chromium'
 b=w.chromium.launch(**opts);ctx=b.new_context(reduced_motion='reduce')
 ctx.route('**/api/**',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"QA: no real submission"}'))
 p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  for width in [320,390,640,768,1024,1440]:
   p.set_viewport_size({'width':width,'height':1000 if width>=768 else 844})
   p.goto(BASE+'/');p.wait_for_function('document.documentElement.dataset.nfFormModals==="ready"')
   for img in p.locator('.nf-home-feature img').all():
    img.scroll_into_view_if_needed();img.evaluate('async(el)=>await el.decode()')
    ok(f'Image loaded at {width}',img.evaluate('(el)=>el.naturalWidth>0'))
   p.evaluate('async()=>await document.fonts.ready')
   expect(p.locator('.nf-home-feature')).to_have_count(2)
   expect(p.locator('.home-programme-tile')).to_have_count(3);expect(p.locator('.home-product-tile')).to_have_count(4)
   expect(p.locator('.launch-banner')).to_have_count(1);expect(p.locator('#about')).to_have_count(1)
   expect(p.locator('.home-powder-pack')).to_have_count(0)
   for card in p.locator('.nf-home-feature').all():
    box=card.bounding_box();regions=[]
    for suffix in ['heading','visual','description','note','action']:
     el=card.locator('.nf-home-feature__'+suffix);r=el.bounding_box();regions.append(r)
     assert r['x']>=box['x'] and r['x']+r['width']<=box['x']+box['width']+1
     assert r['y']>=box['y'] and r['y']+r['height']<=box['y']+box['height']+1
    for i,a in enumerate(regions):
     for other in regions[i+1:]:assert not overlap(a,other),f'Overlapping content at {width}'
    action=card.locator('a');action.scroll_into_view_if_needed()
    ok(f'Action is unobscured and at least 44px at {width}',action.bounding_box()['height']>=44 and action.evaluate('(el)=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'))
   ok(f'No clipped regions, overlaps or horizontal overflow at {width}',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
   if width in [390,1440]:
    p.locator('.nf-home-features').screenshot(path=str(OUT/f'feature-panels-{width}.png'))
   if width==390:
    p.add_style_tag(content='.nf-home-feature h2{font-size:64px}.nf-home-feature__description{font-size:32px}.nf-home-feature__action{font-size:32px}.nf-home-feature__note>span{font-size:42px}')
    ok('Enlarged text reflows without horizontal page overflow',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  for target in ['/recipes/','/shop/']:
   p.goto(BASE+'/');p.locator(f'.nf-home-feature__action[href="{target}"]').click();expect(p).to_have_url(BASE+target)
   ok('Working feature action '+target)
  # Render the developer handoff with the real site fonts, not a guessed substitute.
  doc=ctx.new_page();doc.set_content((R/'docs/developer-style/style-guide.html').read_text(),wait_until='networkidle')
  doc.evaluate('async()=>await document.fonts.ready')
  loaded=doc.evaluate('Array.from(document.fonts).filter(f=>f.status==="loaded").map(f=>f.family)')
  ok('Developer guide uses loaded DM Sans and Kalam',any('DM Sans' in x for x in loaded) and any('Kalam' in x for x in loaded))
  for page in doc.locator('.page').all():
   ok('Guide page content clears its footer',page.evaluate('(el)=>{const f=el.querySelector(".footer").getBoundingClientRect();return [...el.children].filter(c=>!c.classList.contains("footer")).every(c=>c.getBoundingClientRect().bottom<=f.top-3)}'))
  doc.pdf(path=str(OUT/'Nutrition-Fitness-Developer-Style-Sheet.pdf'),print_background=True,prefer_css_page_size=True)
  doc.locator('.page').first.screenshot(path=str(OUT/'developer-palette.png'));doc.close()
  ok('No unhandled JavaScript errors',not errors)
 except Exception:
  p.screenshot(path=str(OUT/'feature-panels-failure.png'),full_page=True);raise
 finally:
  (OUT/'home-feature-panels-browser.json').write_text(json.dumps({'baseURL':BASE,'passed':len(checks),'checks':checks,'errors':errors},indent=2));b.close()
