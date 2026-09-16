/** Explainable routing, not a medical assessment or a personalised exercise prescription. */
export const BASES = Object.freeze({
 core: {name:'core', title:'A stronger starting point.', summary:'Foundational strength, movement and everyday fitness. Your foundation stays in place as you progress.', focus:['arms','chest','shoulders','glutes','legs','abs','mobility'], accent:'petrol'},
 build:{name:'build', title:'Build muscle. Not complications.',summary:'A muscle-building base with progressive resistance training. Focus areas add a size-focused emphasis, not a renamed core workout.',focus:['arms','chest','shoulders','back','glutes','legs','abs'],accent:'green'},
 lean:{name:'lean',title:'Progress that fits real life.',summary:'Strength and sustainable activity alongside your nutrition plan. No promised spot reduction or crash-diet shortcut.',focus:['arms','glutes','legs','abs','mobility'],accent:'terracotta'},
 fit:{name:'fit',title:'More get-up-and-go.',summary:'General conditioning and fitness for everyday life. Running, swimming and cycling also have their own dedicated bases.',focus:['strength','mobility','endurance'],accent:'ochre'},
 run:{name:'run',title:'Your next step, sorted.',summary:'A running-led base matched to your starting point, with supporting strength and mobility.',focus:['strength','mobility','endurance'],accent:'green'},
 swim:{name:'swim',title:'Find your rhythm.',summary:'A swimming-led base for people with pool access. Your level and water confidence belong in full onboarding.',focus:['strength','mobility','endurance'],accent:'petrol'},
 bike:{name:'bike',title:'A plan with a little momentum.',summary:'A cycling-led base for an indoor or outdoor bike, with supporting strength and mobility.',focus:['strength','mobility','endurance'],accent:'terracotta'},
});
const options = (pairs) => pairs.map(([value,label])=>({value,label}));
export const QUESTIONS = [
 {id:'goal', title:'What would you most like to work towards?', help:'Pick the thing that matters most. Not the thing you think you should say.', options:options([['foundation','Feel stronger and get into a routine'],['muscle','Build muscle'],['fat-loss','Manage my weight and feel healthier'],['fitness','Improve my general fitness'],['running','Make progress with running'],['swimming','Make progress with swimming'],['cycling','Make progress with cycling']])},
 {id:'experience',title:'Where are you starting from?',help:'A fresh start counts as a start.',options:options([['new','I am new to structured training'],['returning','I am getting back into it'],['regular','I train regularly already']])},
 {id:'equipment',title:'What can you actually use?',help:'Select everything available to you. No imaginary home gym required.',multiple:true,options:options([['bodyweight','A little space at home'],['weights','Dumbbells or resistance equipment'],['gym','A gym'],['outdoors','A place to walk or run'],['pool','A swimming pool'],['bike','An indoor or outdoor bike']])},
 {id:'days',title:'How many days could you realistically make time for?',help:'An honest two is more useful than an optimistic seven.',options:options([['2','Two days'],['3','Three days'],['4','Four days'],['5','Five or more days']])},
 {id:'minutes',title:'How long have you usually got?',help:'Include the days when life gets in the way.',options:options([['20','About 20 minutes'],['30','About 30 minutes'],['45','About 45 minutes'],['60','About an hour']])},
 {id:'focus',title:'Anything you would like extra focus on?',help:'Choose as many as you like. We will keep your base and available time in view.',multiple:true,optional:true,options:options([['arms','Arms'],['chest','Chest'],['shoulders','Shoulders'],['back','Back'],['glutes','Glutes'],['legs','Legs'],['abs','Abs'],['strength','Strength'],['mobility','Mobility'],['endurance','Endurance']])},
 {id:'barrier',title:'What usually gets in the way?',help:'This helps us make the next step useful, rather than just enthusiastic.',options:options([['time','Finding the time'],['confidence','Knowing what to do'],['consistency','Sticking with it'],['food','Getting my food organised'],['cost','Keeping the cost sensible']])},
];
export function validateAnswers(input, complete=true) {
 if(!input || typeof input!=='object' || Array.isArray(input)) throw new TypeError('Quiz answers must be an object.');
 const clean={};
 for(const q of QUESTIONS){
  const v=input[q.id];
  if(v===undefined){if(complete&&!q.optional)throw new Error(`Please answer: ${q.title}`);if(q.multiple)clean[q.id]=[];continue;}
  const allowed=new Set(q.options.map(o=>o.value));
  if(q.multiple){if(!Array.isArray(v)||v.length>q.options.length||v.some(x=>!allowed.has(x)))throw new Error(`Invalid ${q.id} selection.`);clean[q.id]=[...new Set(v)];if(complete&&!q.optional&&!clean[q.id].length)throw new Error(`Please answer: ${q.title}`);}
  else{if(typeof v!=='string'||!allowed.has(v))throw new Error(`Invalid ${q.id} selection.`);clean[q.id]=v;}
 }
 return clean;
}
export function recommend(input, chosenBase) {
 const answers=validateAnswers(input), map={foundation:'core',muscle:'build','fat-loss':'lean',fitness:'fit',running:'run',swimming:'swim',cycling:'bike'};
 if(chosenBase!==undefined&&!Object.hasOwn(BASES,chosenBase))throw new Error('Unknown programme.');
 const suggested=map[answers.goal], base=chosenBase??suggested, definition=BASES[base];
 const focus=answers.focus.filter(x=>definition.focus.includes(x));
 const notAdded=answers.focus.filter(x=>!definition.focus.includes(x));
 const warnings=[];
 if(base==='swim'&&!answers.equipment.includes('pool'))warnings.push('Swimming needs pool access. Add pool access to your answers or choose another base before starting.');
 if(base==='bike'&&!answers.equipment.includes('bike'))warnings.push('Cycling needs access to an indoor or outdoor bike.');
 if(base==='build'&&!answers.equipment.some(x=>['gym','weights'].includes(x)))warnings.push('A muscle-building plan needs suitable resistance equipment. Confirm your equipment during onboarding.');
 if(focus.length>1)warnings.push('All your selected focus areas are saved. Onboarding must fit their training volume around your available time; they are not extra full workouts.');
 if(notAdded.length)warnings.push(`${notAdded.map(x=>'.'+x).join(', ')} ${notAdded.length===1?'is':'are'} not offered as focus add-ons for ${base}. Your preferences are kept, not silently changed.`);
 return {base, suggested, focus, notAdded, name:[base,...focus].join('.'),
  reason:`Your main goal is “${QUESTIONS[0].options.find(o=>o.value===answers.goal).label.toLowerCase()}”. ${definition.summary}`,
  level:answers.experience==='regular'?'Regular training experience':'Foundation / return-to-training starting point',
  availability:`${answers.days==='5'?'5+':answers.days} days · ${answers.minutes} minutes`,
  overridden:base!==suggested, warnings, answers, version:'programme-finder-v1'};
}
