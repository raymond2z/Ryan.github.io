# My Word Atlas V1.4.1 — Browser Regression Report

Date: 2026-11-11  
Source: `my-word-atlas/index.html`  
Committed fix: `9791c58a90b15a1af72f500332350eaf37b1bcf9`

## Root causes identified

1. **Fatal UI rendering error**: HTML renderer called `esc(...)`, but only `escapeHTML(...)` was defined. This broke rendering after the summary cards, including the deck list, word list, star map, and study card. Fixed by using the shared safe-escaping helper `const esc = escapeHTML;`.
2. **Guided hint did not advance on first click**: The screen displayed Level 1 by default, but the internal hint counter remained at Level 0. Fixed by incrementing from the current displayed hint level.

## Browser interaction tests

**42 / 42 passed in headless Chromium (Playwright) in a local test harness.**

### Core flow — 24 checks
- Startup without JS exceptions
- Seeded 30 IELTS words
- Render and switch decks
- Library and editable word list
- Interactive star map and detailed word card
- Add/edit word
- Create an empty custom deck
- Import the original 309-row Google Translate CSV as 306 unique English entries, including reverse-language translations
- Browser-TTS fallback for an imported word
- Start daily study and transition through preview → guided → independent recall
- Save review events
- Continue learning without repeating undued words
- Export a complete JSON backup

### Additional tests — 18 checks
- US-accent audio fallback invocation
- CSV export
- Delete word
- All 15 steps of a 5-word learning session
- Guided hints advance properly
- Incorrect answer displays correction and requires retyping
- Five review events saved (1 Again, 4 Good)
- Daily new-word quota enforced
- Backup download and restore
- Restore removes data added after the backup
- No uncaught JS errors during the tested interactions

## Constraints and outstanding verification

- The browser-testing environment blocked navigation to `file://` and `http://localhost`, so the exact app markup and JavaScript were mounted into Chromium via Playwright `page.set_content`, with a script wrapper for top-level module execution.
- localStorage and speech APIs were test doubles, allowing persistence events and TTS fallback calls to be asserted. **Actual device audio output was not verified.**
- External Word Atlas images/audio network requests and the CDN-loaded `ts-fsrs` module were not verified end-to-end. The application retains fallback behavior for audio and scheduling.
- Live GitHub Pages browser refresh/deployment could not be clicked from the current Chat browser connection; the GitHub repository source code was confirmed updated and matches the locally tested HTML Git blob SHA.
- A full React/TypeScript Word Atlas fork, server-side sync, and complex phrase-learning mode are not yet implemented.

## Data compatibility

The version continues to use `my-word-atlas-v1:state` and does not reset existing learning progress. Export a JSON backup before changing browsers or clearing browser storage.
