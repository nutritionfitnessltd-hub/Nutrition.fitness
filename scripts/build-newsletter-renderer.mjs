import {build} from 'esbuild';

// Some serverless Node runtimes disable require(ESM). Bundle the sanitizer's
// ESM parser dependency at build time while retaining the patched release.
await build({
  entryPoints:['server/newsletter-sanitize.mjs'],
  outfile:'server/generated/newsletter-sanitize.mjs',
  bundle:true,platform:'node',format:'esm',target:'node22',
  banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},
  legalComments:'inline'
});
