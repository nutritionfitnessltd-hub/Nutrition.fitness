"""Read-only catalogue/book acceptance checks; no account or customer writes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
MANIFEST = json.loads((ROOT / 'data/cookbooks/website-catalogue-manifest.json').read_text())
BASE = os.environ.get('NUFI_TEST_BASE_URL', 'http://127.0.0.1:4173').rstrip('/')
checks = []
def check(label, value):
    if not value: raise AssertionError(label)
    checks.append(label)
with sync_playwright() as p:
    opts = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'): opts['executable_path'] = os.environ['CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').exists(): opts['executable_path'] = '/usr/bin/chromium'
    browser = p.chromium.launch(**opts)
    page = browser.new_page(viewport={'width':1440,'height':1000})
    page.set_default_timeout(12000)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    def visit(path):
        resp=page.goto(BASE+path,wait_until='domcontentloaded')
        check('HTTP page '+path, resp is not None and resp.status==200)
        check('One banner on '+path,page.locator('.launch-banner').count()==1)
        page.wait_for_timeout(180)
    visit('/recipes/')
    page.wait_for_function("expected => document.querySelectorAll('[data-recipe-grid] .food-card').length===expected", arg=MANIFEST['recipes'])
    check('Complete recipe catalogue available', page.locator('[data-recipe-grid] .food-card').count()==MANIFEST['recipes'])
    check('Source book selector is removed',page.locator('[data-recipe-book]').count()==0)
    check('Ordinary browsing has no original-collection restriction',page.locator('[data-original-recipes]').is_hidden())
    check('Catalogue heading is about food, not source volumes','books' not in page.locator('.food-intro .lead').inner_text())
    check('Cards do not advertise old source volumes','Volume ' not in page.locator('[data-recipe-grid]').inner_text())
    for category,count in MANIFEST['categories'].items():
        page.locator('[data-recipe-category]').select_option(category)
        check(category+' filter matches catalogue', page.locator('[data-recipe-grid] .food-card').count()==count)
        check(category+' filter persists in URL','category='+category in page.url)
    page.locator('[data-recipe-category]').select_option('')
    page.locator('[data-recipe-search]').fill('vanilla berry')
    check('Recipes searchable by name',page.locator('[data-recipe-grid] .food-card').count()==1)
    page.locator('[data-recipe-search]').fill('zz-no-matching-recipe')
    check('Empty searches explain how to recover',page.locator('[data-no-recipes]').is_visible())
    page.locator('[data-recipe-search]').fill('')
    page.locator('[data-recipe-sort]').select_option('name')
    first_name=page.locator('[data-recipe-grid] .food-card h2').first.inner_text()
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('[data-recipe-sort]').value==='name'")
    check('A to Z ordering survives reload',page.locator('[data-recipe-grid] .food-card h2').first.inner_text()==first_name)
    page.locator('[data-recipe-sort]').select_option('protein')
    proteins=page.locator('[data-recipe-grid] .food-protein').evaluate_all("els=>els.map(el=>parseFloat(el.textContent))")
    check('Protein ordering uses descending source estimates',proteins==sorted(proteins,reverse=True))
    source_book=MANIFEST['books'][1]
    visit('/recipes/?book='+source_book['id']+'&category=Breakfast&q=avocado&sort=name')
    check('Retired source-book links remove obsolete restriction','book=' not in page.url)
    check('Retired links preserve useful meal and search filters',page.locator('[data-recipe-category]').input_value()=='Breakfast' and page.locator('[data-recipe-search]').input_value()=='avocado' and page.locator('[data-recipe-sort]').input_value()=='name')
    check('Retired links return matching food',page.locator('[data-recipe-grid] .food-card').count()>0)
    visit('/recipes/?book=high-protein-kitchen')
    check('Flagship links retain the original 100 recipes',page.locator('[data-recipe-grid] .food-card').count()==100)
    check('Original-collection restriction is clearly labelled',page.locator('[data-original-recipes]').is_visible() and 'Original 100 recipes' in page.locator('[data-original-recipes]').inner_text())
    visit('/recipes/?book=high-protein-kitchen&category=Breakfast')
    check('Book category links filter the library',page.locator('[data-recipe-grid] .food-card').count()==22)
    page.locator('[data-all-recipes]').click()
    check('Full-collection link removes original-only restriction',page.locator('[data-recipe-grid] .food-card').count()==MANIFEST['categories']['Breakfast'] and 'book=' not in page.url)
    check('Reset keeps the chosen meal filter',page.locator('[data-recipe-category]').input_value()=='Breakfast')
    for path,count in [('/recipes/vanilla-berry-smoothie/',2),('/recipes/omelette-muffins/',6),('/recipes/chocolate-fudge-bars/',6)]:
        visit(path)
        check('Complete method '+path,page.locator('[data-method] li').count()==count)
    check('Missing original photo explicit',page.locator('.recipe-no-photo').count()>0)
    visit('/recipes/fragrant-spiced-chickpea-hash/')
    note=page.locator('.source-review')
    check('Source review prompt is visible',note.locator('summary').is_visible())
    if note.get_attribute('open') is None:
        note.locator('summary').click()
    check('Printed serving conflict explained','Source serving conflict' in note.inner_text())
    visit('/shop/high-protein-kitchen/')
    check('Book uses supplied cover',page.locator('.cookbook-cover img').get_attribute('src')=='/assets/cookbook/high-protein-kitchen-cover.webp')
    check('143-page digital edition described','143 pages' in page.locator('body').inner_text())
    check('Price pending, not invented','Price to be announced' in page.locator('body').inner_text())
    check('Book cannot be added at an unapproved price',page.locator('[data-add-product],[data-add-to-cart]').count()==0)
    check('Paid PDF is not a public download',page.locator('a[href$=".pdf"]').count()==0)
    check('Book retains launch date','1 November 2026' in page.locator('body').inner_text())
    for width in [390,760,1024,1440]:
        page.set_viewport_size({'width':width,'height':900})
        check('Book layout no overflow '+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        page.evaluate('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>null)}))')
        check('Book cover/images load '+str(width),page.evaluate('[...document.images].filter(i=>i.getAttribute("src")).every(i=>i.complete&&i.naturalWidth>0)'))
        if width in [390,1440]:page.screenshot(path=str(OUT/f'cookbook-{width}.png'),full_page=True)
    visit('/shop/')
    check('Book listed in shop',page.locator('a[href="/shop/high-protein-kitchen/"]').count()>0)
    visit('/recipe-books/')
    check('Book listed in Recipe Books',page.locator('a[href="/shop/high-protein-kitchen/"]').count()>0)
    check('No JavaScript errors',not errors)
    browser.close()
report={'mode':BASE,'passed':len(checks),'checks':checks,'errors':errors}
(OUT/('cookbook-production.json' if BASE.startswith('https://') else 'cookbook-browser.json')).write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
