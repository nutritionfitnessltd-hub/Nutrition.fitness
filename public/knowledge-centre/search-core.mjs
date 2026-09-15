export const normalize=s=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ');
const stopwords=new Set(['how','do','i','a','the','to','does','is','it','my','and','of','for','can','am','with','in','what']);
export const words=q=>normalize(q).split(/\s+/).filter(w=>w&&!stopwords.has(w));
export function matches(a,selected,omit){return ['categories','topics','situations'].every(key=>key===omit||!selected[key]?.length||selected[key].some(value=>key==='categories'?a.category===value:a[key].includes(value)));}
export function textMatches(a,query){const hay=normalize([a.title,a.summary,...a.topics,...a.situations,a.category].join(' '));return words(query).every(w=>hay.includes(w));}
