"""Real HTTP acceptance for modal forms. All API requests are intercepted;
no live contact, reservation, account, CRM or payment write is made.
"""
import json, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
R=Path(__file__).resolve().parents[1]; OUT=R/'test-results'; OUT.mkdir(exist_ok=True)
BASE=os.environ.get('NUFI_TEST_BASE_URL','http://127.0.0.1:4173').rstrip('/')
checks=[]; errors=[]; leads=[]
def ok(name, value=True):
 if not value: raise AssertionError(name)
 checks.append(name); print('PASS',name,flush=True)
with sync_playwright() as w:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_PATH'): opts['executable_path']=os.environ['CHROMIUM_PATH']
 elif Path('/usr/bin/chromium').exists(): opts['executable_path']='/usr/bin/chromium'
 browser=w.chromium.launch(**opts)
 ctx=browser.new_context(viewport={'width':1440,'height':1000})
 def api(route):
  if '/api/leads' in route.request.url:
   leads.append(route.request.post_data_json)
   route.fulfill(status=200,content_type='application/json',body='{"status":"reserved"}')
  else: route.fulfill(status=503,content_type='application/json',body='{"error":"QA: integration intentionally unavailable"}')
 ctx.route('**/api/**',api)
 p=ctx.new_page();p.set_default_timeout(12000);p.on('pageerror',lambda e:errors.append(str(e)))
 def goto(path):
  p.goto(BASE+path);p.wait_for_function('document.documentElement.dataset.nfFormModals==="ready"')
 def closed(): expect(p.locator('dialog[open]')).to_have_count(0)
 def close():
  p.locator('dialog[open] .nf-form-close').click();closed();p.wait_for_timeout(120)
 def frame():
  f=p.frame_locator('dialog[open] iframe');expect(f.locator('html')).to_have_class('nf-modal-embedded');return f
 try:
  goto('/?utm_source=modal-qa&utm_campaign=launch')
  initial=p.url;p.locator('.hero-button').click();f=frame()
  ok('Programme quiz opens over the current page',p.url==initial)
  expect(p.locator('dialog[open]')).to_have_count(1)
  expect(f.locator('.launch-banner')).not_to_be_visible()
  expect(f.locator('.site-header')).not_to_be_visible()
  f.locator('[data-next]').click();expect(f.locator('.finder-error')).to_be_visible()
  ok('Existing required-answer validation works inside modal')
  f.locator('input[value=foundation]').check();f.locator('[data-next]').click()
  close();expect(p.locator('.hero-button')).to_be_focused()
  p.locator('.hero-button').click();f=frame();expect(f.locator('.finder-progress-row')).to_contain_text('Question 2')
  ok('Closing and reopening preserves quiz answers and restores focus')
  f.locator('input[value=returning]').check();f.locator('[data-next]').click()
  f.locator('[data-next]').focus();p.keyboard.press('Escape');closed();p.wait_for_timeout(120)
  ok('Escape works from inside the quiz frame')
  p.locator('.hero-button').click();f=frame();expect(f.locator('.finder-progress-row')).to_contain_text('Question 3')
  p.go_back();closed();p.go_forward();expect(p.locator('dialog[open]')).to_have_count(1);f=frame()
  expect(f.locator('input[value=bodyweight]')).to_be_visible()
  ok('Browser Back closes and Forward restores the quiz without leaving the page')
  for values in [['bodyweight','weights'],['3'],['30'],['arms','chest','shoulders'],['consistency']]:
   for value in values:f.locator(f'input[value="{value}"]').check()
   f.locator('[data-next]').click()
  expect(f.locator('.finder-result h2')).to_have_text('core.arms.chest.shoulders')
  f.locator('#claim-name').fill('Modal QA');f.locator('#claim-email').fill('modal-qa@example.com')
  close();p.locator('.hero-button').click();f=frame()
  expect(f.locator('#claim-name')).to_have_value('Modal QA')
  expect(f.locator('[name=marketing]')).not_to_be_checked()
  f.locator('#launch-claim button[type=submit]').click();expect(f.locator('.finder-success')).to_be_visible()
  ok('All seven questions, recommendation and mocked reservation succeed',len(leads)==1)
  ok('Campaign attribution and optional consent are preserved',leads[0]['utm']['utm_source']=='modal-qa' and leads[0]['marketing'] is False)
  close()
  # Direct links are still valid entry points; only their presentation changes.
  goto('/get-started/');expect(p.locator('dialog[open]')).to_have_count(1)
  close();p.locator('.nf-form-trigger').click();expect(p.locator('[data-programme-finder]')).to_be_visible();close()
  ok('Direct programme-finder links also open in a modal')
  # Underlying contact form is explicitly a prepare-message preview, not a send API.
  goto('/');p.locator('a[href="/contact/"]').first.click();f=frame()
  f.locator('[name=message]').fill('Modal QA. Please do not send this test.')
  f.locator('#contact-form button[type=submit]').click();expect(f.locator('#contact-result')).to_be_visible()
  expect(f.locator('#prepared-message')).to_have_value(re.compile('Not sent automatically'))
  ok('Contact form keeps its honest prepared-not-sent behaviour');close()
  # Product options are moved, not recreated: values and handlers stay attached.
  goto('/shop/plain-whey/');expect(p.locator('#product-form')).not_to_be_visible()
  p.get_by_role('button',name='Choose options',exact=True).click()
  p.locator('[name=quantity]').fill('2');close()
  p.get_by_role('button',name='Choose options',exact=True).click();expect(p.locator('[name=quantity]')).to_have_value('2')
  p.locator('#product-form button[type=submit]').click()
  expect(p.locator('dialog[open] .nf-form-status')).to_contain_text('Added.')
  expect(p.locator('dialog[open] .nf-form-status a[href="/basket/"]')).to_be_visible()
  ok('Product quantities, add-to-basket handler and actionable feedback survive modal presentation');close()
  goto('/');p.locator('a[href="/subscriptions/"]').first.click();f=frame()
  expect(f.locator('#box-form')).to_be_visible();expect(f.locator('#box-summary')).to_be_visible()
  f.locator('#box-form button[type=submit]').click();expect(f.locator('.notification')).to_contain_text('Your box is in the basket')
  count=p.evaluate("JSON.parse(localStorage.getItem('nutrition-fitness-site-v2')).cart.reduce((sum,line)=>sum+line.qty,0)")
  close();expect(p.locator('.bag-count').first).to_have_text(str(count))
  ok('Subscription modal retains its price summary and refreshes the parent basket after a change')
  # Existing food controller navigates on success. That navigation must escape the frame.
  goto('/recipes/');p.locator('a[href="/meal-planner/add/?recipe=tropical-overnight-oats"]').first.click();f=frame()
  f.locator('[name=servings]').fill('2');f.locator('[data-meal-form] button[type=submit]').click()
  p.wait_for_url(re.compile(r'.*/meal-planner/(?:\?.*)?$'));expect(p.locator('.planned-meal')).to_have_count(1)
  ok('Meal add saves through existing controller and returns to the full planner page')
  goto('/meal-planner/manage/');expect(p.locator('[data-copy-plan]')).not_to_be_visible()
  p.get_by_role('button',name='Copy this meal plan',exact=True).click()
  p.locator('[data-copy-plan] [name=name]').fill('Modal QA copy');p.locator('[data-copy-plan] button').click()
  p.wait_for_url(re.compile(r'.*/meal-planner/(?:\?.*)?$'));ok('Dynamically rendered meal-plan forms work in modals')
  goto('/programmes/core/');p.get_by_role('button',name='Choose my focus',exact=True).click()
  p.locator('[data-system-base] input[value=arms]').check();p.locator('[data-system-base] input[value=shoulders]').check()
  expect(p.locator('[data-system-result]')).to_have_text('core.arms.shoulders');close()
  ok('Programme focus configuration retains its calculation')
  goto('/account/');expect(p.locator('dialog[open]')).to_have_count(1)
  expect(p.locator('[data-send-code]')).to_be_visible();expect(p.locator('[data-send-code] button')).to_be_disabled()
  ok('Account sign-in is grouped safely and cannot fake success when unavailable');close()
  goto('/knowledge-centre/');p.get_by_role('button',name='Open search',exact=True).click()
  p.locator('#kc-query').fill('protein');p.locator('.kc-search').evaluate('(form)=>form.requestSubmit()')
  closed();expect(p.locator('#kc-result-count')).not_to_contain_text('temporarily unavailable')
  p.get_by_role('button',name='Choose filters',exact=True).click()
  p.locator('#kc-filter-form input[type=checkbox]').first.check()
  p.get_by_role('button',name='Show results',exact=True).click();closed()
  ok('Knowledge Centre search and filters open in modals and retain results')
  for width in [390,768,1440]:
   p.set_viewport_size({'width':width,'height':844 if width==390 else 1000})
   goto('/');p.locator('.hero-button').click();f=frame();expect(f.locator('[data-next]')).to_be_visible()
   ok(f'No horizontal overflow at {width}px',p.evaluate('document.documentElement.scrollWidth<=innerWidth') and f.locator('html').evaluate('(el)=>el.scrollWidth<=innerWidth'))
   box=p.locator('dialog[open]').bounding_box()
   if width==390:ok('Mobile modal fills the screen',box['x']==0 and box['y']==0 and abs(box['width']-390)<1 and abs(box['height']-844)<1)
   p.screenshot(path=str(OUT/f'form-modal-{width}.png'))
   if width==1440:
    p.mouse.click(8,8);closed();p.wait_for_timeout(120);ok('Backdrop click closes desktop modal')
   else:close()
  ok('No unhandled JavaScript errors',not errors)
 except Exception:
  try:
   p.screenshot(path=str(OUT/'form-modal-failure.png'))
   diagnostic={'url':p.url,'frames':[]}
   for child in p.frames:
    diagnostic['frames'].append(child.evaluate('''() => ({url:location.href,body:document.body.outerHTML, ancestors:[...document.querySelectorAll('dialog,iframe,[data-nf-modal-path],[data-nf-modal-content],input[value=bodyweight]')].map(n=>({tag:n.tagName,cls:n.className,open:n.open,rect:n.getBoundingClientRect().toJSON(),display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility}))})'''))
   (OUT/'form-modal-failure.json').write_text(json.dumps(diagnostic,indent=2))
   print('MODAL FAILURE DIAGNOSTICS',json.dumps([{**x,'body':x['body'][:300]} for x in diagnostic['frames']]),flush=True)
  except Exception as diagnostic_error: print('Diagnostic capture failed:',str(diagnostic_error),flush=True)
  raise
 finally:
  (OUT/'form-modals-browser.json').write_text(json.dumps({'checks':checks,'errors':errors,'mocked_reservations':len(leads)},indent=2))
  if errors:print(errors,flush=True)
  browser.close()
