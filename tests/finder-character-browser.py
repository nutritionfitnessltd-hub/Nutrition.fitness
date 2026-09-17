"""Read-only visual/interaction acceptance. Isolated browser storage; all API
requests are mocked, including on the public-site run. Never submits real data.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
R=Path(__file__).resolve().parents[1]; OUT=R/'test-results'; OUT.mkdir(exist_ok=True)
BASE=os.environ.get('NUFI_TEST_BASE_URL','http://127.0.0.1:4173').rstrip('/')
checks=[]; errors=[]
NOTES=['Your goal.','No fitness CV required.','The spare room counts.','Real life gets a vote.','No two-hour gym epics.','A little extra love.','Life happens. We get it.']
def ok(name,value=True):
 if not value: raise AssertionError(name)
 checks.append(name);print('PASS',name,flush=True)
with sync_playwright() as w:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 elif Path('/usr/bin/chromium').exists():opts['executable_path']='/usr/bin/chromium'
 b=w.chromium.launch(**opts)
 ctx=b.new_context(reduced_motion='reduce')
 ctx.route('**/api/**',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"QA: no real submission"}'))
 p=None
 try:
  for width,height in [(320,740),(390,844),(640,900),(768,1000),(1024,768),(1440,1000)]:
   if p:p.close()
   p=ctx.new_page();p.set_viewport_size({'width':width,'height':height});p.on('pageerror',lambda e:errors.append(str(e)))
   p.goto(BASE+'/');p.wait_for_function('document.documentElement.dataset.nfFormModals==="ready"');p.locator('.hero-button').click()
   f=p.frame_locator('dialog[open] iframe');expect(f.locator('.finder-branded')).to_be_visible()
   expect(f.locator('.finder-free-note')).to_contain_text('Actually free.')
   expect(f.locator('.finder-option-art')).to_have_count(7)
   ok(f'Branded quiz opens with seven illustrated choices at {width}px')
   ok(f'No horizontal overflow at {width}px',p.evaluate('document.documentElement.scrollWidth<=innerWidth') and f.locator('html').evaluate('(el)=>el.scrollWidth<=innerWidth'))
   close=p.locator('dialog[open] .nf-form-close');expect(close).to_be_in_viewport()
   ok(f'Close button remains reachable at {width}px',close.bounding_box()['height']>=44)
   if width<=640:
    box=p.locator('dialog[open]').bounding_box();ok(f'Full-height mobile presentation at {width}px',abs(box['height']-height)<1)
   for opt in f.locator('.finder-option').all():
    ok(f'Answer touch target at least 44px ({width}px)',opt.bounding_box()['height']>=44)
   ok(f'Reduced motion respected at {width}px',f.locator('.finder-option').first.evaluate('(el)=>getComputedStyle(el).transitionDuration')=='0s')
   if width in (390,1440):
    # Wait for the existing web fonts before taking review screenshots.
    f.locator('html').evaluate('async()=>{await document.fonts.ready;}')
    p.screenshot(path=str(OUT/f'finder-character-{width}.png'))
    picks=['foundation','returning','bodyweight','3','30',None,'consistency']
    for step,value in enumerate(picks):
     expect(f.locator('.finder-doodle').filter(has_text=NOTES[step])).to_be_visible()
     expect(f.locator('.finder-progress')).to_have_attribute('aria-valuenow',str(step))
     expect(f.locator('.finder-progress .is-complete')).to_have_count(step)
     if value:
      opt=f.locator(f'input[value="{value}"]');opt.check();expect(opt).to_be_checked()
     if step==0 and width==1440:p.screenshot(path=str(OUT/'finder-character-selected.png'))
     if step==3:p.screenshot(path=str(OUT/f'finder-character-week-{width}.png'))
     f.locator('[data-next]').click()
    expect(f.locator('.finder-result h2')).to_have_text('core')
    expect(f.locator('.finder-result-note')).to_contain_text('Not a life sentence.')
    expect(f.locator('[name=marketing]')).not_to_be_checked()
    f.locator('[data-base]').select_option('build');expect(f.locator('.finder-result h2')).to_have_text('build')
    ok(f'All seven notes, honest progress, optional focus and authoritative override at {width}px')
    p.screenshot(path=str(OUT/f'finder-character-result-{width}.png'))
   close.click();expect(p.locator('dialog[open]')).to_have_count(0)
  ok('No unhandled JavaScript errors',not errors)
 except Exception:
  if p:p.screenshot(path=str(OUT/'finder-character-failure.png'))
  raise
 finally:
  (OUT/'finder-character-browser.json').write_text(json.dumps({'baseURL':BASE,'passed':len(checks),'checks':checks,'errors':errors},indent=2))
  b.close()
