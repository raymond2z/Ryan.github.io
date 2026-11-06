# Experiment records and optional automatic delivery

Derby Lab's notebook records deliberate tests independently of animation replay, slider recalculation, automatic search, and the older 12-item comparison list. Each setup snapshot contains race parameters, geometry, balance settings, search options, model version, and results. Students choose a final test and explain why.

`/experiment-review/` accepts multiple downloaded JSON files locally, deduplicates sessions, skips older copies, displays histories and final choices, and exports a spreadsheet-safe CSV summary. It does not upload or persist imported files. Student codes are self-entered rather than verified identities. Different sessions are shown separately.

## Automatic Google Sheets delivery

Deploy `collector.gs` in the teacher's Google account, following `setup.html`. `initializeTeacher_` can create a private spreadsheet and class submission code. Setup generates a student link; students explicitly connect before sending. Settings remain in their browser. No endpoint or class code is published in this repository.

The notebook sends saved versions through a form POST to the configured Apps Script endpoint. The server's HTML response returns a correlated receipt using postMessage, after writing the record. Google framing/login restrictions can prevent this path; manual file submission remains available. A form load alone never counts as successful delivery. The receiver restricts acknowledgement target origins to the published GitHub Pages origin.

The queue coalesces changes, permits one in-flight request, validates receipt origin/request IDs, retries at most three times, and retains the browser notebook. Reopening the page, reconnecting, or explicitly retrying queues the latest local version again. There is no service-worker or closed-page background delivery.

Private Sheet tabs:
- Latest students: newest session count, final choice, explanation and complete final setup. Older snapshots do not overwrite newer versions.
- Receipts: content-hash deduplicated acknowledgements.
- Record data: complete snapshots in chunks under the cell size limit.

The collector exposes no public student-data read operation. The shared class code is a write gate rather than student authentication. Keep the spreadsheet private and test school-account access before class use. File submissions are limited to 500 KB. Local notebooks accept up to 5 MB.

## Validation

Run `node --test experiment-review/*.test.cjs` (15 tests).

Browser QA completed: student record, final selection, download, teacher file import, count/final reason display, CSV download, and student-link generation. The queue and receiver are covered by deterministic tests, including server-write failure, duplicate retry, older-version rejection, acknowledgement matching, and retry limits.

**Not yet verified:** real Google Apps Script deployment, school login/iframe behavior, and live writes to the teacher's Google Sheet. No Google backend is deployed or configured by the repository commit alone.

The original Race and Balance physics is unchanged. Their timing intervals differ. Use the full notebook export to retain balance settings and experimental history.
