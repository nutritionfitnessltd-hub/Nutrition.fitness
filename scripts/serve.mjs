import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../dist'),port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(url.pathname);
 let file=path.resolve(root,'.'+pathname);
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
 if(pathname.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'This service is not connected in this preview. Please try again once it has been enabled.'}));return;}
 let status=200;
 try{const stat=await fs.stat(file);if(stat.isDirectory()){if(!pathname.endsWith('/')){res.writeHead(308,{location:url.pathname+'/'+url.search});res.end();return;}file=path.join(file,'index.html');}await fs.access(file);}catch{file=path.join(root,'404.html');status=404;}
 const data=await fs.readFile(file);res.writeHead(status,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff'});if(req.method==='HEAD')res.end();else res.end(data);
 }catch{res.writeHead(500);res.end('The preview could not load this page.');}
}).listen(port,'0.0.0.0',()=>console.log(`Nutrition.Fitness preview: http://localhost:${port}`));
