import {build} from 'esbuild';
await build({entryPoints:['client/product-upload.mjs'],outfile:'public/product-upload.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'inline'});
