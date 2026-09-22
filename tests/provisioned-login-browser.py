"""Browser tests for provisioned login. All account/API responses are isolated fixtures."""
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
BASE=os.environ.get('NUFI_TEST_BASE_URL','http://127.0.0.1:4173').rstrip('/')
OUT=Path('test-results');OUT.mkdir(exist_ok=True)
checks=[];calls=[];errors=[]
def ok(name,condition=True):
    assert condition,name
    checks.append(name)
with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options)
    context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    signed_in=False
    def handler(route):
        global signed_in
        request=route.request;path=urlparse(request.url).path
        payload=request.post_data_json if request.method!='GET' else None
        calls.append({'path':path,'method':request.method,'action':(payload or {}).get('action')})
        status=200
        if path=='/api/auth':
            if request.method=='GET':
                data={'configured':False,'passwordConfigured':True,'signupConfigured':False,'recoveryConfigured':False,'passwordChangeConfigured':False,'provisionedAccountsOnly':True,'captchaRequired':False,'turnstileSiteKey':None}
            elif payload.get('action')=='login-password':
                assert payload['email']=='qa-owner@example.invalid'
                assert payload['password']=='Fixture password only'
                assert 'botToken' not in payload
                signed_in=True;data={'status':'signed-in'}
            elif payload.get('action')=='logout':signed_in=False;data={'status':'signed-out'}
            else:raise AssertionError('Unexpected email flow attempted')
        elif path=='/api/account' and signed_in:
            data={'user':{'id':'11111111-1111-4111-a111-111111111111','email':'qa-owner@example.invalid','firstName':'Test owner','admin':True,'status':'active'},'profile':{'firstName':'Test owner'},'capabilities':{'passwordChange':False},'workspace':{'version':0,'updatedAt':None},'onboarding':None,'access':{'recipes':'account'}}
        elif path=='/api/manage' and signed_in:
            data={'counts':{'members':1,'activeMembers':1,'freeRecipes':100,'accountRecipes':481,'heldRecipes':18},'recentAudit':[],'configured':{'management':True,'recipes':True}}
        else:status=401;data={'error':'Fixture requires sign in'}
        route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={'Cache-Control':'no-store'})
    context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(BASE+'/') else route.abort())
    context.route('**/api/**',handler)
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_default_timeout(15000)
    for width in [320,390,768,1440]:
        page.set_viewport_size({'width':width,'height':900})
        page.goto(BASE+'/login/?next=%2Fadmin%2F')
        expect(page.locator('[data-auth-form] fieldset')).to_be_enabled()
        expect(page.locator('[data-auth-intro]')).to_contain_text('existing account')
        expect(page.locator('.nf-forgot')).to_be_hidden()
        expect(page.locator('[data-auth-toggle]')).to_be_hidden()
        expect(page.locator('[data-portal-bot]')).to_be_hidden()
        ok(f'Login-only controls and no horizontal overflow at {width}',page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'))
        ok(f'No CAPTCHA script loaded in provisioned fixture at {width}',page.locator('script[src*="turnstile"]').count()==0)
        if width in [390,1440]:page.screenshot(path=str(OUT/f'provisioned-login-fixture-{width}.png'))
    page.get_by_label('Email address',exact=True).fill('qa-owner@example.invalid')
    page.locator('#password').fill('Fixture password only')
    page.get_by_role('button',name='Sign in',exact=True).click()
    page.wait_for_url(BASE+'/admin/')
    expect(page.locator('.nf-stat')).to_have_count(4)
    ok('Login redirects to the requested administrator screen')
    page.goto(BASE+'/account/')
    expect(page.locator('[data-profile-form]')).to_be_visible()
    expect(page.locator('[data-password-form]')).to_have_count(0)
    ok('Account is usable and unavailable password changes are explained')
    for path in ['/register/','/forgot-password/','/reset-password/']:
        page.goto(BASE+path)
        expect(page.locator('[data-auth-body] form')).to_have_count(0)
        expect(page.locator('[data-auth-body] a')).to_have_attribute('href','/login/')
        ok(f'{path} explains disabled email flow and offers sign in')
    page.goto(BASE+'/admin/')
    page.locator('[data-portal-logout]').click()
    page.wait_for_url(BASE+'/login/?signedOut=1')
    ok('Logout returns to login')
    page.goto(BASE+'/admin/')
    expect(page.locator('[data-admin-content]')).to_contain_text('Sign in to manage the website')
    ok('Signed-out visitor cannot open administrator data')
    ok('No email operation was attempted',all(c['action'] in [None,'login-password','logout'] for c in calls))
    ok('No unhandled JavaScript errors',not errors)
    report={'fixturesOnly':True,'passed':len(checks),'checks':checks,'errors':errors,'calls':calls}
    (OUT/'provisioned-login-browser.json').write_text(json.dumps(report,indent=2))
    context.close();browser.close()
print(json.dumps(report))
