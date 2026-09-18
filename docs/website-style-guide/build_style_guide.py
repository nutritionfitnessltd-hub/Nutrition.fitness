"""Create the website style reference from public interface examples."""
from pathlib import Path
import base64, json, shutil
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'style-guide-output'
OUT.mkdir(exist_ok=True)
SHOTS=OUT/'examples';SHOTS.mkdir(exist_ok=True)
ORIGIN='https://www.nutrition.fitness'

def table(head,rows):
 return '<table><thead><tr>'+''.join('<th>'+s+'</th>' for s in head)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+s+'</td>' for s in row)+'</tr>' for row in rows)+'</tbody></table>'
def image(name,alt,cls='',height=None):
 return f'<figure class="example {cls}"><img src="{{{{{name}}}}}" alt="{alt}"'+(f' style="max-height:{height}px"' if height else '')+'></figure>'
def rule(title,text):return f'<div class="rule"><h3>{title}</h3><p>{text}</p></div>'
def pair(title,bg,ink,use):return f'<article class="pair" style="background:{bg};color:{ink}"><h3>{title}</h3><p class="hex">{bg} <span>background</span> &nbsp; {ink} <span>accent</span></p><p>{use}</p></article>'
PAGES=[]
def page(section,title,intro,content):
 n=len(PAGES)+1
 PAGES.append(f'<section class="page"><header class="running"><span>nutrition.<b>fitness</b></span><span>Website style guide</span></header><p class="eyebrow">{n:02d} / {section}</p><h1>{title}</h1><p class="intro">{intro}</p><div class="content">{content}</div><footer><span>Design &amp; implementation</span><span>{n:02d}</span></footer></section>')

page('Foundations','A clear, recognisable website.','Nutrition.Fitness uses a white canvas, dark readable text, soft-colour panels, real photography and small handwritten details.',
 image('home-overview','Homepage navigation, launch banner and hero',height=300)+
 '<div class="columns">'+rule('What the visual style does','The large heading explains the offer. The image makes it tangible. One prominent action gives the visitor a clear next step.')+rule('How it stays consistent','DM Sans carries the interface. Kalam adds personality. Colour identifies the subject or state; it never replaces a label.')+'</div>'+
 '<h2>Reference sections</h2>'+table(['Foundations','Components'],[['02 Colour roles and pairings','06 Programme finder'],['03 Typography and hierarchy','07 Forms and mobile modals'],['04 Page layout and responsive grids','08 Programme cards'],['05 Buttons, icons and states','09 Product cards'],['','10 Recipes and meal planning'],['','11 Courses and Knowledge Centre'],['','12 Photography and handwritten details']]))

page('Colour system','Light surfaces. Dark accents.','White is the main page background. Pale colours group content; their darker partners highlight headings, notes, icons and selected states.',
 '<div class="pairs">'+
 pair('Petrol / aqua','#E3EDF0','#06475E','General actions, app features and programme-page accents.')+
 pair('Green / pale sage','#E9EEDF','#376747','Programme-finder welcome, selected answers, results and green actions.')+
 pair('Green / sage','#DFE5D0','#376747','Meal-planning feature panels and food-related emphasis.')+
 pair('Plum / soft plum','#E8D8E0','#863954','Brand emphasis, homepage accent phrases and supporting panels.')+
 pair('Terracotta / peach','#F2DFD2','#9A4936','Courses and learning-related accent details.')+
 pair('Ochre / pale gold','#F6ECD7','#805C19','Knowledge Centre and editorial accent details.')+'</div>'+
 table(['Supporting colour','HEX','Use'],[['White / ink navy','#FFFFFF / #092A3E','Default canvas, headings and body text.'],['Muted slate','#536572','Secondary copy and helpful context at full opacity.'],['Protein blush / blush','#FBE9E7 / #F9E7E3','Supporting panels. Use navy body text or a dark plum accent.'],['Warm paper','#FAF6EF','Local lifestyle and supporting inset panels; not the page canvas.'],['Divider / input border','#D6DDD9 / #C7D0D5','Separators and the programme-finder answer boundaries.'],['Error red','#962F2F','Validation text with an explicit message.']])+
 '<p class="note">Navy is the default body-text colour on every pale surface. Keep green specific to the finder and food styles; it does not replace the rest of the palette.</p>')

page('Typography','Two fonts. Clear hierarchy.','DM Sans is used for headings, paragraphs, navigation, labels and buttons. Kalam is reserved for short handwritten comments.',
 '<div class="type-specimen"><div class="type-display">Getting fit.<br><span>Less complicated.</span></div><p class="type-body">A few questions about your actual life.<br>A programme that makes sense.</p><p class="handwritten">Your week. Not someone else’s.</p></div>'+
 table(['Style','Specification','Purpose'],[['Display heading','DM Sans 800–850; tight tracking; line height about 1.0–1.1.','Page-level message. The homepage scales approximately 42–79px.'],['Section heading','DM Sans 700–850; typically 31–48px.','Introduces a row or major section.'],['Card heading','DM Sans 700–800; typically 21–25px.','Names a programme, product or article.'],['Body and lead','DM Sans 400; body 16px, lead 17–20px; line height 1.45–1.6.','Explains the offer and supports reading.'],['Labels and actions','DM Sans 500–750; typically 13–17px.','Makes controls and short metadata easy to scan.'],['Handwritten note','Kalam 400; typically 21–27px; line height 1.2–1.3.','Adds a short, human aside without competing with the heading.']])+
 '<div class="columns">'+rule('Keep sizes component-specific','A homepage display heading is not a card heading. The finder uses a smaller welcome heading and 24–29px question titles.')+rule('Keep copy as text','Headings, labels and new handwritten comments remain selectable HTML text. Use real font weights rather than synthetic bold.')+'</div>')

page('Layout & navigation','One page structure. Flexible grids.','The shared shell contains navigation, the launch banner, the page content and the footer. The content remains centred within a maximum 1440px shell.',
 image('header','Desktop site navigation',height=94)+image('banner','Launch banner below navigation',height=84)+
 '<div class="columns">'+rule('Navigation and launch banner','Show the full navigation on desktop. Use the mobile menu at 980px and below. Keep the launch banner directly below navigation, separate from the hero.')+rule('Spacing and shape','Use generous space between sections and tighter spacing within a card. Typical card radii are 13–20px; buttons are pill-shaped. Align neighbouring content edges.')+'</div>'+
 table(['Component','Wide layout','Narrow layout'],[['Homepage programme row','3 columns.','1 column at 760px and below.'],['Homepage product row','4 columns above 1000px.','2 columns to 370px; 1 below 370px.'],['Meal / protein feature panels','2 columns from 1000px.','1 column; heading, image, note and action remain separate.'],['Standard modal / finder','Centred, with a visible backdrop.','Full-screen at 640px and below.'],['Page gutters','Generally 24–46px within the shell.','Generally 14–22px; modal content uses 20px.']])+
 image('footer','Site footer with supporting navigation',height=90)+
 '<p class="note">Let text wrap naturally. Use grid and normal document flow for content; reserve absolute positioning for decoration that cannot obscure a control or label.</p>')

page('Actions & states','Make the next action obvious.','Petrol is the general primary-action colour. The programme finder uses green. Secondary actions use text links or a light outlined treatment.',
 '<div class="columns examples-small"><div><h2>General primary action</h2>'+image('primary-action','Petrol primary action',height=80)+'<p class="caption">#06475E fill · white label · #05394C hover</p></div><div><h2>Finder action</h2>'+image('finder-action','Green finder action',height=80)+'<p class="caption">#376747 fill · white label · #2B5238 hover</p></div></div>'+
 '<h2>Answer-card states</h2>'+image('answer-default','Unselected programme-finder answer',height=106)+image('answer-selected','Selected programme-finder answer',height=106)+
 table(['State','Visual treatment','Behaviour'],[['Default','White surface, fine border and dark text.','The full card is the input label.'],['Hover','Accent border or darker button fill.','Indicates a pointer target without changing its size.'],['Selected','Pale sage fill, green border and checked control.','Use the checked state as well as colour.'],['Keyboard focus','Visible outline outside the control.','Do not remove the focus indicator.'],['Error','Red explanatory text close to the relevant field.','Describe the action needed to continue.'],['Disabled / busy','Clearly unavailable control; busy label where needed.','Prevent duplicate submission; do not imitate success.']])+
 image('validation','Required-answer validation message',height=35)+
 '<p class="note">General buttons are around 52px high; finder buttons are at least 46px. The shared modal close button is 44 × 44px. Icons supplement text, rather than replacing an unclear label.</p>')

page('Programme finder','A focused, guided decision.','The finder is a white modal with a green accent system. It presents one question at a time and retains the handwritten personality of the wider website.',
 image('quiz-desktop','Desktop programme finder with green and pale sage styling',height=540)+
 '<div class="columns">'+rule('Information order','Welcome and offer, reassurance, progress, question, answer cards, then the Next action. The progress indicator shows completed steps.')+rule('Visual roles','Pale sage groups the welcome and selected answers. Deep green identifies actions, progress and notes. Navy carries the question and answer labels.')+'</div>'+
 '<p class="note">The desktop finder is up to 920px wide. Keep the close control visible, the content independently scrollable and the primary action clear of the last answer.</p>')

page('Forms & mobile modals','Visible labels. Room to respond.','Forms open in the shared modal system. On small screens the modal fills the viewport, with a fixed header and a scrollable content area.',
 '<div class="form-examples"><div>'+image('quiz-mobile','Mobile programme finder',height=505)+'</div><div>'+image('contact-form','Contact form with visible labels and message field',height=380)+'<p class="caption">Labels sit above controls. Helper text sits beside the decision it explains.</p>'+image('form-fields','Programme reservation name and email fields',height=100)+'</div></div>'+
 '<div class="columns">'+rule('Input styling','White fields, dark text, clear boundaries and a visible focus outline. Use at least 16px input text on mobile. Placeholder text supplements, rather than replaces, the label.')+rule('Interaction behaviour','Escape and the close control dismiss the modal. Restore focus to its trigger. Preserve entered values when reopening and distinguish required fields from optional consent.')+'</div>'+
 '<p class="note">Validation belongs near the field or question. Confirmation must describe the result of the action accurately. The mobile action area must not cover inputs or content.</p>')

page('Programme cards','Help visitors choose a starting point.','Programme cards combine a real training photograph, a short programme name, a clear benefit and one destination link.',
 image('programmes','Homepage core, build and fit programme cards',height=320)+
 '<div class="columns">'+rule('Card structure','Photograph first; programme name over the photo on a legible label; category, benefit heading, supporting text and Explore link beneath. Keep the whole linked card keyboard-accessible.')+rule('Colour and copy','Core, build and fit use distinct restrained accents. Keep the shared card shape, padding and text hierarchy consistent across all programme families.')+'</div>'+
 table(['Element','Style and purpose'],[['Image','Real training context. Crop to a consistent frame; do not stretch the photograph.'],['Programme name','Lowercase name, visually distinct from the benefit heading.'],['Category label','Small uppercase text identifies the type of programme.'],['Benefit heading','Bold DM Sans; short enough to scan.'],['Body / action','Muted supporting copy; dark action text with a small arrow.'],['Focus names','Append focus names with dots, such as core.arms.chest.shoulders. Do not add a trailing dot.']])+
 '<p class="note">Desktop uses three homepage cards in one row. Mobile stacks them, keeping the text and action in the same reading order.</p>')

page('Product cards','Make the product easy to recognise.','Product presentation is clean and consistent: the item image has its own frame, with the name, useful description and action below it.',
 image('products','Homepage product and book cards',height=315)+
 '<div class="columns">'+rule('Packshots','Use object-fit: contain so the complete pack or book cover remains visible. Keep backgrounds quiet and allow breathing room around the object.')+rule('Card content','Make the product name easy to find. Separate the description, price or availability, size and action. Keep status text distinct from a purchase action.')+'</div>'+
 '<div class="columns"><div>'+image('product-card','Example shop product card',cls='product-example',height=255)+'</div><div>'+
 table(['Style','Application'],[['Supplement imagery','Consistent product views, scale and neutral image surfaces.'],['Book imagery','Use the actual book cover, with the full cover visible.'],['Product options','Open the options form in a modal; retain the product page as context.'],['Responsive row','Four homepage cards on wide screens; two or one as space reduces.']])+'</div></div>')

page('Food & meal planning','Real food. Useful nutrition.','Food imagery comes from the recipe collection. Recipe cards, detail pages and meal-planning panels connect the photograph to a clear food name and practical next action.',
 image('feature-panels','Homepage meal-planning and protein panels',height=278)+
 image('recipe-hero','Easy chicken stir-fry recipe heading, nutrition and photograph',height=290)+
 '<div class="columns">'+rule('Feature-panel style','Sage identifies the meal-planning panel. Heading, image, body copy, handwritten note and button occupy separate regions, including on mobile.')+rule('Recipe-detail style','The title and meal photograph lead. Protein is the largest nutrition value, followed by calories, carbohydrates and fat. Always show the serving basis.')+'</div>'+
 '<p class="note">Keep recipe photos, serving amounts and nutrition tied to the selected recipe. In the planner, prioritise what remains for the day and make over- or under-target states explicit; never invent targets to populate a layout.</p>')

page('Learning & editorial','Shared structure. Subject-specific accents.','Courses and the Knowledge Centre use the same typography and card language as the rest of the website. Their accent colours help identify the subject without changing the brand.',
 '<h2>Courses</h2>'+image('courses','Courses page introduction and course card',height=220)+
 '<p class="body">Terracotta identifies learning-related emphasis. Use the page heading to explain the topic, then present lesson or course cards with clear titles, scope and a single onward action.</p>'+
 '<h2>Knowledge Centre</h2>'+image('knowledge','Knowledge Centre heading and editorial navigation',height=220)+
 '<p class="body">Ochre identifies editorial emphasis. Article cards use a category, reading context, useful title, short summary and supporting image. Search and filters open in modals; results remain on the page.</p>'+
 '<p class="note">Use different relevant photographs across the content library. Avoid repeating one visual treatment for every article. Body text stays navy or muted slate; accents are reserved for emphasis.</p>')

page('Photography & handwritten detail','Personality without visual clutter.','Real photography provides credibility. Small handwritten comments add warmth. Both support the message rather than interrupt the reading order.',
 '<div class="columns"><div>'+image('recipe-photo','Original cookbook recipe photograph',height=190)+'<h3>Food and products</h3><p class="body">Use photographs from the recipe collection and consistent packshots. Crop food within its frame; keep complete product packs and book covers visible.</p></div><div>'+image('lifestyle','Lifestyle photography from the website',height=190)+'<h3>People and illustrations</h3><p class="body">Show relatable training and everyday life. Coach characters are illustrated where those characters appear; photography remains the default elsewhere.</p></div></div>'+
 '<h2>Handwritten comments</h2><div class="doodle-examples">'+image('doodle-one','Handwritten homepage comment',height=102)+image('doodle-two','Handwritten quiz reassurance',height=102)+'</div>'+
 '<div class="columns">'+rule('Use','One short aside near the section it supports. Use Kalam 400, a dark accent colour and a simple hand-drawn arrow. A slight rotation can make the note feel informal.')+rule('Placement','Give the note its own space. Never overlap a paragraph, product label, button or input. Keep the essential message in standard interface text.')+'</div>'+
 '<div class="closing"><h3>Implementation principle</h3><p>Choose the component for the job, apply its colour and type roles, then let the layout reflow. Reuse the shared styles instead of inventing a new treatment for each page.</p></div>')

CSS=r'''
@page{size:A4;margin:0}*{box-sizing:border-box}html{background:#edf0f2}body{margin:0;color:#092a3e;font:15px/1.48 'DM Sans',Arial,sans-serif;-webkit-font-smoothing:antialiased}.page{width:210mm;height:297mm;padding:14mm 15mm 15mm;background:white;margin:12px auto;position:relative;break-after:page}.page:last-child{break-after:auto}.running{display:flex;justify-content:space-between;align-items:center;padding-bottom:13px;margin-bottom:23px;border-bottom:1px solid #d6ddd9;color:#536572;font-size:11px}.running>span:first-child{font-size:21px;letter-spacing:-.9px;color:#092a3e;font-weight:800}.running b{font-weight:400}.eyebrow{font-size:10px;line-height:1.4;letter-spacing:.14em;text-transform:uppercase;font-weight:750;color:#376747;margin:0 0 9px}h1{font-size:38px;line-height:1.07;font-weight:850;letter-spacing:-.045em;margin:0 0 13px}h2{font-size:21px;line-height:1.17;font-weight:800;letter-spacing:-.025em;margin:18px 0 12px}h3{font-size:16px;line-height:1.25;font-weight:750;margin:0 0 8px;letter-spacing:-.015em}p{margin:0}.intro{font-size:15px;line-height:1.5;color:#536572;margin-bottom:19px}.content>p,.rule p{font-size:13.5px;line-height:1.5}.columns{display:grid;grid-template-columns:1fr 1fr;gap:23px;margin:17px 0}.rule{padding-top:12px;border-top:1px solid #d6ddd9}.rule p{color:#536572}.body{font-size:13.5px;line-height:1.5;color:#536572}.example{margin:0 0 13px}.example img{display:block;width:100%;height:auto;object-fit:contain;object-position:center;border:1px solid #e2e7e6;border-radius:10px}.example.product-example{width:205px;margin:0 auto 12px}.caption{font-size:11px;line-height:1.45;color:#536572;margin:7px 0 13px}.pairs{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}.pair{border-radius:13px;padding:17px 18px}.pair h3{font-size:20px;margin:0 0 9px}.pair p{font-size:12px;line-height:1.45}.pair .hex{font-size:11.5px;font-weight:700;margin-bottom:8px;white-space:normal}.pair .hex span{font-size:9px;font-weight:500}.note{padding:13px 16px;background:#e3edf0;color:#092a3e;border-radius:10px;margin:15px 0 0!important;font-size:12px!important;line-height:1.5!important}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:13px 0;font-size:12px;line-height:1.4}th{text-align:left;background:#e9eedf;color:#376747;font-weight:700;padding:9px 10px}td{padding:8px 10px;border-bottom:1px solid #d6ddd9;vertical-align:top;overflow-wrap:anywhere}td:first-child{font-weight:650}table th:first-child{width:26%}.page:first-child table th:first-child{width:50%}.type-specimen{padding:25px 27px;background:#e9eedf;border-radius:14px;margin-bottom:19px}.type-display{font-size:44px;line-height:1.04;font-weight:850;letter-spacing:-.055em}.type-display span{color:#376747}.type-body{font-size:18px;line-height:1.45;margin-top:15px}.handwritten{font-family:'Kalam',cursive;font-size:26px;color:#376747;line-height:1.3;margin-top:17px}.form-examples{display:grid;grid-template-columns:220px 1fr;gap:27px;align-items:start}.doodle-examples{display:grid;grid-template-columns:1fr 1fr;gap:28px;padding:17px;background:#fff;border:1px solid #d6ddd9;border-radius:13px}.doodle-examples .example{margin:0}.doodle-examples img{border:0;border-radius:0}.closing{background:#e9eedf;padding:17px 20px;border-radius:13px;margin-top:22px}.closing p{font-size:13px;line-height:1.5}.closing h3{color:#376747}footer{position:absolute;left:15mm;right:15mm;bottom:10mm;border-top:1px solid #d6ddd9;padding-top:9px;display:flex;justify-content:space-between;font-size:10px;color:#536572}.examples-small h2{font-size:17px;margin-top:0}.examples-small .example img{border:0}.page:nth-child(5) table{font-size:11.5px}.page:nth-child(9) table{font-size:11.5px}@media print{html{background:white}.page{margin:0}}
'''
TOKENS='''/* Nutrition.Fitness: semantic design tokens. Apply through component styles. */
:root {
  --nf-page: #FFFFFF;
  --nf-ink: #092A3E;
  --nf-muted: #536572;
  --nf-petrol: #06475E;
  --nf-petrol-hover: #05394C;
  --nf-aqua: #E3EDF0;
  --nf-green: #376747;
  --nf-green-hover: #2B5238;
  --nf-green-shadow: #23442F;
  --nf-finder-surface: #E9EEDF;
  --nf-sage: #DFE5D0;
  --nf-plum: #863954;
  --nf-plum-hover: #702D47;
  --nf-soft-plum: #E8D8E0;
  --nf-terracotta: #9A4936;
  --nf-peach: #F2DFD2;
  --nf-ochre: #805C19;
  --nf-pale-gold: #F6ECD7;
  --nf-protein-blush: #FBE9E7;
  --nf-blush: #F9E7E3;
  --nf-warm-paper: #FAF6EF;
  --nf-divider: #D6DDD9;
  --nf-finder-border: #C7D0D5;
  --nf-error: #962F2F;
  --nf-font: 'DM Sans', Arial, sans-serif;
  --nf-font-note: 'Kalam', cursive;
  --nf-card-radius: 16px;
  --nf-feature-radius: 20px;
  --nf-button-radius: 100px;
}
'''
README='''# Nutrition.Fitness website style guide

## Contents

- **Website-Style-Guide.pdf**: the visual reference, organised by colour, type, layout and component.
- **Website-Style-Guide.html**: an editable HTML copy of the same reference. Its example images are embedded.
- **design-tokens.css**: semantic colour and font aliases. These do not restyle the website until used by component selectors.
- **examples/**: full-resolution interface examples.

## Applying the system

Use a white page canvas and navy body text. Select the component appropriate to the task, then apply its accent and surface colours. Petrol is the general primary-action colour; green and pale sage are the programme-finder action and selection system. Plum, terracotta and ochre retain their separate roles.

DM Sans is the interface font. Kalam is used only for short handwritten notes. Load the required font weights from the existing site font loader. Font binaries are not included.

Keep component-specific layout rules instead of imposing one global font size, padding or breakpoint on every screen. Use semantic HTML, explicit labels and visible keyboard focus. Treat the whole answer card as its input label. Modal flows must retain entered information and restore focus on close.

## Component source map

| Component | Styles / source |
| --- | --- |
| Shared foundations, navigation and hero | public/base.css, public/site.css |
| Page accents and launch banner | public/launch.css, src/launch-layout.mjs |
| Shared modal frame and mobile behaviour | public/form-modals.css, public/form-modals.mjs |
| Programme-finder cards and states | public/finder-personality.css, public/finder-personality.mjs |
| Homepage programme and product rows | public/home-highlights.css |
| Homepage meal and protein feature panels | public/home-feature-panels.css |
| Recipe cards, nutrition and planner | public/food.css, public/recipe-display.mjs |
| Knowledge Centre | public/knowledge-centre.css |
| Homepage structure | src/home.html |

Use the current component styles as the implementation reference. The semantic aliases in design-tokens.css are descriptive names for these roles, not a second global stylesheet.

## Responsive requirements

Keep desktop navigation above 980px and the mobile menu below it. Modals become full-screen at 640px and below. Homepage programme cards stack at 760px; the product row uses four, two or one columns according to available space. Food feature panels become two columns from 1000px.

Ensure that text can grow without clipping, controls remain reachable, photographs retain their aspect ratio, and product images remain fully visible. Do not position decorative text over a control. Use reduced-motion preferences for animation and provide meaningful image alternatives.
'''

def make_document():
 html='<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Nutrition.Fitness | Website Style Guide</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;650;700;750;800;850;900&amp;family=Kalam:wght@400&amp;display=swap"><style>'+CSS+'</style></head><body>'+''.join(PAGES)+'</body></html>'
 for file in SHOTS.iterdir():
  if file.suffix.lower() not in ['.png','.jpg','.jpeg','.webp']:continue
  mime='image/'+('jpeg' if file.suffix.lower() in ['.jpg','.jpeg'] else file.suffix[1:])
  html=html.replace('{{'+file.stem+'}}','data:'+mime+';base64,'+base64.b64encode(file.read_bytes()).decode())
 assert '{{' not in html,'Missing example image'
 return html

if __name__=='__main__':
 with sync_playwright() as w:
  browser=w.chromium.launch(headless=True)
  ctx=browser.new_context(viewport={'width':1440,'height':1100},device_scale_factor=2,reduced_motion='reduce')
  ctx.route('**/api/**',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"Example capture: no submission"}'))
  p=ctx.new_page();p.set_default_timeout(20000)
  def go(path='/'):
   p.goto(ORIGIN+path,wait_until='domcontentloaded');p.wait_for_function('document.documentElement.dataset.nfFormModals==="ready"');p.evaluate('async()=>await document.fonts.ready')
  def capture(name,loc):
   loc.scroll_into_view_if_needed()
   for img in loc.locator('img').all():img.evaluate('async el=>{if(el.complete&&el.naturalWidth)return;await el.decode()}')
   loc.screenshot(path=str(SHOTS/(name+'.png')),animations='disabled')
  def region(name,selectors,maxheight=None):
   for selector in selectors:
    for img in p.locator(selector).first.locator('img').all():img.evaluate('async el=>{if(el.complete&&el.naturalWidth)return;await el.decode()}')
   boxes=[p.locator(s).first.bounding_box() for s in selectors]
   top=min(b['y'] for b in boxes)+p.evaluate('scrollY');left=min(b['x'] for b in boxes)
   bottom=max(b['y']+b['height'] for b in boxes)+p.evaluate('scrollY');right=max(b['x']+b['width'] for b in boxes)
   p.screenshot(path=str(SHOTS/(name+'.png')),clip={'x':left,'y':top,'width':right-left,'height':min(bottom-top,maxheight or bottom-top)},animations='disabled')
  go();expect(p.locator('.nf-home-feature--meals img')).to_have_attribute('src','/assets/cookbook/recipe-061.webp')
  capture('header',p.locator('.site-header'));capture('banner',p.locator('.launch-banner'))
  p.evaluate('scrollTo(0,0)');region('home-overview',['.site-header','.launch-banner','.hero'])
  capture('footer',p.locator('.new-footer'));capture('primary-action',p.locator('.hero-button'))
  capture('programmes',p.locator('.home-programmes'));capture('products',p.locator('.home-products'))
  capture('feature-panels',p.locator('.nf-home-features'));capture('lifestyle',p.locator('.life-photo'))
  capture('doodle-one',p.locator('.home-showcase-note').first)
  p.locator('.hero-button').click();f=p.frame_locator('dialog[open] iframe')
  expect(f.locator('.finder-welcome')).to_have_css('background-color','rgb(233, 238, 223)')
  f.locator('html').evaluate('async()=>await document.fonts.ready')
  capture('quiz-desktop',p.locator('dialog[open]'));capture('answer-default',f.locator('.finder-option').first)
  capture('finder-action',f.locator('[data-next]'));capture('doodle-two',f.locator('.finder-free-note'))
  f.locator('[data-next]').click();capture('validation',f.locator('.finder-error'))
  f.locator('input[value=foundation]').check();capture('answer-selected',f.locator('.finder-option:has(input:checked)'))
  for value in ['foundation','returning','bodyweight','3','30',None,'consistency']:
   if value:f.locator(f'input[value="{value}"]').check()
   f.locator('[data-next]').click()
  capture('form-fields',f.locator('.finder-fields'))
  p.locator('.nf-form-close').click()
  go('/contact/');p.locator('#message').focus();capture('contact-form',p.locator('#contact-form'))
  go('/shop/');capture('product-card',p.locator('#products .product-card').first)
  go('/recipes/easy-chicken-stir-fry/');capture('recipe-hero',p.locator('.food-recipe-hero'))
  capture('recipe-photo',p.locator('.food-recipe-hero figure'))
  go('/courses/');p.evaluate('scrollTo(0,0)');region('courses',['.food-intro','.system-card:first-child'],620)
  go('/knowledge-centre/');capture('knowledge',p.locator('.kc-hero'))
  p.close()
  p=ctx.new_page();p.set_viewport_size({'width':390,'height':844});go();p.locator('.hero-button').click()
  f=p.frame_locator('dialog[open] iframe');f.locator('input[value=foundation]').check();f.locator('[data-next]').click()
  f.locator('html').evaluate('async()=>{await document.fonts.ready;scrollTo(0,0)}');p.screenshot(path=str(SHOTS/'quiz-mobile.png'),animations='disabled');p.close()
  html=make_document();(OUT/'Website-Style-Guide.html').write_text(html)
  (OUT/'design-tokens.css').write_text(TOKENS);(OUT/'README.md').write_text(README)
  doc=ctx.new_page();doc.set_viewport_size({'width':1000,'height':1300});doc.set_content(html,wait_until='networkidle')
  doc.evaluate('async()=>await document.fonts.ready')
  loaded=doc.evaluate('Array.from(document.fonts).filter(f=>f.status==="loaded").map(f=>f.family)')
  assert any('DM Sans' in x for x in loaded) and any('Kalam' in x for x in loaded),loaded
  issues=[]
  proof=ROOT/'style-guide-proof';proof.mkdir(exist_ok=True)
  for n,section in enumerate(doc.locator('.page').all(),1):
   section.screenshot(path=str(proof/f'page-{n:02}.png'))
   geometry=section.evaluate('el=>{let footer=el.querySelector("footer").getBoundingClientRect(),c=el.querySelector(".content").getBoundingClientRect();return {bottom:c.bottom,footer:footer.top,width:el.scrollWidth,box:el.clientWidth}}')
   print(n,geometry,flush=True)
   if geometry['bottom']>geometry['footer']-12 or geometry['width']>geometry['box']:issues.append({'page':n,**geometry})
  doc.pdf(path=str(OUT/'Website-Style-Guide.pdf'),print_background=True,prefer_css_page_size=True)
  (proof/'layout.json').write_text(json.dumps(issues,indent=2));browser.close()
  if issues:raise AssertionError(issues)
 shutil.make_archive(str(ROOT/'Nutrition-Fitness-Developer-Style-Pack'),'zip',OUT)
