"""Real HTTP shop packshot/layout regression at common mobile, tablet and desktop widths."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
R=Path(__file__).resolve().parents[1];OUT=R/'test-results';OUT.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as p:
 opts={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
 elif Path('/usr/bin/chromium').exists():opts['executable_path']='/usr/bin/chromium'
 browser=p.chromium.launch(**opts)
 for width,columns in ((390,2),(760,2),(1024,3),(1440,4)):
  page=browser.new_page(viewport={'width':width,'height':1000})
  page.goto('http://127.0.0.1:4173/shop/')
  page.evaluate('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>null)}))')
  assert page.locator('.shop-hero-v2-photo').count()==1
  assert page.locator('.shop-hero-shot-detail img').count()==1
  assert page.locator('.shop-story-photo-wrap img').count()==1
  artwork=page.evaluate("""(() => {
    const names=['.shop-hero-v2-photo','.shop-story-photo-wrap img'];
    return names.every(sel=>{
      const image=document.querySelector(sel);
      if(!image||!image.complete||!image.naturalWidth)return false;
      const frame=image.getBoundingClientRect();
      const displayedRatio=frame.width/frame.height;
      const realRatio=image.naturalWidth/image.naturalHeight;
      const fit=getComputedStyle(image).objectFit;
      return Math.abs(displayedRatio-realRatio)<0.035 && fit==='contain';
    });
  })()""")
  assert artwork,f'Full original campaign images must not be cropped at {width}px'
  assert page.locator('#supplement-range .product-photo').count()==10
  assert page.locator('#flavour-range .product-photo').count()==10
  actual=page.locator('#supplement-range .shop-range-grid').evaluate('(g)=>getComputedStyle(g).gridTemplateColumns.split(" ").length')
  assert actual==columns, f'Expected {columns} product columns, got {actual} at {width}px'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Horizontal overflow at {width}px'
  inside=page.evaluate('''(()=>{
   const hero=document.querySelector('.shop-hero-v2-media').getBoundingClientRect();
   const detail=document.querySelector('.shop-hero-shot-detail').getBoundingClientRect();
   return detail.width>80&&detail.height>80&&detail.left>=hero.left-1&&detail.right<=hero.right+1&&detail.top>=hero.top-1&&detail.bottom<=hero.bottom+1
  })()''')
  assert inside,f'Flavour-shot accent escapes hero at {width}px'
  checks.extend([f'{columns} well-spaced product columns at {width}px',f'Flavour-shot detail inside lifestyle hero at {width}px',f'No sideways scroll at {width}px'])
  if width in (390,1440):page.screenshot(path=str(OUT/f'shop-final-{width}.png'),full_page=True)
  page.close()
 browser.close()
report={'passed':len(checks),'checks':checks};(OUT/'packshots.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
