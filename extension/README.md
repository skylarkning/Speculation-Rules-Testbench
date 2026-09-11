# Speculation Rules Testbench extension

This Firefox DevTools extension turns the hosted demonstration into a live-site
investigation workflow. It scans the inspected document for inline
`speculationrules` scripts, classifies each rule against Firefox Milestone 1,
records the browser's speculative and top-level requests, and exports a
privacy-sanitized session as JSON.

All captures remain in the local extension process until the investigator uses
**Export sanitized JSON**. The extension does not transmit captured URLs,
headers, or page analysis to a server. It captures only a diagnostic allowlist
of headers, omits inline rule text from exports, and redacts values of
token-like query parameters. Site URLs can still appear, so review an export
before sharing it.

## Install temporarily in Firefox Nightly

If you downloaded the packaged ZIP, unpack it first.

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Select this directory's `manifest.json`.
4. Open a normal HTTP or HTTPS page and open Firefox DevTools.
5. Select the **Speculation Rules** panel.

The extension requests access to all sites because `webRequest` can only
inspect request and response headers for hosts granted in the manifest. The
`browsingData` permission is used only when you explicitly click **Clear entire
HTTP cache**. Firefox clears the whole profile cache for this operation; the
extension does not remove cookies, history, passwords, or site storage. Use a
dedicated Firefox testing profile.

## Workflow

1. Use **Scan and lock pair** on the source page. The table identifies
   list/immediate/same-origin prefetch targets that match Firefox M1 and locks
   the first compatible source/target pair for both conditions. Automatic
   scans after navigation cannot replace it; manually scanning another page
   deliberately selects a new pair.
2. Click **Clear entire HTTP cache**, then click its visible confirmation state
   within eight seconds. Start an enabled capture after the status says the
   cache is ready. The extension requires a fresh clear before every run.
3. Wait for the prefetch request, then use **Navigate to rule target** or click
   the corresponding link on the page.
4. After the target loads, click **Finish and save measurement**. Do not use
   **Cancel without measurement** for a run you intend to compare.
5. Return to the source page, clear the HTTP cache again, and start the
   blocked-prefetch control. In this mode, requests carrying `Sec-Purpose:
   prefetch` are cancelled before they are sent.
6. Navigate to the target, finish the run, compare the two summaries, and
   export sanitized JSON.

Use **Submit feedback** to open a prefilled issue in the project repository.
No capture data is attached automatically. Add a sanitized JSON export only
when it helps reproduce the problem and after reviewing its remaining URLs.

The comparison is marked inconclusive if the two saved runs do not contain the
same source and target URLs. Export schema version 2 includes the locked pair,
the original source-page analysis, the current-page analysis, and the
run-specific URLs.

## Interpretation limits

- The blocked control reproduces the network consequence of disabling
  prefetch; it does not change `dom.speculation_rules.enabled`.
- The explicit cache action clears the whole Firefox HTTP cache. It is required
  before each condition so one run cannot silently warm the other.
- A target navigation cache hit is reported separately from prefetch reuse;
  an ordinary cache hit is not attributed to Speculation Rules by itself.
- A blocked prefetch has no response timing or `Cache-Control` because it is
  cancelled before a response exists. Its later normal navigation still has
  transfer size, request-to-response time, and duration when the run is
  finished and saved.
- `deliveryType: navigational-prefetch` is treated as activation evidence only
  when Firefox exposes it. An early request alone proves dispatch, not reuse.
- A cacheable response is necessary for activation. Record `Cache-Control` and
  do not treat a `no-store` prefetch as a reusable navigation.

Firefox DevTools extension architecture and request interception are documented
by MDN:

- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Extending_the_developer_tools
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest
