# Renderer regression tests

These browser tests use synthetic Streamer.bot events. They make no network requests and do not send a print job.

Run with Node.js 20 or newer:

```sh
npm ci
npx playwright install chromium
npm test
```

To use an existing Chromium or Edge installation instead of downloading Playwright's browser, set `PRINTER_BOT_BROWSER_PATH` to its executable path before `npm test`. Set `PRINTER_BOT_RENDERER_PATH` to compare another renderer file.

The tests target `v/2.5.0/renderer.html`, the current layout. That file is signed for release. After any accepted change, the maintainer's release process must update the signature, embedded renderer, and release metadata before publishing it.
