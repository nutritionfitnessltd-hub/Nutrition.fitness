# Shiny Things visibility and weekly discussions

Personal ideas are visible only to the signed-in owner. Team ideas are visible to current members of the selected team, using the administrator-managed team profile. Company means this Nutrition.Fitness workspace. There is no administrator override for another person's Personal ideas. Existing ownerless ideas remain administrator-only until their first save records the administrator as owner.

All library-enabled staff can open Shiny Things. Editing requires library/edit access. Only the submitter can change an idea or its visibility; eligible viewers with edit access can record a discussion. Team sharing requires membership in that team. Team profile changes affect the next request. Ideas are removed from shared studio data before rendering other pages, not only hidden on the board.

The weekly discussion view includes shared ideas marked For discussion. Explore requires an eligible follow-up owner; due dates are optional and validated. Park moves the idea to Parked. Dismiss removes it from the active board, with a separate Dismissed ideas view. Decisions clear the agenda flag. Saving a discussion never creates a project or assigns an AI worker. Existing administrator project planning remains separate.

## Deployment

Deploy the content-worker-bridge change before enabling the website change. The service connector has no signed-in member identity, so it cannot list or retrieve owned Personal/Team ideas and cannot update any owned idea. It can still read Company ideas and manage legacy administrator ideas. Do not ship the website alone against the previous bridge, which lists every idea. No database schema or grant changes are required: existing studio tables and save RPC are service-role-only.

## Verification

Build passed using the existing local photograph cache. Six new permission/workflow tests cover Personal/Team/Company access, owner-only sharing, direct URLs, meeting decisions, data filtering and connector privacy. Full suite: 740 tests, 730 pass, 10 fail. All ten failures reproduce on unchanged HEAD in the affected test files; none originate in this feature. Tests ran on Node 24; the project specifies Node 22, which remains the CI/runtime target.

Local browser fixture verified creation with Personal default, modal editing to Team/Content, adding to weekly agenda, then Explore with colleague, notes and due date. Reloaded fields retained the saved values and agenda flag cleared. Fixture-only missing brand font/favicon requests do not affect the flow. No production records, credentials or configuration were changed.

Run the isolated UI fixture with `node tests/shiny-visibility-fixture.mjs` and open http://127.0.0.1:4310/content-library/?work=1&studio=shiny-things . It uses simulated staff and in-memory data, with no real account or external services.
