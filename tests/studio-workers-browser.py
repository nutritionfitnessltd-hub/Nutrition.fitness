"""Verify archive selection, suggestions, override and durable request readback in an isolated fixture."""
import os, subprocess, time, urllib.request, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
BASE='http://127.0.0.1:4299'
env={**os.environ,'STUDIO_TEST_PORT':'4299'}
server=subprocess.Popen(['node','tests/studio-preview.mjs'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL)
try:
 for _ in range(50):
  try: urllib.request.urlopen(BASE+'/content-library/?work=1&studio=create'); break
  except Exception: time.sleep(.2)
 with sync_playwright() as pw:
  options={'headless':True}
  if os.environ.get('CHROMIUM_PATH'): options['executable_path']=os.environ['CHROMIUM_PATH']
  browser=pw.chromium.launch(**options)
  page=browser.new_page(viewport={'width':1440,'height':1000})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+'/content-library/?work=1&studio=create')
  page.get_by_role('button',name='Imogen suggested A challenge Turn an original into a clear challenge and daily activities.',exact=True).click()
  page.get_by_role('button',name='Use this original',exact=True).click()
  expect(page.get_by_role('heading',name='Make it your own')).to_be_visible()
  expect(page.locator('[name=output_challenge]')).to_have_value('yes')
  page.get_by_text('Add related content (optional)',exact=True).click()
  page.locator('[name=output_newsletter]').check()
  page.locator('[name=output_socials]').check()
  page.get_by_label('What would you like them to do?',exact=True).fill('Use this as a friendly introduction to the challenge.')
  page.get_by_role('button',name='Next: review plan',exact=True).click()
  expect(page.get_by_label('Worker for Newsletter',exact=True)).to_have_value('nina')
  expect(page.get_by_label('Worker for Challenge structure',exact=True)).to_have_value('imogen')
  expect(page.get_by_label('Worker for Social posts',exact=True)).to_have_value('rory')
  page.get_by_label('Worker for Newsletter',exact=True).select_option('imogen')
  page.screenshot(path=str(OUT/'studio-worker-brief-desktop.png'),full_page=True)
  page.get_by_role('button',name='Save plan to dashboard',exact=True).click()
  expect(page.get_by_text('Saved request \u00b7 not sent',exact=True)).to_be_visible()
  expect(page.locator('.studio-list li').filter(has_text='Newsletter')).to_contain_text('Imogen')
  saved_url=page.url;page.reload()
  expect(page.get_by_text('Use this as a friendly introduction to the challenge.',exact=True)).to_be_visible()
  for width in [390,1440]:
   page.set_viewport_size({'width':width,'height':950})
   for route in [BASE+'/content-library/?work=1&studio=create',BASE+'/content-library/?work=1&studio=builder',BASE+'/content-library/?work=1&studio=builder&build=challenge&source=catalogue%3Achallenge',saved_url]:
    page.goto(route)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),route
   page.screenshot(path=str(OUT/f'studio-worker-request-{width}.png'),full_page=True)
  page.goto(BASE+'/content-library/?work=1&studio=library&view=all')
  expect(page.get_by_role('link',name='Six-week challenge',exact=True)).to_have_count(0)
  assert not errors,errors
  browser.close()
 print(json.dumps({'passed':True,'checks':['Archive collection selection','Suggested outputs and Nina/Imogen/Rory routing','Worker override preserved through save and refresh','Saved request excluded from content drafts','Desktop and mobile layouts','No browser errors']}))
finally:
 server.terminate();server.wait(timeout=10)
