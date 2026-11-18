import { esc } from './library-shelves.mjs';

// Use existing website photographs; never turn an imported URL into an arbitrary request.
export function recipeImage(record){
  const value=record.kind==='recipe'&&record.fields?.imageUrl;
  return typeof value==='string'&&/^\/assets\/(?:cookbook|recipe-library)\/[a-zA-Z0-9_-]+\.(?:webp|png|jpg|jpeg)$/.test(value)?value:'';
}
export function recipePreview(record){
  const f=record.fields||{},photo=recipeImage(record);
  const ingredient=v=>typeof v==='string'?v:v.sourceText||[v.quantity,v.unit,v.name].filter(x=>x!==null&&x!==undefined&&x!=='').join(' ');
  const text=value=>value?'<p class="prose">'+esc(value)+'</p>':'';
  const time=(value,label)=>typeof value==='number'?'<span>'+label+': '+esc(value)+' minutes</span>':'';
  const nutrition=f.nutrition||{};
  return '<article class="studio-preview">'+(photo?'<img src="'+esc(photo)+'" alt="'+esc(record.title)+'" style="width:100%;max-width:600px;max-height:400px;object-fit:cover;border-radius:12px">':'')+
    '<h2>'+esc(record.title)+'</h2>'+text(f.description)+text(f.quote)+
    '<p>'+esc(f.servingBasis||('Serves '+f.servings))+'</p><div class="studio-actions">'+time(f.prepMinutes,'Preparation')+time(f.cookMinutes,'Cooking')+'</div>'+text(f.timeNote)+
    '<h3>Ingredients</h3><ul>'+(f.ingredients||[]).map(v=>'<li>'+esc(ingredient(v))+'</li>').join('')+'</ul>'+
    '<h3>Method</h3><ol>'+(f.instructions||[]).map(v=>'<li>'+esc(v)+'</li>').join('')+'</ol>'+text(f.notes)+
    '<h3>Nutrition</h3>'+(!Object.keys(nutrition).length?'<p>Nutrition figures are not available for this recipe.</p>':'<dl>'+[['calories','Calories',' kcal'],['protein','Protein',' g'],['carbohydrates','Carbohydrates',' g'],['fat','Fat',' g'],['fibre','Fibre',' g']].filter(([key])=>nutrition[key]!==undefined&&nutrition[key]!==null&&nutrition[key]!=='').map(([key,label,unit])=>'<dt>'+label+'</dt><dd>'+esc(nutrition[key])+unit+'</dd>').join('')+'</dl>')+
    text(f.nutritionSource)+'<h3>Allergen information</h3>'+text(f.allergenNote||'Check ingredient labels and alternatives for your requirements.')+text((f.allergens||[]).join(', '))+
    '<details><summary>Recipe source</summary>'+text(f.recipeSource)+text(f.imageNote)+'</details></article>';
}
