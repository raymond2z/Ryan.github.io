# Experiment records, version 1

Derby Lab's notebook records deliberate tests independently of animation replay, slider recalculation, automatic search, and the older 12-item comparison list. Each immutable setup snapshot contains race parameters, geometry, balance settings, search options, model version, and result. Predictions and changes are required; observations and positive real-car times are optional. Students explicitly choose a final test and give a reason. Later tests do not silently change that selection.

Students download a JSON record and hand it in through the school's existing workflow. `/experiment-review/` accepts multiple files locally, deduplicates session IDs, skips older copies, displays histories and final choices, and exports a spreadsheet-safe CSV summary. It does not upload or persist student files. Student codes are self-entered, not authenticated identities. Counts are learning evidence, not automatic grades. Different sessions are shown separately.

Google Sheets collection is optional and **not deployed or connected by this change**. Follow `setup.html` to deploy `collector.gs` in the teacher's account. The collector provides a file submission page, an acknowledgement after writing, a script-property class code, locking, content-hash deduplication, and private Sheet storage. It exposes no student-data read endpoint. It accepts up to 500 KB per submission. This version uses explicit file submission, not background sync. Keep the exported file until a receipt is shown. School account access restrictions must be tested before classroom use.

## Validation

Run `node --test experiment-review/record-core.test.cjs`.

Browser checks completed: enter identity, record a race, select a final design with observation/reason, reload and retain the record, download the record, and open teacher review. Teacher file-import browser QA was blocked by the browser approval service's usage limit; it remains unverified. Apps Script deployment and real Google Sheets submissions remain unverified.

The original physics is unchanged. Recorded Race and Balance results use their respective existing solvers. Their timing intervals differ. JSON setup sharing outside the notebook retains its existing format; use the full notebook export to retain balance settings and experimental history.
