import {build} from 'esbuild';
await build({entryPoints:['client/product-upload.mjs'],outfile:'public/product-upload.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'inline'});

await build({entryPoints:['client/task-upload.mjs'],outfile:'public/task-upload.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'inline'});

await build({entryPoints:['client/team-message-upload.mjs'],outfile:'public/team-message-upload.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'inline'});
