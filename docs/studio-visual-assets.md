# Studio imagery

The portraits in `public/assets/studio-team/` depict fictional AI workers. They are served locally as 512px JPEGs (about 167 KB combined), with descriptive alternative text and fixed dimensions.

- `nina.jpg`: existing Nina portrait from James HQ, `public/agents/nina.jpg`.
- `imogen.jpg`: existing Imogen portrait from James HQ, `public/agents/imogen.png`.
- `marcus.jpg` and `rory.jpg`: generated with the built-in image generation tool on 18 November 2026, then resized and compressed for the site. The original generated files are retained in the Codex image directory. These images do not imply professional credentials or an active worker connection.

## Generation prompts

Marcus: A warm, professional studio portrait for Marcus, a fictional male AI Training & Programme Designer for nutrition.fitness. Man approximately late 30s, short dark curly hair, light trimmed beard, medium brown skin, calm encouraging smile, wearing a simple deep teal athletic polo. Centered head-and-shoulders, face fully visible, square composition, soft warm peach background. Polished slightly stylized realistic digital character portrait, natural skin texture, warm soft light, consistent with a friendly virtual team directory. No text, logos, credentials, medical imagery or props. Save as a project portrait.

Rory: A warm, professional studio portrait for Rory, a fictional male AI social and video creative for nutrition.fitness. Man approximately early 30s, wavy auburn-brown hair, clean-shaven, fair skin, engaging friendly smile, wearing a simple muted blue casual shirt. Centered head-and-shoulders, face fully visible, square composition, soft sky blue background. Polished slightly stylized realistic digital character portrait, natural skin texture, warm soft light, consistent with a friendly virtual team directory. No text, logos, credentials or props. Save as a project portrait.

## Content photography

Dashboard, library categories and Studio choices reuse the website's existing photographs: knowledge-3, 15, 28, 30, 36, 42 and 57. Source URLs, alternative text and credits are maintained in `src/knowledge-centre/articles.json` and copied to the generated photo manifest. The existing prebuild fetches and validates these assets; no browser-side third-party image request is needed.

`server/studio-visuals.mjs` shares the image mapping across these views. Photography illustrates content types; it does not claim to be a thumbnail of a specific unpublished item. Worker identities remain in `server/studio-workers.mjs`.
