// Existing website photography, fetched and verified by the normal build.
const scenes={
 food:['knowledge-57','Fresh ingredients for everyday meals'],
 meals:['knowledge-28','Colourful lunches prepared in glass containers'],
 training:['knowledge-42','Dumbbells and a resistance band ready for a workout'],
 learning:['knowledge-36','An open book and handwritten notes'],
 community:['knowledge-30','Friends enjoying a walk together'],
 planning:['knowledge-15','An open planner ready for new ideas'],
 video:['knowledge-3','A phone recording a training session']
};
const topics={recipe:'food',mealplan:'meals',programme:'training',workout:'training',session:'training',exercise:'training',activity:'training',challenge:'community',course:'learning',lesson:'learning',ebook:'learning',article:'learning',branding:'planning',scripts:'learning',newsletter:'planning',emails:'planning',communication:'community',campaign:'planning',landing:'planning',socials:'community',video:'video',asset:'video'};
export function contentPhoto(kind,css='content-scene',eager=false){
 const [file,alt]=scenes[topics[kind]||'planning'];
 return '<img class="'+css+'" src="/assets/photos/'+file+'.jpg" alt="'+alt+'" width="700" height="440" loading="'+(eager?'eager':'lazy')+'" decoding="async">';
}
export function workerPortrait(worker,css='worker-portrait'){
 return '<img class="'+css+'" src="'+worker.portrait+'" alt="'+worker.name+'" width="96" height="96" loading="lazy" decoding="async">';
}
