"""Real HTTP shop packshot/layout regression at common mobile, tablet and desktop widths."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, hashlib
R=Path(__file__).resolve().parents[1];OUT=R/'test-results';OUT.mkdir(exist_ok=True)
checks=[]
original_png_hashes={
 'plain-whey':'1c3fc226d8f39a42a6e28b6389e8e16556bb3fd025efa8a420c1235d7e904ec7',
 'creatine':'0c1f3f70b00ed2c38a10732da9f3b570437e653221202c0f39459fde1657395c',
 'electrolytes':'774b2c25cb5263142643afda60f1d944d91b42a5b5fc779a0f5cbda834b4725b',
 'magnesium':'635c3608f1952521ee87268cd6caf2b87c2c7101112cd84ed2750b069f418e16',
 'd3':'dc9bfb3fe49718d872297b3455b2fa2cc319c8b2c75903ea195ec35fb6b8c55f',
 'collagen':'de29bb812e7d76e9fd88d9b8378813dc933980ad5cde497561e21dda440d6140',
 'omega3':'618a4e118eff4a618dfba45cb48aef9f32ba52ea17d6751bc053cbe1e9366c93',
 'fibre':'9810a617309d18a7ec4e5cdb434999abbade1ebf76820835df669e48f40558b9',
 'vitaminc':'78d8d96640e4404df5e105de4dca9e5708f8857c5f8800f7274a3fc13aa67af4',
 'zinc':'8bef185f4869c5aa49affdbaa5accb87c14e8b39701732b7604378688c20032f',
}
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
  assert page.locator('#supplement-range .product-photo img[src*="/original-"]').count()==10
  packshot_dimensions=page.locator('#supplement-range .product-photo img').evaluate_all('(images)=>images.map(i=>[i.naturalWidth,i.naturalHeight])')
  assert len(packshot_dimensions)==10 and all(p==[1400,1400] for p in packshot_dimensions),f'Expected ten unchanged 1400px original PNGs, received {packshot_dimensions}'
  if width==390:
   for product,expected_sha in original_png_hashes.items():
    response=page.request.get('http://127.0.0.1:4173/assets/products/original-'+product+'.png')
    assert response.ok,f'Original standalone product PNG missing: {product}'
    actual_sha=hashlib.sha256(response.body()).hexdigest()
    assert actual_sha==expected_sha,f'Original standalone product PNG bytes were modified: {product}'
   checks.append('All ten product-only PNGs match the exact original archived image checksums')
  assert page.locator('#flavour-range .product-photo img[src*="/shot-"]').count()==10
  assert page.locator('#flavour-range .product-photo').count()==10
  actual=page.locator('#supplement-range .shop-range-grid').evaluate('(g)=>getComputedStyle(g).gridTemplateColumns.split(" ").length')
  assert actual==columns, f'Expected {columns} product columns, got {actual} at {width}px'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Horizontal overflow at {width}px'
  product_fit=page.locator('#supplement-range .product-photo img').first.evaluate('(i)=>({fit:getComputedStyle(i).objectFit,src:i.currentSrc})')
  assert product_fit['fit']=='contain' and '/original-' in product_fit['src'],f'Expected standalone product-only packshot at {width}px'
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
