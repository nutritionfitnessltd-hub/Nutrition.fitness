"""Unmodified HTTP component geometry regression. Run after the preview server."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os
R=Path(__file__).resolve().parents[1];OUT=R/'test-results';OUT.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as p:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 elif Path('/usr/bin/chromium').exists():opts['executable_path']='/usr/bin/chromium'
 browser=p.chromium.launch(**opts)
 page=browser.new_page()
 for width in (390,760,1024,1440):
  page.set_viewport_size({'width':width,'height':1000})
  page.goto('http://127.0.0.1:4173/shop/')
  page.evaluate('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>null)}))')
  assert page.locator('.shop-arrangement .product-photo').count()==3
  inside=page.evaluate('''(()=>{const h=document.querySelector('.shop-arrangement').getBoundingClientRect();return [...document.querySelectorAll('.shop-arrangement .product-photo')].every(e=>{const b=e.getBoundingClientRect();return b.width>60&&b.height>60&&b.left>=h.left&&b.right<=h.right&&b.top>=h.top&&b.bottom<=h.bottom})})()''')
  separate=page.evaluate('''(()=>{const b=[...document.querySelectorAll('.shop-arrangement .product-photo')].map(e=>e.getBoundingClientRect());return b.every((a,i)=>b.slice(i+1).every(c=>a.right<=c.left||c.right<=a.left||a.bottom<=c.top||c.bottom<=a.top))})()''')
  assert inside, f'Packshot clipped at {width}px'
  assert separate,f'Packshots overlap at {width}px'
  checks.extend([f'Packshots fully visible at {width}px',f'No packshot overlap at {width}px'])
  if width in (390,1440):page.screenshot(path=str(OUT/f'shop-final-{width}.png'),full_page=True)
 browser.close()
report={'passed':len(checks),'checks':checks};(OUT/'packshots.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
