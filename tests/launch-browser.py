"""Offline UI checks using the generated site, not a deployed CRM/network test.
Requires Python playwright and Chromium. Own local assets/modules are embedded in
memory because local browser navigation can be restricted in the build sandbox.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, re, base64, mimetypes, os
R=Path(__file__).resolve().parents[1]
results=[]
def ok(name,value):
    if not value: raise AssertionError(name)
    results.append(name)
with sync_playwright() as w:
 b=w.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 p=b.new_page(viewport={'width':1440,'height':1000});errors=[]
 def inline_page(route):
  global p
  vp=p.viewport_size;p.close();p=b.new_page(viewport=vp);p.set_default_timeout(5000)
  p.on('pageerror',lambda e:errors.append(str(e)))
  d=R/'dist';file=d/(route.strip('/')+'/index.html' if route!='/' else 'index.html');html=file.read_text()
  def data(path):return 'data:'+(mimetypes.guess_type(str(path))[0] or 'application/octet-stream')+';base64,'+base64.b64encode(path.read_bytes()).decode()
  cache={}
  def module(path):
   path=path.resolve()
   if path in cache:return cache[path]
   code=path.read_text()
   code=re.sub(r"from ['\"](\.[^'\"]+)['\"]",lambda m:"from '"+module(path.parent/m[1])+"'",code)
   uri='data:text/javascript;base64,'+base64.b64encode(code.encode()).decode();cache[path]=uri;return uri
  html=re.sub(r'<link[^>]+>',lambda m:'<style>'+(d/re.search(r'href="([^"]+)"',m[0])[1].lstrip('/')).read_text()+'</style>' if 'rel="stylesheet"' in m[0] and 'href="/' in m[0] else '',html)
  html=re.sub(r'<script type="module" src="([^"]+)"></script>',lambda m:'<script type="module" src="'+module(d/m[1].lstrip('/'))+'"></script>',html)
  html=re.sub(r'src="(/assets/[^"]+)"',lambda m:'src="'+data(d/m[1].lstrip('/'))+'"',html)
  p.set_content(html,wait_until='load');p.wait_for_timeout(400)
 inline_page('/')
 ok('Preview bar removed from document',p.locator('.preview-bar').count()==0)
 ok('Homepage headline unchanged','Getting fit is' in p.locator('#hero-heading').inner_text())
 ok('Homepage white',p.locator('body').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(255, 255, 255)')
 ok('Countdown rendered',p.locator('[data-days]').inner_text()!='—')
 ok('No desktop horizontal overflow',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 inline_page('/get-started/')
 p.locator('[data-next]').click();ok('Required question validation',p.locator('.finder-error').is_visible())
 selections=['foundation','returning',['weights','bodyweight'],'3','30',['arms','chest','shoulders'],'consistency']
 for values in selections:
  for value in values if isinstance(values,list) else [values]:p.locator(f'input[value="{value}"]').check()
  p.locator('[data-next]').click()
 ok('Correct multi-focus result',p.locator('.finder-result h2').inner_text()=='core.arms.chest.shoulders')
 ok('Optional marketing unchecked',not p.locator('[name=marketing]').is_checked())
 p.locator('[data-base]').select_option('build')
 ok('Authoritative user override',p.locator('.finder-result h2').inner_text()=='build.arms.chest.shoulders')
 p.locator('#claim-name').fill('Test');p.locator('#claim-email').fill('test@example.com')
 p.locator('#launch-claim button[type=submit]').click();p.wait_for_selector('[data-claim-error]:not([hidden])')
 ok('Missing integration never pretends to save',p.locator('[data-claim-error]').is_visible() and p.locator('.finder-success').count()==0)
 for width in [390,760,1024,1280]:
  p.set_viewport_size({'width':width,'height':844});inline_page('/')
  ok(f'No homepage overflow {width}px',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  if width>760:ok(f'No hamburger above mobile breakpoint {width}px',not p.locator('.menu-toggle').is_visible())
 p.set_viewport_size({'width':390,'height':844});inline_page('/get-started/')
 ok('Quiz mobile no overflow',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 ok('No JavaScript runtime errors',not errors)
 b.close()
print(json.dumps({'passed':len(results),'checks':results},indent=2))
(R/'tests/launch-browser-results.json').write_text(json.dumps({'passed':len(results),'checks':results},indent=2))
