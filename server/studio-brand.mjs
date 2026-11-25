import { readFile } from 'node:fs/promises';
import { HttpError } from './platform.mjs';
import { canAccess } from './library-permissions.mjs';
import { esc, url, heading, button, form, hidden, textarea } from './studio-ui.mjs';

export const brandKit='https://www.canva.com/brand/kAHV121Q0lU';
export const defaultGuidance='Use clear, friendly British English. Explain the next useful action. Use our approved programmes as references. Keep coaching notes varied and specific to the week.';
const palette=[['Navy / Ink','#092A3E'],['Petrol','#06475E'],['Petrol Hover','#05394C'],['Plum / Berry','#863954'],['White','#FFFFFF'],['Cream','#FAF6EF'],['Aqua','#E3EDF0'],['Blush','#F9E7E3'],['Sage','#DFE5D0'],['Peach','#F2DFD2'],['Divider','#D6DDD9'],['Muted Slate','#536572'],['Pale Sage','#E9EEDF'],['Green','#376747'],['Soft Plum','#E8D8E0'],['Terracotta','#9A4936'],['Pale Gold','#F6ECD7'],['Ochre','#805C19'],['Protein Blush','#FBE9E7'],['Input Border','#C7D0D5'],['Error Red','#962F2F'],['Green Hover','#2B5238']];
const themes=[['General & programmes','Aqua','#E3EDF0','Petrol','#06475E'],['Food & meal planning','Sage','#DFE5D0','Green','#376747'],['Programme finder','Pale Sage','#E9EEDF','Green','#376747'],['Courses & learning','Peach','#F2DFD2','Terracotta','#9A4936'],['Editorial','Pale Gold','#F6ECD7','Ochre','#805C19'],['Brand emphasis','Soft Plum','#E8D8E0','Plum','#863954']];
export function brandInstructions(extra=''){
  return [defaultGuidance,'Brand: nutrition.fitness. Tagline: Real food. Real progress. A fitter, happier you.',
    'Use the navy wordmark with its registered symbol and full tagline. Keep its proportions and clear space.',
    'Typography: DM Sans for body (400), secondary text (500), buttons (600), headings (700) and hero headings (800–850). Kalam Regular for short handwritten notes.',
    'White main canvas, navy #092A3E text, muted slate #536572 secondary text. Cream #FAF6EF is for small inset accents, not large background blocks.',
    "Course video and slide colour rule: use the Fat Loss Course as the visual reference. Keep the main slide canvas predominantly white. Break up large flat areas with restrained navy #092A3E panels or shapes where they improve hierarchy; use navy sparingly, not as the default background. Do not use large cream, beige or peach blocks as the main surface. Keep cream/peach to small accents only. Preserve photographs, diagrams, original wording, layout, animation, timing and narration; make touching objects contrast clearly. Retain DM Sans, short Kalam accents and the current nutrition.fitness logo/tagline. Judge the balance across the whole lesson and on mid/late animation frames, not just the title slide.",
    'Use the subject palette: '+themes.map(([name,panel,pale,accent,hex])=>name+': '+panel+' '+pale+' with '+accent+' '+hex).join('; ')+'.',
    'Keep existing resource content and layouts, making only minor fitting adjustments for fonts and logo. Check every page for overflow, contrast and complete content.',
    extra?'Additional saved guidance: '+extra:''].filter(Boolean).join('\n');
}
export function brandPage(data){
  const r=data.byId.get('studio:standards');
  return heading('Brand guide','Our logo, colours, fonts and voice.',button('Open full guide',url('brand-file',{file:'guide'})))+
    '<div class="studio-brand-grid"><section class="panel studio-brand-logo"><h2>Our logo</h2><img src="'+url('brand-file',{file:'logo-png'})+'" alt="nutrition.fitness. Real food. Real progress. A fitter, happier you."><p>Use the navy logo with the full tagline. Keep its proportions and give it space.</p><div class="studio-actions">'+button('Download SVG',url('brand-file',{file:'logo-svg',download:'1'}))+button('Download PNG',url('brand-file',{file:'logo-png',download:'1'}))+'</div></section>'+
    '<section class="panel"><h2>Fonts & voice</h2><p class="studio-brand-font">DM Sans</p><p>Our main font for headings and body text. Use <strong>Kalam Regular</strong> for short handwritten notes.</p><p>Write in clear, friendly British English. Be practical, specific and encouraging. Explain the next useful action.</p>'+button('Open Canva brand kit',brandKit)+'</section></div>'+
    '<section class="panel"><h2>Colours by subject</h2><p>Start with a white background and navy text. Choose the colours that fit the content.</p><div class="studio-brand-themes">'+themes.map(([name,panel,pale,accent,hex])=>'<div class="studio-brand-theme"><h3>'+esc(name)+'</h3><span>'+panel+' <code>'+pale+'</code></span><span>'+accent+' <code>'+hex+'</code></span></div>').join('')+'</div><details><summary>Full colour palette</summary><div class="studio-brand-palette">'+palette.map(([name,hex],index)=>'<div><span class="studio-brand-swatch studio-brand-swatch-'+index+'" aria-hidden="true"></span><span>'+name+'<br><code>'+hex+'</code></span></div>').join('')+'</div></details></section>'+
    (data.actor.role==='admin'?'<details class="panel"><summary>Writing guidance for drafts</summary><p>The brand guide above accompanies new AI drafts. Add any extra writing guidance here.</p>'+form('standards-save',hidden('revision',r?.revision||0)+textarea('guidance','Additional guidance',r?.fields.guidance||defaultGuidance,5),{section:'standards'},'Save guidance')+'</details>':'')+
    '<p class="meta">Based on your supplied website style guide and current Resource Brand kit.</p>';
}
export async function sendBrandFile(req,res,params,actor){
  if(actor.role!=='admin'&&!canAccess(actor,'shared_library'))throw new HttpError(403,'Shared brand access is required.');
  if(req.method!=='GET')throw new HttpError(405,'Use GET to open a brand file.');
  const files={guide:['brand-guide.pdf','application/pdf'], 'logo-svg':['logo.svg','image/svg+xml'], 'logo-png':['logo.png','image/png']};
  const file=files[params.get('file')];if(!file)throw new HttpError(404,'Brand file unavailable.');
  const body=await readFile(new URL('./brand-assets/'+file[0],import.meta.url));
  res.statusCode=200;res.setHeader('Content-Type',file[1]);res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Disposition',(params.get('download')==='1'?'attachment':'inline')+'; filename="nutrition-fitness-'+file[0]+'"');
  res.end(body);
}
