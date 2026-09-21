"""Browser acceptance over HTTP in CI, plus offline layout checks where navigation is restricted.
No real contact, account, payment or entitlement is created. Test values are explicitly entered.
"""
import base64,json,mimetypes,os,re,sys,time
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];D=R/'dist';OUT=R/'test-results';OUT.mkdir(exist_ok=True)
OFFLINE='--offline' in sys.argv
checks=[];errors=[];storage={}
def ok(name,value=True):
 if not value:raise AssertionError(name)
 checks.append(name);print("PASS",name,flush=True)
with sync_playwright() as w:
 launch={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):launch['executable_path']=os.environ['CHROMIUM_PATH']
 elif Path('/usr/bin/chromium').exists():launch['executable_path']='/usr/bin/chromium'
 b=w.chromium.launch(**launch);ctx=b.new_context(viewport={'width':1440,'height':1050});p=ctx.new_page();p.set_default_timeout(7000)
 def capture_storage():
  global storage
  storage=p.evaluate('Object.fromEntries(Object.keys(localStorage).filter(k=>typeof localStorage[k]!=="function").map(k=>[k,localStorage.getItem(k)]))')
 def goto(route,width=None):
  global p
  if width:p.set_viewport_size({'width':width,'height':1000 if width>760 else 844})
  if not OFFLINE:
   p.goto('http://127.0.0.1:4173'+route);p.wait_for_timeout(150);return
  vp=p.viewport_size
  p.close();p=ctx.new_page();p.set_viewport_size(vp);p.set_default_timeout(7000);p.on('pageerror',lambda e:errors.append(str(e)))
  search=urlsplit(route).query;pathname=urlsplit(route).path
  f=D/('index.html' if pathname=='/' else pathname.strip('/')+'/index.html');html=f.read_text();cache={}
  def data(path):return 'data:'+(mimetypes.guess_type(str(path))[0]or'application/octet-stream')+';base64,'+base64.b64encode(path.read_bytes()).decode()
  def module(path):
   path=path.resolve()
   if path in cache:return cache[path]
   code=path.read_text().replace('new URLSearchParams(location.search)',f'new URLSearchParams({json.dumps("?"+search)})')
   # Offline harness captures navigation; CI exercises unmodified real URL navigation.
   code=code.replace('const go=url=>{location.href=url;};','const go=url=>{globalThis.__nextURL=url;};')
   code=re.sub(r"from ['\"](\.[^'\"]+)['\"]",lambda m:"from '"+module(path.parent/m[1])+"'",code)
   uri='data:text/javascript;base64,'+base64.b64encode(code.encode()).decode();cache[path]=uri;return uri
  html=re.sub(r'<link[^>]+>',lambda m:'<style>'+(D/re.search(r'href="([^"]+)"',m[0])[1].lstrip('/')).read_text()+'</style>'if 'rel="stylesheet"' in m[0] and 'href="/'in m[0]else'',html)
  html=re.sub(r'<script type="module" src="([^"]+)"></script>',lambda m:'<script type="module" src="'+module(D/m[1].lstrip('/'))+'"></script>',html)
  html=re.sub(r'src="(/assets/[^"]+)"',lambda m:'src="'+data(D/m[1].lstrip('/'))+'"',html)
  # Dynamic images are fulfilled from the runtime file map. No network is used.
  dynamic=set(re.findall(r'"image":\s*"(/assets/[^"]+)"',(D/'recipes-data.mjs').read_text()));images={name:data(D/name.lstrip('/')) for name in dynamic}
  init=f'''<script>const initial={json.dumps(storage)};const mem={{...initial}};Object.defineProperty(window,'localStorage',{{value:{{getItem:k=>mem[k]??null,setItem:(k,v)=>{{mem[k]=String(v);Object.defineProperty(localStorage,k,{{value:String(v),configurable:true,enumerable:true,writable:true}});}},removeItem:k=>{{delete mem[k];delete localStorage[k]}},clear:()=>{{for(const k of Object.keys(mem)){{delete mem[k];delete localStorage[k]}}}}}}}});for(const k of Object.keys(mem))Object.defineProperty(localStorage,k,{{value:mem[k],enumerable:true,configurable:true,writable:true}});Object.defineProperty(window,'sessionStorage',{{value:localStorage}});window.fetch=async()=>new Response(JSON.stringify({{error:'Offline test: no live service is connected'}}),{{status:503}});window.__images={json.dumps(images)};new MutationObserver(()=>{{document.querySelectorAll('img[src^="/assets/"]').forEach(i=>{{if(__images[i.getAttribute('src')])i.src=__images[i.getAttribute('src')]}})}}).observe(document,{{subtree:true,childList:true}});</script>'''
  html=html.replace('<head>','<head>'+init)
  p.set_content(html,wait_until='load');p.wait_for_timeout(250)
 def follow():
  if OFFLINE:
   p.wait_for_timeout(100);
   if not p.evaluate('globalThis.__nextURL||null'):print('SAVE DEBUG',p.locator('body').inner_text()[-4000:],errors,flush=True)
   p.wait_for_function('globalThis.__nextURL');route=p.evaluate('globalThis.__nextURL');capture_storage();goto(route)
  else:p.wait_for_url(re.compile(r'.*/meal-planner/.*'));p.wait_for_timeout(100)
 def persisted():return p.evaluate("JSON.parse(localStorage.getItem('nufi-food-v1:guest')).state")
 def snap(name,full_page=True):p.screenshot(path=str(OUT/name),full_page=full_page)
 p.on('pageerror',lambda e:errors.append(str(e)))
 p.on('dialog',lambda d:d.accept())
 goto('/recipes/')
 manifest=json.loads((R/'data/cookbooks/website-catalogue-manifest.json').read_text())
 expected_recipes=manifest['recipes']
 ok('Complete source-backed recipe catalogue loads',p.locator('[data-recipe-grid] .food-card').count()==expected_recipes)
 ok('Recipe browsing has no source-book selector',p.locator('[data-recipe-book]').count()==0)
 p.locator('[data-recipe-search]').fill('tropical overnight');ok('Recipe search filters',p.locator('[data-recipe-grid] .food-card').count()==1)
 p.locator('[data-recipe-search]').fill('');p.locator('[data-recipe-category]').select_option('Dinner');ok('Meal filter works',p.locator('[data-recipe-grid] .food-card').count()==manifest['categories']['Dinner'])
 p.locator('[data-recipe-category]').select_option('');snap('recipes-desktop.png',full_page=False)
 goto('/recipes/tropical-overnight-oats/')
 p.locator('[data-recipe-yield]').fill('2');p.locator('[data-recipe-yield]').dispatch_event('change')
 ok('Recipe portions scale oats to 110g','110' in p.locator('[data-ingredients]').inner_text())
 ok('Per-serving protein stays 29g','29g' in p.locator('.food-nutrition').inner_text())
 p.locator('[data-ingredient="0"]').check();ok('Ingredient checkbox works',p.locator('[data-ingredient="0"]').is_checked())
 p.locator('[data-favourite]').first.click();ok('Favourite persists',persisted()['favourites']==['tropical-overnight-oats'])
 if OFFLINE:capture_storage()
 goto('/meal-planner/add/?recipe=tropical-overnight-oats')
 date=p.locator('[name=date]').input_value();p.locator('[name=servings]').fill('2');p.locator('[data-meal-form] button[type=submit]').click();follow()
 ok('Meal added and restored across pages',p.locator('.planned-meal').count()==1)
 ok('No invented targets',persisted()['onboarding']is None)
 ok('Remaining hero empty until onboarding',p.locator('.macro-cell strong').first.inner_text()=='—')
 entry=persisted()['plans'][0]['entries'][0]['id']
 if OFFLINE:capture_storage()
 goto('/shopping-list/');ok('Shopping list derived from plan','110' in p.locator('.shopping-layout').inner_text())
 p.locator('[data-shop-key]').first.check();ok('Shopping checklist persists',len(persisted()['shopping']['checked'])==1)
 if OFFLINE:capture_storage()
 goto('/onboarding/');p.locator('[name=sourceNote]').fill('QA test targets entered explicitly')
 for k,v in {'protein':'150','calories':'2000','carbs':'220','fat':'65'}.items():p.locator('[name='+k+']').fill(v)
 p.locator('[name=confirmed]').check();p.locator('[data-onboarding] button').first.click();follow()
 if OFFLINE:capture_storage()
 goto('/meal-planner/log/?entry='+entry);p.locator('[name=servings]').fill('0.5');p.locator('[data-log-form] button').click();follow()
 ok('Actual food logging',len(persisted()['logs'])==1 and persisted()['logs'][0]['servings']==0.5)
 ok('Remaining protein reconciles actual portion','135.5' in p.locator('.macro-grid').inner_text())
 if OFFLINE:capture_storage()
 goto('/recipe-edit/?recipe=tropical-overnight-oats');p.locator('[data-i=quantity]').first.fill('65');p.locator('[data-recipe-editor] .button').click()
 if OFFLINE:
  p.wait_for_function('globalThis.__nextURL');capture_storage();goto(p.evaluate('globalThis.__nextURL'))
 else:p.wait_for_url('**/recipes/tropical-overnight-oats/')
 ok('Ingredient edit invalidates source macros',persisted()['overrides'][0]['nutritionStatus']=='review-needed')
 ok('Historical food retained after recipe edit',persisted()['logs'][0]['nutrition']['protein']==14.5)
 if OFFLINE:capture_storage()
 goto('/meal-planner/?date='+date);ok('Logged snapshot still reconciles after recipe edit','135.5' in p.locator('.macro-grid').inner_text());snap('planner-desktop.png')
 if OFFLINE:capture_storage()
 goto('/meal-planner/manage/');p.get_by_role('button',name='Copy this meal plan',exact=True).click();p.locator('[data-copy-plan] [name=name]').fill('QA copied plan');p.locator('[data-copy-plan] button').click();follow()
 ok('Plan duplicated without duplicating food logs',len(persisted()['plans'])==2 and len(persisted()['logs'])==1)
 if OFFLINE:capture_storage()
 goto('/programmes/core/');p.get_by_role('button',name='Choose my focus',exact=True).click();p.locator('[data-system-base] input[value=arms]').check();p.locator('[data-system-base] input[value=shoulders]').check()
 ok('Compatible multiple programme focuses',p.locator('[data-system-result]').inner_text()=='core.arms.shoulders')
 goto('/courses/core/lesson-1/');p.locator('[data-complete-lesson]').check();ok('Course reading progress saves',len(persisted()['lessonProgress'])==1)
 if OFFLINE:capture_storage()
 for route in ['/','/recipes/','/meal-planner/?date='+date,'/shopping-list/','/programmes/','/courses/','/shop/','/account/']:
  goto(route,390)
  ok('Mobile no overflow '+route,p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  p.evaluate('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>null)}))')
  ok('No broken photos '+route,p.evaluate('[...document.images].filter(i=>i.getAttribute("src")).every(i=>i.complete&&i.naturalWidth>0)'))
  if route=='/recipes/':snap('recipes-mobile.png',full_page=False)
  if route.startswith('/meal-planner/'):snap('planner-mobile.png')
  if route=='/shop/':snap('shop-mobile.png')
 goto('/programmes/',1440);snap('programmes-desktop.png')
 goto('/shop/');ok('Nine actual product-image files rendered',p.locator('.product-image-link .product-photo').count()>=9);snap('shop-desktop.png')
 goto('/account/');ok('Unconfigured login cannot fake registration',p.locator('[data-send-code] button').is_disabled())
 ok('No unhandled JavaScript errors',not errors)
 b.close()
report={'mode':'offline-in-memory'if OFFLINE else 'http-browser','passed':len(checks),'checks':checks,'errors':errors}
(OUT/('offline-browser.json'if OFFLINE else 'http-browser.json')).write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
