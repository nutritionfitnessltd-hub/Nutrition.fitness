# QA report — 10 September 2026

## Passed

- 62 generated HTML pages plus a custom 404.
- 4,498 internal page/image/style/module references checked against generated targets, with no missing targets.
- 35 Node unit tests: 21 shared-commerce tests and 14 mocked test-checkout-adapter tests.
- 36 browser interaction checks using Chromium, including shop filtering/search, one-off defaults, product add-ons, quantity edits, price recalculation, delivery interval changes, basket persistence, subscription builder, consent, demo checkout, receipts, account controls, coach selection, onboarding, escaped user input, unspecified macro targets, support drafts and mobile navigation.
- 75 responsive layout checks: 15 key pages at 320, 390, 768, 1024 and 1440 pixels. No horizontal document overflow in the tested viewports.
- No runtime JavaScript errors in the recorded interaction checks.
- Full-page desktop/mobile screenshots supplied under `docs/previews/`.

## How these were tested

The sandbox browser blocked network/localhost navigation. Browser tests therefore used the portable review generated from the same HTML, CSS, data, calculations and interactive JavaScript. The wrapper maps internal page navigation and embeds local assets; it is not a substitute production renderer. The normal static source was rebuilt and its targets checked separately.

Run `npm run check` for the Node tests, build and reference checker. Run `npm run review` to regenerate the offline review. `tests/browser_qa.py` and `tests/responsive_qa.py` require Python Playwright plus Chromium. Set `CHROMIUM_PATH` when Chromium is installed at another path. Those optional QA dependencies are not website runtime dependencies.

Machine-readable browser results are in `tests/browser-results.json` and `tests/responsive-results.json`.

## Not verified

No Vercel deployment, real Stripe checkout session, live account connection, webhook, payment capture, stock update, email, ebook delivery or subscription renewal has been performed. The test adapter's network calls were mocked. The default browser checkout is intentionally a local demo.

Native Safari/iOS/Android browsers, assistive technologies and a formal WCAG audit have not been tested. Keyboard mobile-menu closing, labels and focus states are present, but this is not a claim of accessibility certification.

Google-hosted fonts were not fetched in the sandbox. Screenshots use the available fallbacks and supplied handwriting image assets. Verify final typography and platform routing in the hosted preview after deployment.

Final content, nutritional/product claims, formulas, legal notices, prices, tax and delivery terms require business/professional approval. No test result certifies those commercial or regulatory matters.
