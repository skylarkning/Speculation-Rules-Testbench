# Privacy policy

Last updated: September 17, 2026

Speculation Rules Testbench is a local Firefox DevTools extension. It does not
collect, sell, transmit, or remotely store personal data, browsing history,
captured network metadata, analytics, or usage telemetry.

## Data handled locally

When the user starts a capture, the extension temporarily processes the active
DevTools tab's URL, inline Speculation Rules, selected request and response
headers, request lifecycle events, cache status, and Navigation Timing values.
This information remains in the extension process and is cleared when the
session is cleared or the extension is unloaded.

The extension records only an allowlist of diagnostic headers. It does not
record cookies, `Set-Cookie`, authorization headers, passwords, or form data.

## Exports

JSON reports are created only when the user selects **Export sanitized JSON**.
Exports omit inline rule source text and redact values of token-like query
parameters. Public site URLs and page titles can remain because they are needed
to explain a test run. Users should review every report before sharing it.

## External links

Selecting **Feedback or report a bug** opens this project's public GitHub issue
form chooser. No captured data is sent to GitHub automatically. Information
entered or uploaded to GitHub is governed by GitHub's privacy terms.

## Permissions

- Access to all sites lets the extension inspect the user-selected DevTools tab
  and observe its relevant network requests.
- `webRequest` observes request lifecycle and diagnostic headers during an
  active capture.
- `webRequestBlocking` cancels only speculative prefetch requests during the
  user-started blocked-control run.
- `scripting` reads inline Speculation Rules and Navigation Timing from the
  inspected tab.
- `tabs` reloads or navigates the inspected tab and opens the GitHub issue page.
- `browsingData` clears the Firefox HTTP cache only after explicit two-step
  confirmation. It does not clear cookies, history, passwords, or site storage.

## Contact

Privacy questions can be filed at:
https://github.com/skylarkning/Speculation-Rules-Testbench/issues
