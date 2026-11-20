import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ideaProjectPage} from '../server/studio-shiny-things.mjs';
import {studioFrame} from '../server/studio-ui.mjs';
import {changeStudio} from '../server/studio-actions.mjs';
const actor={id:'admin',role:'admin'},root=path.resolve(import.meta.dirname,'../public');
const pilot={id:'pilot',kind:'lesson',title:'Basal Metabolic Rate & Energy Expenditure',workerId:'imogen',sourceId:'source1',status:'Draft',revision:2,fields:{}};
const recipe={id:'recipe',kind:'recipe',title:'Breakfast recipe cards',workerId:'imogen',status:'In review',revision:1,fields:{collection:'Recipes'}};
const projects=['courses','other'].map(id=>({id,name:id==='courses'?'Course branding tracker':'Imogen’s other content tracker',brief:'Imogen brands. Kasia reviews and approves. Morgan tracks progress.',creator_id:'kasia',revision:1,weeks:1,status:'In progress',entries:[{id:'task',title:'Example task',notes:'A task for deletion testing',kind:'Task',week:0,status:'To do'}],studio:{type:'custom',productionTracking:{scope:id,worker:'imogen',course:'Fat Loss Course',pilotIds:['pilot']}}}));
const meta={courses:{'Fat Loss Course':{order:'confirmed',sections:[{title:'Module 1 — The Physiology of Fat Loss',entries:[{id:'source1',title:pilot.title,position:1},{id:'source2',title:'Why Do We Gain Fat?',position:2},{id:'source3',title:'How Do We Lose Fat?',position:3}]}]},'Longevity Course':{order:'confirmed',sections:[{title:'Module 1',entries:[{id:'source4',title:'Introduction to longevity',position:1}]}]}}};
const data={actor,projects,people:[{id:'kasia',name:'Kasia'}],items:[pilot,recipe],byId:new Map([[pilot.id,pilot],[recipe.id,recipe]]),assigned:new Set(),index:{records:[]},trackingMeta:meta};
const api=async(endpoint,options)=>{if(!endpoint.startsWith('/rest/v1/nufi_library_projects?'))throw Error('Unrelated save');const params=new URL('http://fixture'+endpoint).searchParams,p=projects.find(p=>p.id===params.get('id').slice(3));if(p.revision!==Number(params.get('revision').slice(3)))return [];Object.assign(p,options.payload);return [p];};
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://fixture');if(u.pathname==='/content-library/'){
  if(req.method==='POST'){let text='';for await(const chunk of req)text+=chunk;await changeStudio(u.searchParams,Object.fromEntries(new URLSearchParams(text)),data,api);res.writeHead(303,{Location:u.pathname+u.search});return res.end();}
  res.setHeader('Content-Type','text/html');return res.end(studioFrame(ideaProjectPage(u.searchParams,data,meta),'project',actor,{}));
 }
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep))throw Error('Bad path');res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch(e){res.statusCode=400;res.end(e.message);}}).listen(4318,'127.0.0.1',()=>console.log('Tracker preview: http://127.0.0.1:4318/content-library/?work=1&studio=project&project=courses'));
