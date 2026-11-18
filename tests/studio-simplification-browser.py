"""Exercise edits and checking against the in-memory studio fixture, never production."""
import os, subprocess, time, urllib.request, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
BASE='http://127.0.0.1:4298'
server=subprocess.Popen(['node','tests/studio-preview.mjs'],cwd=ROOT,stdout=subprocess.DEVNULL)
checks=[]
try:
 for _ in range(50):
  try: urllib.request.urlopen(BASE); break
  except Exception: time.sleep(.2)
 with sync_playwright() as pw:
  options={'headless':True}
  if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
  browser=pw.chromium.launch(**options)
  context=browser.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'])
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def goto(query):page.goto(BASE+'/content-library/?work=1&'+query,wait_until='networkidle')
  goto('studio=item&id=training:copy')
  expect(page.get_by_label('Where it will be used',exact=True)).not_to_be_visible()
  expect(page.get_by_label('Content',exact=True)).to_be_visible()
  expect(page.get_by_role('button',name='Stronger programme cover',exact=True)).to_be_visible()
  page.screenshot(path=str(OUT/'studio-simple-editor-desktop.png'),full_page=True)
  page.get_by_role('button',name='Stronger programme cover',exact=True).click()
  expect(page.get_by_role('dialog')).to_be_visible()
  page.get_by_label('Search by name').fill('Stronger')
  page.get_by_role('dialog').get_by_role('button',name='Stronger programme cover',exact=True).click()
  expect(page.get_by_role('dialog')).to_have_count(0)
  page.get_by_label('Content',exact=True).fill('Current text saved and checked in one action.')
  page.get_by_role('button',name='Save & mark checked',exact=True).click()
  expect(page.locator('.studio-status').first).to_have_text('Checked')
  expect(page.locator('.studio-content-preview')).to_contain_text('Current text saved and checked in one action.')
  checks.append('Named file picker and atomic save-and-check')
  page.get_by_role('link',name='Edit content',exact=True).click()
  page.get_by_label('Content',exact=True).fill('')
  page.get_by_label('Headline',exact=True).fill('')
  page.get_by_role('button',name='Save & mark checked',exact=True).click()
  expect(page.get_by_role('alert')).to_be_visible()
  expect(page.get_by_label('Content',exact=True)).to_have_value('')
  expect(page.locator('[data-editor-status]')).to_have_text('Unsaved changes')
  page.on('dialog',lambda dialog:dialog.accept())
  checks.append('Failed checking retains unsaved edits')
  goto('studio=new&kind=campaign')
  page.get_by_label('Title',exact=True).fill('Created in one screen')
  page.get_by_label('Headline',exact=True).fill('New headline')
  page.get_by_label('Content',exact=True).fill('New content written before the first save.')
  page.get_by_role('button',name='Save & preview',exact=True).click()
  expect(page.locator('.studio-content-preview')).to_contain_text('New content written before the first save.')
  checks.append('Create and write content in one screen')
  goto('studio=item&id=training:lesson-two&tab=preview')
  expect(page.locator('.studio-video-tools')).to_contain_text('Video length: 2:05')
  page.get_by_role('button',name='Copy script',exact=True).click()
  expect(page.locator('[data-copy-status]')).to_have_text('Script copied')
  assert page.evaluate('navigator.clipboard.readText()')=='This is the recorded narration.'
  expect(page.locator('[data-script-text]')).not_to_be_visible()
  checks.append('Script copies without displaying narration; actual duration shown')
  goto('studio=item&id=training:course')
  lessons=page.locator('.studio-list a').all_text_contents()
  assert lessons[:2]==['Second lesson','First lesson'],lessons
  checks.append('Stored lesson order is retained')
  for width in [390,1440]:
   page.set_viewport_size({'width':width,'height':900})
   for query in ['studio=library','studio=create','studio=projects','studio=import','studio=item&id=training:copy&tab=edit']:
    goto(query)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),query
   page.screenshot(path=str(OUT/f'studio-simple-editor-{width}.png'),full_page=True)
   for route in ['/recipes/','/knowledge-centre/']:
    page.goto(BASE+route,wait_until='networkidle')
    field=page.locator('[data-recipe-search]' if route=='/recipes/' else '#kc-query')
    expect(field).to_be_visible()
    assert field.bounding_box()['y']<900
    assert page.locator('.launch-banner:visible').count()==0
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.screenshot(path=str(OUT/(route.strip('/')+f'-simple-{width}.png')))
  checks.append('Desktop and phone layouts fit; browsing search is visible immediately')
  assert not errors,errors
  (OUT/'studio-simplification.json').write_text(json.dumps({'checks':checks,'errors':errors},indent=2))
  print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
  browser.close()
finally:
 server.terminate();server.wait(timeout=10)
