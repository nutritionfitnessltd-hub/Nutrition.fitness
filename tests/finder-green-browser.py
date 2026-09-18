"""Read-only green-theme checks and actual UI examples for the developer guide.
All API requests are mocked, including when run on the public production site.
"""
import base64, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
R=Path(__file__).resolve().parents[1]; OUT=R/'test-results'; OUT.mkdir(exist_ok=True)
BASE=os.getenv('NUFI_TEST_BASE_URL','http://127.0.0.1:4173').rstrip('/')
checks=[]; errors=[]
def ok(name,value=True):
 if not value:raise AssertionError(name)
 checks.append(name);print('PASS',name,flush=True)
def colour(loc,property,value):
 expect(loc).to_have_css(property,value)
with sync_playwright() as w:
 opts={'headless':True}
 if os.getenv('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 elif Path('/usr/bin/chromium').exists():opts['executable_path']='/usr/bin/chromium'
 b=w.chromium.launch(**opts)
 ctx=b.new_context(reduced_motion='reduce')
 ctx.route('**/api/**',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"QA: no real submission"}'))
 try:
  for width,height in [(390,844),(1440,1000)]:
   p=ctx.new_page();p.set_viewport_size({'width':width,'height':height});p.on('pageerror',lambda e:errors.append(str(e)))
   p.goto(BASE+'/');p.wait_for_function('document.documentElement.dataset.nfFormModals==="ready"');p.locator('.hero-button').click()
   f=p.frame_locator('dialog[open] iframe');expect(f.locator('.finder-welcome')).to_be_visible()
   f.locator('html').evaluate('async()=>await document.fonts.ready')
   colour(f.locator('.finder-welcome'),'background-color','rgb(233, 238, 223)')
   colour(f.locator('.finder-on-us'),'color','rgb(55, 103, 71)')
   colour(f.locator('[data-next]'),'background-color','rgb(55, 103, 71)')
   colour(f.locator('[data-next]'),'color','rgb(255, 255, 255)')
   for el in f.locator('.finder-doodle').all():colour(el,'color','rgb(55, 103, 71)')
   expect(f.locator('.finder-option-art')).to_have_count(7)
   ok(f'Green header, CTA and real handwritten notes at {width}px')
   ok(f'No horizontal overflow at {width}px',p.evaluate('document.documentElement.scrollWidth<=innerWidth') and f.locator('html').evaluate('el=>el.scrollWidth<=innerWidth'))
   if width==1440:
    colour(p.locator('dialog[open]'),'border-top-color','rgb(55, 103, 71)')
    p.locator('dialog[open]').screenshot(path=str(OUT/'green-quiz-desktop.png'))
    p.screenshot(path=str(OUT/'green-quiz-page-desktop.png'))
    f.locator('.finder-option').first.screenshot(path=str(OUT/'green-card-default.png'))
   else:p.screenshot(path=str(OUT/'green-quiz-mobile.png'))
   f.locator('[data-next]').click();expect(f.locator('.finder-error')).to_have_text('Choose an answer to continue.')
   if width==1440:f.locator('.finder-error').screenshot(path=str(OUT/'green-validation.png'))
   f.locator('input[value=foundation]').check()
   colour(f.locator('.finder-option:has(input:checked)'),'background-color','rgb(233, 238, 223)')
   colour(f.locator('.finder-option:has(input:checked)'),'border-top-color','rgb(55, 103, 71)')
   if width==1440:f.locator('.finder-option:has(input:checked)').screenshot(path=str(OUT/'green-card-selected.png'))
   ok(f'Selection stays explicit; validation still works at {width}px')
   for step,value in enumerate(['foundation','returning','bodyweight','3','30',None,'consistency']):
    for el in f.locator('.finder-doodle').all():colour(el,'color','rgb(55, 103, 71)')
    if value:f.locator(f'input[value="{value}"]').check()
    if width==390 and step==3:
     f.locator('html').evaluate('()=>scrollTo(0,0)')
     p.screenshot(path=str(OUT/'green-quiz-mobile-week.png'))
    f.locator('[data-next]').click()
   expect(f.locator('.finder-result h2')).to_have_text('core')
   colour(f.locator('.finder-result'),'background-color','rgb(233, 238, 223)')
   colour(f.locator('#launch-claim button[type=submit]'),'background-color','rgb(55, 103, 71)')
   expect(f.locator('[name=marketing]')).not_to_be_checked()
   if width==1440:
    f.locator('.finder-result').screenshot(path=str(OUT/'green-result.png'))
    f.locator('#launch-claim button[type=submit]').hover()
    colour(f.locator('#launch-claim button[type=submit]'),'background-color','rgb(43, 82, 56)')
   f.locator('[data-base]').select_option('build');expect(f.locator('.finder-result h2')).to_have_text('build')
   ok(f'Green result and claim states preserve recommendations and user overrides at {width}px')
   p.locator('dialog[open] .nf-form-close').click();expect(p.locator('dialog[open]')).to_have_count(0)
   if width==1440:
    for name,selector in [('programmes','.home-programmes'),('products','.home-products')]:
     block=p.locator(selector);block.scroll_into_view_if_needed()
     for img in block.locator('img').all():img.evaluate('async el=>await el.decode()')
     block.screenshot(path=str(OUT/f'green-reference-{name}.png'))
   p.close()
  # The guide uses screenshots of the tested implementation, never a mock UI.
  template=(R/'docs/developer-style-v2/style-guide.html').read_text()
  for path in OUT.glob('green-*.png'):
   template=template.replace('{{'+path.stem+'}}','data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode())
  template=template.replace('{{source-status}}','Live-site examples' if BASE=='https://www.nutrition.fitness' else 'Tested-build examples')
  template=template.replace('{{source-commit}}',os.getenv('GITHUB_SHA','local-build'))
  template=template.replace('{{source-url}}',BASE)
  assert '{{green-' not in template, 'Missing guide screenshot'
  doc=ctx.new_page();doc.set_viewport_size({'width':1000,'height':1300});doc.set_content(template,wait_until='networkidle')
  doc.evaluate('async()=>await document.fonts.ready')
  loaded=doc.evaluate('Array.from(document.fonts).filter(f=>f.status==="loaded").map(f=>f.family)')
  ok('Developer guide uses actual DM Sans and Kalam',any('DM Sans' in x for x in loaded) and any('Kalam' in x for x in loaded))
  for n,page in enumerate(doc.locator('.page').all(),1):
   page.screenshot(path=str(OUT/f'green-guide-page-{n}.png'))
   ok(f'Developer guide page {n} clears its footer',page.evaluate('el=>{const f=el.querySelector(".footer").getBoundingClientRect();return [...el.children].filter(c=>!c.classList.contains("footer")).every(c=>c.getBoundingClientRect().bottom<=f.top-4)}'))
  doc.pdf(path=str(OUT/'Nutrition-Fitness-Visual-Style-Guide-v2.pdf'),print_background=True,prefer_css_page_size=True)
  (OUT/'Nutrition-Fitness-Visual-Style-Guide-v2.html').write_text(template)
  ok('No unhandled JavaScript errors',not errors)
 finally:
  (OUT/'finder-green-browser.json').write_text(json.dumps({'baseURL':BASE,'passed':len(checks),'checks':checks,'errors':errors},indent=2))
  b.close()
