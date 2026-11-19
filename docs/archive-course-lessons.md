# Course lesson manifests

The private `nufi_library_display` shelves payload can list lessons separately from catalogue assets. A lesson is not necessarily a distinct Canva link. Existing course members and assignment rules remain unchanged.

An entry can have a stable `key`, nullable catalogue `id`, title, position, `videoSeconds`, `scriptAvailable` and `canvaAvailable`. Entries without keys keep the original catalogue detail flow. Counts include manifest entries even where a Canva source is still missing. Course `note` explains evidence and unresolved links.

Private details are stored under `course-lesson:<course title>:<entry key>`, with the unchanged script, source links, original measured duration and verification metadata. The asset route resolves the key through that course's manifest and checks the existing originals/source permissions and course assignment before reading details. Scripts and source URLs are not bundled into public site assets. Copying uses the saved script without rewriting it. No new production draft or fabricated catalogue source is created for a missing editable Canva link.

The Stress Management correction uses the original transcript and eleven MP4 timing records, rechecked on 19 November 2026. Its nine additional Canva links remain unconfirmed. Back up the previous course metadata and use a compare-and-set update of only that course; preserve other courses, supporting files, membership and saved work.
