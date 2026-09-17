export const launchDate='2026-11-01';
export const workstreams=[
{id:'offer',name:'Offer & Commercial Model',short:'Lock what we sell, to whom, for how much.'},
{id:'platform',name:'NUFI Platform & Technology',short:'Make the app, infrastructure and release process production-ready.'},
{id:'content',name:'Programmes, Courses & Content',short:'Complete what customers actually consume.'},
{id:'products',name:'Products & Supply Chain',short:'Make physical products manufacturable, profitable and shippable.'},
{id*'website',name:'Website, Shop & Customer Journey',short:'Turn the commercial model into a clear buying journey.'},
{id:'marketing',name:'Marketing & Sales Engine',short:'Build acquisition, conversion, onboarding and retention.'},
{id:'business',name:'Business, Finance & Operations',short:'Put the finance, compliance and ownership structure behind launch.'},
{id:'readiness',name:'Launch Readiness & Support',short:'Test the whole company as one connected system.'}
];
export const phases=[
{id:'lock',name:'LOCK',dates:'17–20 Sep',start:'2026-09-17',end:'2026-09-20',objective:'Stop changing the foundations. Lock offer, catalogue, pricing, owners and priorities.'},
{id:'core',name:'CORE BUILD',dates:'21–27 Sep',start:'2026-09-21',end:'2026-09-27',objective:'Build the production core across NUFI, content, products and site structure.'},
{id:'sellable',name:'MAKE SELLABLE',dates:'28 Sep–4 Oct',start:'2026-09-28',end:'2026-10-04',objective:'Complete checkout, subscriptions, product readiness, imagery and analytics.'},
{id:'sales',name:'SALES ENGINE',dates:'5–11 Oct',start:'2026-10-05',end:'2026-10-11',objective:'Connect quiz, CRM, email, landing pages and launch campaign.'},
{id:'uat',name:'UAT',dates:'12–18 Oct',start:'2026-10-12',end:'2026-10-18',objective:'Test real end-to-end customer scenarios and fix material faults.'},
{id:'beta',name:'REAL-WORLD BETA',dates:'19–25 Oct',start:'2026-10-19',end:'2026-10-25',objective:'Put the finished journey in front of real people and remove confusion.'},
{id:'freeze',name:'FREEZE',dates:'26–30 Oct',start:'2026-10-26',end:'2026-10-30',objective:'No major features. Fix only launch blockers, defects, tracking and compliance.'},
{id:'gonogo',name:'GO / NO-GO',dates:'31 Oct',start:'2026-10-31',end:'2026-10-31',objective:'Run the final operational checklist and approve launch.'},
{id:'launch',name:'GO LIVE',dates:'1 Nov',start:'2026-11-01',end:'2026-11-01',objective:'Release in controlled waves and monitor the full customer journey.'}
];
export const t=(id,workstream,title,priority,phase,due,instructions,done,deps=[],owner='Unassigned',status='todo')=>({id,workstream,title,priority,phase,due,instructions,done,deps,owner,status,notes:[],submissions:[],activity:[{at:'2026-09-17T14:30:00+01:00',by:'System',text:'Task created from launch brain dump and launch-plan clean-up.'}]});
export const team=[
{id:'james',name:'James',role:'Launch lead / Admin'},
{id:'tech',name:'Technology',role:'NUFI, web and integrations'},
{id:'product',name:'Product',role:'Supplements, packaging and supply chain'},
{id:'marketing',name:'Marketing',role:'CRM, acquisition and lifecycle'},
{id:'finance',name:'Finance',role:'Accounts, forecasts and reconciliation'},
{id:'content',name:'Content',role:'Programmes, courses, workouts and recipes'},
{id:'support',name:'Customer Support',role:'Launch support and escalation'},
{id:'unassigned',name:'Unassigned',role:'Needs an owner'}
];
export const decisions=[
{id:'DEC-001',date:'2026-09-16',title:'Launch date',decision:'Nutrition.Fitness launch target is 1 November 2026.',owner:'James',status:'locked'},
{id:'DEC-002',date:'2026-09-15',title:'Website background',decision:'Customer-facing Nutrition.Fitness website uses a white background.',owner:'James',status:'locked'},
{id:'DEC-003',date:'2026-09-11',title:'Imagery rule',decision:'Jeff and Steff remain illustrated. Recipes, workouts, lifestyle and products use believable real photography.',owner:'James',status:'locked'},
{id:'DEC-004',date:'2026-09-16',title:'Programme architecture',decision:'Use base programmes with optional bolt-ons rather than one huge undifferentiated programme list.',owner:'James',status:'locked'},
{id:'DEC-005',date:'2026-09-17',title:'Launch-control rule',decision:'P0 means launch blocker. P1 improves launch. P2 can safely move post-launch.',owner:'James',status:'locked'}
];
