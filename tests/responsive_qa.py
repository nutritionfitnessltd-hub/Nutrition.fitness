"""Measure layouts and produce screenshots from the portable review (no live network)."""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
checks=[];errors=[]
widths=[320,390,768,1024,1440]
pages=['/','/nufi/','/programmes/','/programmes/build/','/courses/','/courses/nutrition-foundations/','/shop/','/shop/plain-whey/','/shop/shot-vanilla/','/subscriptions/','/get-started/','/coaches/','/recipes/','/contact/','/site-map/']
with sync_playwright() as w:
 b=w.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 p=b.new_page(viewport={'width':1440,'height':1000});p.set_default_timeout(4000)
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content((R/'nutrition-fitness-review.html').read_text(),wait_until='load')
 for width in widths:
  p.set_viewport_size({'width':width,'height':1000})
  for url in pages:
   p.evaluate('(u)=>nfNavigate(u)',url);p.wait_for_timeout(90);f=p.frames[1]
   result=f.evaluate('''()=>({width:innerWidth,body:document.body.scrollWidth,doc:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&((r.right>innerWidth+1)||(r.left < -1))&&getComputedStyle(e).position!=='absolute'}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,left:e.getBoundingClientRect().left}))})''')
   checks.append({'url':url,'width':width,'pass':result['doc']<=result['width']+1,'details':result})
 print('Responsive results',sum(c['pass'] for c in checks),'/',len(checks))
 for fail in [c for c in checks if not c['pass']]:print(json.dumps(fail))
 (R/'tests/responsive-results.json').write_text(json.dumps({'checks':checks,'runtimeErrors':errors},indent=2))
 shots=[('/',1440,'homepage-desktop'),('/shop/',1440,'shop-desktop'),('/nufi/',1440,'nufi-desktop'),('/subscriptions/',1440,'subscription-builder-desktop'),('/courses/nutrition-foundations/',1440,'course-desktop'),('/',390,'homepage-mobile'),('/shop/',390,'shop-mobile'),('/subscriptions/',390,'subscription-builder-mobile')]
 (R/'docs/previews').mkdir(exist_ok=True)
 for url,width,name in shots:
  p.set_viewport_size({'width':width,'height':1000});p.evaluate('(u)=>nfNavigate(u)',url);p.wait_for_timeout(200);f=p.frames[1]
  height=f.evaluate('document.documentElement.scrollHeight')
  p.set_viewport_size({'width':width,'height':height+60});p.wait_for_timeout(80)
  p.locator('#review').screenshot(path=str(R/'docs/previews'/f'{name}.png'))
  print('Screenshot',name,width,height)
 b.close()
