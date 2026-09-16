"""Source-native cookbook import. Requires PyMuPDF and Pillow; no OCR or external recipe data."""
from pathlib import Path
import fitz, re, json, hashlib, unicodedata, io
from PIL import Image, ImageOps, ImageDraw
import argparse
parser=argparse.ArgumentParser(description="Extract this exact 143-page source edition without OCR or inferred recipe values.")
parser.add_argument('pdf',type=Path,help='Local private copy of High-Protein-Kitchen-Designed(2).pdf')
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1])
args=parser.parse_args();ROOT=args.output.resolve();PDF=args.pdf.resolve()
(ROOT/'public/assets/cookbook').mkdir(parents=True,exist_ok=True)
(ROOT/'data/cookbooks').mkdir(parents=True,exist_ok=True)
DOC=fitz.open(PDF)
HASH=hashlib.sha256(PDF.read_bytes()).hexdigest()
assert HASH=='0d37a347d76583ab9cf99ea56ee38cabb98021b5f7f7019f0e1eb070f01f88a3', 'Source edition changed; review its layout and content before importing.'

def spans(p):
 return [s for b in p.get_text('dict')['blocks'] if b['type']==0 for l in b['lines'] for s in l['spans']]
def clean(s):return re.sub(r'\s+',' ',s).strip()
def slug(s):return re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().replace('&',' and ')).strip('-')
index=[]
for pn,cat in [(11,'Breakfast'),(12,'Lunch'),(13,'Dinner'),(14,'Snacks'),(15,'Drinks')]:
 ss=spans(DOC[pn-1]); rows={}
 for s in ss:
  if 11.9<=s['size']<=12.2:
   rows.setdefault(round(s['bbox'][1],1),[]).append(s)
 for y,rr in sorted(rows.items()):
  nums=[s for s in rr if s['bbox'][0]>500 and s['text'].strip().isdigit()]
  names=[s['text'] for s in rr if s['bbox'][0]<500]
  if nums and names:index.append({'number':len(index)+1,'name':clean(' '.join(names)),'page':int(nums[0]['text']),'category':cat})
assert len(index)==100, len(index)
STABLE={5:'tropical-overnight-oats',11:'blueberry-lemon-oats',41:'greek-chicken-salad',67:'salmon-lime-rice-bowl',71:'bean-chickpea-chilli',72:'chocolate-orange-energy-balls'}
# Preserve the six original recipe identifiers so saved plans and member overrides still resolve.
FRACTIONS={'¼':.25,'½':.5,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875}
def number(s):
 s=s.strip()
 if s[-1:] in FRACTIONS:return float(s[:-1] or 0)+FRACTIONS[s[-1]]
 if '/' in s:
  bits=s.split();frac=bits[-1].split('/');return (float(bits[0]) if len(bits)>1 else 0)+float(frac[0])/float(frac[1])
 return float(s)
NUM=r'(?:\d+(?:\.\d+)?(?:\s+\d+/\d+)?[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞])'

def parse_ingredient(raw,group):
 item={'name':raw,'quantity':None,'unit':'','note':'','group':group,'optional':'(optional)' in raw.lower() or '(optional)' in group.lower(),'aisle':'Other','sourceText':raw,'sourceQuantity':None,'sourceUnit':'','alternateMeasure':'','scalingMode':'unquantified'}
 m=re.match(r'^('+NUM+r')(?:\s*(?:to|–|-)\s*('+NUM+r'))?\s*',raw)
 if not m:return item
 q=number(m[1]);rest=raw[m.end():];maxq=number(m[2]) if m[2] else None
 # Exact printed measures only. No mass/volume conversion and no inferred weights.
 unit=re.match(r'^(?:(heaped|level)\s+)?(kg|g|ml|litres?|tbsps?|tsps?|cups?|oz)\b\s*',rest)
 if unit:
  u=clean((unit[1]+' ' if unit[1] else '')+unit[2]);rest=rest[unit.end():]
 else:u=''
 alt=''
 if rest.startswith('('):
  depth=0
  for i,c in enumerate(rest):
   depth+=(c=='(')-(c==')')
   if depth==0:alt=rest[:i+1];rest=rest[i+1:].strip();break
 # Preserve compound measures as unscaled raw text; no hidden guessing of pack weights.
 if rest.startswith(('x ','× ','/')) or (not u and re.match(r'(?:a |of |to )',rest)):
  return {**item,'scalingMode':'compound'}
 item.update(name=rest or raw,quantity=q,unit=u,sourceQuantity=q,sourceUnit=u,alternateMeasure=alt,scalingMode='range' if maxq is not None else 'exact')
 if maxq is not None:item['quantityMax']=maxq
 return item

WARNINGS={
 3:['Source method review: the printed method does not state when to add the listed cheese or fill the muffin tin. The method is reproduced as supplied; please confirm before cooking.'],
 10:['The nut brittle is a batch: the method uses one third and keeps the remainder. Shopping quantities below reproduce the complete batch as printed.'],
 13:['The oat topping is a batch: the method uses one third. Shopping quantities reproduce the complete batch as printed.'],
 14:['Source serving conflict: the heading says “Serves 1”, but step 6 divides the hash between two plates. The published yield and nutrition are retained, not recalculated. Confirm the intended yield before relying on the per-serving figures.'],
 21:['The method uses half of the chickpea mixture. Listed quantities reproduce the full prepared mixture, not just the amount served.'],
 26:['Source measure conflict: the chicken is printed as “200g (14 oz)”. Both values are preserved. Portion scaling uses the leading 200g value; the equivalent measure needs review.'],
 38:['The dressing lists fresh lemon juice, but the printed dressing step does not mention adding it. The source has not been silently amended.'],
 50:['Source method review: coconut milk is added in both steps 4 and 5, although only one quantity is listed. The printed method is preserved; confirm how to divide it.'],
 67:['Source ingredient review: the method stirs coriander into the rice, but the ingredient list only specifies coriander under the dressing. No extra quantity has been invented.'],
 73:['The pecan topping is a batch: the method uses half. Shopping quantities reproduce the complete batch as printed.'],
 76:['Source method review: step 1 refers to dark chocolate, which is not in the printed ingredient list. No missing ingredient or quantity has been invented.'],
 84:['The serving basis says “with 1/6 granola”. The ingredients make a batch of granola; shopping quantities reproduce the complete batch as printed.'],
}
RECIPES=[];audit=[]
for entry in index:
 pn=entry['page'];p=DOC[pn-1];ss=spans(p)
 header=[s for s in ss if re.fullmatch(r'(BREAKFAST|LUNCH|DINNER|SNACKS|DRINKS) / \d+',s['text'])][0]
 assert int(header['text'].split('/')[-1])==entry['number']
 gi=next(s for s in ss if s['text']=='What goes in');gd=next(s for s in ss if s['text']=='What you do')
 same_column=abs(gi['bbox'][0]-gd['bbox'][0])<5
 body=[s for s in ss if gi['bbox'][1]+20<s['bbox'][1]< (gd['bbox'][1] if same_column else 800) and s['bbox'][0]<(280 if same_column else gd['bbox'][0]-5) and s['size']<14]
 body.sort(key=lambda s:(s['bbox'][1],s['bbox'][0]))
 lines=[]
 for s in body:
  if lines and abs(lines[-1]['y']-s['bbox'][1])<.5:lines[-1]['text']+=' '+s['text']
  else:lines.append({'y':s['bbox'][1],'size':s['size'],'text':s['text']})
 groups=[];current='';prev=None
 for l in lines:
  if prev is not None and l['y']-prev['y']<=prev['size']*1.34:
   current+=' '+l['text']
  else:
   if current:groups.append(clean(current))
   current=l['text']
  prev=l
 if current:groups.append(clean(current))
 items=[];group='Main';ingredientNotes=[]
 for raw in groups:
  if re.match(r'^(for |to )',raw,re.I) and raw.endswith(':'):group=raw[:-1];continue
  if raw.startswith('*'):ingredientNotes.append(raw);continue
  items.append(parse_ingredient(raw,group))
 steps=[];numbers=[]
 for b in p.get_text('dict')['blocks']:
  if b['type']!=0:continue
  bs=[s for l in b['lines'] for s in l['spans']]
  starts=[s for s in bs if re.fullmatch(r'\d{1,2}',s['text']) and abs(s['bbox'][0]-gd['bbox'][0])<2 and gd['bbox'][1]<s['bbox'][1]<795]
  if starts:
   assert len(starts)==1,(pn,starts)
   numberSpan=starts[0];numbers.append(int(numberSpan['text']))
   steps.append(clean(' '.join(s['text'] for s in bs if s is not numberSpan)))
 assert numbers==list(range(1,len(numbers)+1)) and len(numbers)>0,(pn,numbers)
 serving=next(s['text'] for s in ss if re.match(r'(Serves|Makes) \d+',s['text']))
 yieldn=int(re.search(r'\d+',serving)[0]);label=serving.split('/ per ',1)[-1].split(' (')[0]
 ns={}
 for code,key in [('PROTEIN','protein'),('KCAL','calories'),('CARBS','carbs'),('FAT','fat')]:
  target=next(s for s in ss if s['text']==code)
  candidates=[s for s in ss if abs(s['bbox'][0]-target['bbox'][0])<2 and 0<target['bbox'][1]-s['bbox'][1]<45 and re.fullmatch(r'\d+(?:\.\d+)?g?',s['text'])]
  assert len(candidates)==1,(pn,code,candidates)
  ns[key]=float(candidates[0]['text'].rstrip('g'))
 # Read handwritten recipe captions by font family, including paired photo pages.
 captionSpans=[s for s in ss if 'Caveat' in s['font']]
 photos=[im for im in p.get_images() if im[2]>400 and im[3]>300 and im[2]/im[3]<3]
 photoPage=pn
 if not photos:
  prevp=DOC[pn-2]
  photos=[im for im in prevp.get_images() if im[2]>400 and im[3]>300 and im[2]/im[3]<3] if header['text'] in prevp.get_text() else []
  photoPage=pn-1
  if photos:captionSpans=[s for s in spans(prevp) if 'Caveat' in s['font']]
 dest=ROOT/'public/assets/cookbook'/f"recipe-{entry['number']:03}.webp"
 if photos:
  im=max(photos,key=lambda i:i[2]*i[3]);data=DOC.extract_image(im[0])['image']
  image=Image.open(io.BytesIO(data)).convert('RGB')
  if entry['number']==67:
   # This embedded photograph contains the original cover's large blank upper area.
   # Crop only that area; do not redraw or replace the supplied dish photograph.
   image=image.crop((0,round(image.height*.32),image.width,image.height))
  image.thumbnail((1400,1100));image.save(dest,'WEBP',quality=86,method=6)
 else: im=[None];photoPage=None
 r={'id':STABLE.get(entry['number'],slug(entry['name'])),'name':entry['name'],'category':entry['category'],'servings':yieldn,'servingLabel':label,'servingBasis':serving,'nutrition':ns,'nutritionSource':f"The High Protein Kitchen, page {pn}. Values reproduced from the uploaded book; supplied estimates, not independently analysed. Brands, alternatives and optional ingredients can change the figures.",'nutritionStatus':'source-estimate','source':f'The High Protein Kitchen · p. {pn}','sourceBook':'high-protein-kitchen','sourceRecipeNumber':entry['number'],'sourcePage':pn,'sourceImagePage':photoPage,'sourceSha256':HASH,'image':('/assets/cookbook/'+dest.name) if photos else '', 'imageNote':f'Original recipe photograph supplied in The High Protein Kitchen, page {photoPage}.' if photos else 'No photograph is supplied for this recipe in the uploaded book.','quote':clean(' '.join(s['text'] for s in captionSpans)),'ingredients':items,'steps':steps,'prepMinutes':None,'cookMinutes':None,'waitMinutes':None,'timeNote':'The book does not give separate total preparation, cooking and waiting times. Follow the timings stated in each method step.','notes':'\n'.join(ingredientNotes),'allergens':[],'allergenNote':'Allergens have not been independently classified. Check every ingredient label, including alternatives, sauces and protein powders.','sourceWarnings':WARNINGS.get(entry['number'],[]),'version':2}
 for i in r['ingredients']:
  if i['scalingMode'] in ['range','compound']:
   i['name']=i['sourceText'];i['quantity']=None;i['unit']='';i['note']='Quantity as printed; choose an explicit amount in your own version to scale numerically.';i.pop('quantityMax',None)
  elif i['alternateMeasure']:
   i['note']='Book’s original alternative measure: '+i['alternateMeasure']+'. This reference is not automatically converted.'
 if r['sourceWarnings']:r['notes']=('\n'.join(r['sourceWarnings'])+'\n'+r['notes']).strip()
 RECIPES.append(r);audit.append({**entry,'id':r['id'],'ingredientCount':len(items),'stepCount':len(steps),'sourceLines':groups,'photoPage':photoPage,'imageXref':im[0],'imageSha256':hashlib.sha256(dest.read_bytes()).hexdigest() if photos else None})
 assert 'What goes in' in p.get_text()
 assert len(items)>=4 and len(items)<=40,(pn,len(items))
# Digital cover/back: render source, not an invented mockup or replacement cover.
for pg,nm in [(0,'high-protein-kitchen-cover'),(142,'high-protein-kitchen-back')]:
 pix=DOC[pg].get_pixmap(matrix=fitz.Matrix(1.7,1.7),alpha=False);img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);img.save(ROOT/'public/assets/cookbook'/f'{nm}.webp','WEBP',quality=90,method=6)
(ROOT/'data/cookbooks/high-protein-kitchen.json').write_text(json.dumps({'source':{'filename':PDF.name,'sha256':HASH,'pages':143,'recipeCount':100,'title':'The High Protein Kitchen'},'recipes':RECIPES},ensure_ascii=False,indent=2))
(ROOT/'data/cookbooks/import-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
print('Extracted',len(RECIPES),'recipes;',sum(len(r['ingredients']) for r in RECIPES),'ingredients;',sum(len(r['steps']) for r in RECIPES),'steps')
print('Source image total:',sum(p.stat().st_size for p in (ROOT/'public/assets/cookbook').glob('*')))
print('First/last',RECIPES[0]['name'],RECIPES[-1]['name'])
for r in RECIPES:
 print(r['sourceRecipeNumber'],r['sourcePage'],len(r['ingredients']),len(r['steps']),r['name'],r['quote'][:50])
