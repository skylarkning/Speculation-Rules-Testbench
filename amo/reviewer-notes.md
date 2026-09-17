# Notes for AMO reviewers

## Purpose

This extension adds a Firefox DevTools panel for inspecting and comparing
Speculation Rules navigational-prefetch behavior on a site selected by the
user. It is designed for technical investigation and does not run measurements
unless the user opens DevTools and starts a capture.

## Data handling

The extension does not transmit captured data, telemetry, or analytics. The
manifest declares `data_collection_permissions.required: ["none"]`.

The feedback action opens a normal GitHub Issues tab. It does not append or
upload captured data. JSON files are exported locally only after an explicit
user action.

## Permission justification

- `<all_urls>`: live-site investigations can target any HTTP or HTTPS origin.
  Network events are retained only when an active testbench run matches the
  inspected tab, source page, or locked target URL.
- `webRequest`: observes relevant speculative and top-level request lifecycle
  events and an allowlist of diagnostic headers.
- `webRequestBlocking`: in the explicitly selected blocked-control mode, it
  cancels requests identified as prefetches. It does not modify other traffic.
- `scripting`: reads inline `script[type="speculationrules"]` elements and the
  browser's Navigation Timing entry from the inspected tab.
- `tabs`: reloads or navigates the inspected tab as part of the controlled
  workflow and opens the project's GitHub issue chooser.
- `browsingData`: clears only the HTTP cache after a visible two-click
  confirmation. The panel warns that this affects the entire testing profile.
  Cookies, history, passwords, and site storage are not removed.

## Review workflow

1. Install the extension in Firefox desktop 142 or later.
2. Open https://symfony.com/ in a normal tab.
3. Open Firefox DevTools and select **Speculation Rules**.
4. Select **Scan and lock pair**. The panel should find the same-origin `/blog/`
   list rule; omitted eagerness is correctly treated as `immediate`.
5. Select **Clear entire HTTP cache**, then select the visible confirmation
   state within eight seconds.
6. Start an enabled capture. Wait for the prefetch entry, navigate to the
   locked target, and select **Finish and save measurement**.
7. Return to the source, clear the cache again, and start the blocked-prefetch
   control. The prefetch should be recorded as blocked before a response.
8. Finish the second run and inspect the comparison.
9. **Export sanitized JSON** downloads a local report. **Feedback or report a
   bug** opens the repository's issue-form chooser in a new tab.

The exact network result may vary with changes to the public example site. A
minimal controlled same-origin lab is available at:
https://skylarkning.github.io/Speculation-Rules-Testbench/

## Source and build

The uploaded extension package consists of the readable files in `extension/`.
There is no transpilation, bundling, minification, generated JavaScript, remote
code, or third-party runtime library. No separate source-code upload is needed
to reproduce the extension package.

From the repository root:

```text
npm ci
npm run extension:lint
npm run extension:package:amo
```

The AMO upload ZIP is written to `artifacts/`.
