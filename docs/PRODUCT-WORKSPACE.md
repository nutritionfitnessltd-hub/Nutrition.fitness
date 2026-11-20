# Products workspace

Open Team Workspace → Products. Add a supplement, equipment, clothing, accessory or other physical product, then use **Overview**, **Product assets**, **Ads & creatives** and **Work**.

- Product records hold supplier, SKU, variants, launch progress/date, a team folder link and optional supplement information.
- Asset records hold uploaded files, editable originals (including Canva), finished SharePoint links, copy, campaign, channel and dimensions. The shared Ads & creatives gallery and each product use the same asset record. Existing creative assets can be linked without making another copy.
- Uploaded images provide the cards' thumbnails. Choose a product cover in Edit product; otherwise the first linked image is used. Without an image, a labelled placeholder appears.
- Review uses the existing draft, review, approval and retirement workflow. Changing creative details or attaching a file clears approval. Retiring an asset retains its version history and files.
- Link existing projects under Work to display their saved task progress. Product association does not automatically create or assign work.

## Storage and access

Products and assets use the existing private `nufi_studio_items` JSON records, optimistic revisions and version history. No schema migration or new service is required. Administrators create products; staff can edit assigned products and their linked assets. Sharing an asset with another product does not grant access to that product.

File uploads reuse the existing private Vercel Blob store and `BLOB_READ_WRITE_TOKEN`. The browser uploads directly with a short-lived token restricted to one asset path and MIME type, with overwriting disabled. The server verifies the resulting file's metadata before attaching it. Downloads require workspace authentication and record access; URLs do not expose the Blob credential. Missing storage configuration reports an error and leaves the source-link workflow available.

Supported uploads: JPEG, PNG, WebP, PDF, DOCX, XLSX, PPTX, ZIP, MP4, WebM and MP3; up to 250 MB per file and 20 files per asset. Files are not automatically copied to SharePoint. SharePoint and Canva entries are links to files managed in those services.

## Verification

`npm run check` builds the site and uploader, runs the test suite, then checks generated links and launch visibility. `tests/studio-products.test.mjs` covers save/reload, filtering, review, linking, permissions, revision conflicts and private upload/download validation with an injected storage adapter.

For an isolated visual check after building, run `node tests/products-preview.mjs`. It prints a localhost address and uses disposable sample records in memory. The fixture serves an existing product photograph locally; it never calls live storage or the production database.

This area manages product information and creative work. It does not change stock, orders, the public shop or publication status.
