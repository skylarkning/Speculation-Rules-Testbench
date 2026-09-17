# Speculation Rules Testbench

A Firefox Nightly testbench with three complementary surfaces:

- a controlled same-origin runner that produces real request headers and
  Navigation Timing values;
- a dependency-free static runner suitable for GitHub Pages; and
- a Firefox DevTools extension for auditing live sites, blocking speculative
  requests for a control run, comparing captures, and exporting JSON evidence.

The recorded Symfony sequence remains an explanatory reference. Live-site
claims come from the extension capture, not from the animation.

## Firefox DevTools extension

The extension is in [`extension/`](extension/). Load
`extension/manifest.json` temporarily from
`about:debugging#/runtime/this-firefox`, open DevTools on a normal HTTP or HTTPS
page, and select **Speculation Rules**.

For the downloadable ZIP, unpack it first and select the extracted
`manifest.json` when Firefox asks which temporary add-on to load.

The panel:

- parses inline `speculationrules` scripts and reports malformed JSON;
- classifies prefetch and prerender rules against Firefox M1's
  list/immediate/same-origin gate;
- records speculative requests, `Sec-Purpose`, response status,
  `Cache-Control`, completion, errors, and cache hits;
- provides a blocked-prefetch control that cancels requests carrying
  `Sec-Purpose: prefetch` before they are sent;
- associates a speculative request without a usable Firefox tab ID with the
  single active run expecting that exact target;
- requires an explicit whole-profile HTTP cache clear before each condition;
- locks one source/target pair across both conditions and refuses to interpret
  a comparison if their URLs differ;
- records browser-exposed Navigation Timing and `deliveryType` at the end of a
  run; and
- exports privacy-sanitized page analysis, request lifecycle, run metadata,
  summaries, and methodology as JSON;
- opens dedicated GitHub bug-report and feature-request forms without
  uploading capture data.

Source, releases, and feedback are hosted at
[github.com/skylarkning/Speculation-Rules-Testbench](https://github.com/skylarkning/Speculation-Rules-Testbench).
The dependency-free interactive lab is published at
[skylarkning.github.io/Speculation-Rules-Testbench](https://skylarkning.github.io/Speculation-Rules-Testbench/).

The blocked control does not modify the global Firefox preference. Cache
clearing happens only after explicit confirmation and affects the entire
Firefox HTTP cache, so use a dedicated test profile. See
[`extension/README.md`](extension/README.md) for the complete workflow and
interpretation limits.

## Standalone runnable codelab

`public/lab/` is a dependency-free static experiment inspired by the Google
Speculation Rules codelab. It injects a real same-origin `list` + `immediate`
rule, navigates to a cache-isolated target, records Navigation Timing, and keeps
the enabled/control results in local storage for comparison.

It can be served from any top-level HTTPS static host, including GitHub Pages.
Publish the contents of `public/lab/` together so `index.html`, `target.html`,
`lab.js`, and `styles.css` remain on the same origin and in the same directory.
The repository's Pages workflow publishes this directory at the hosted URL
above.
The browser-only version cannot read its own `Sec-Purpose` request header, so
the codelab instructs the investigator to verify that signal in Firefox
DevTools. The main application retains the server-backed target for an
independent request-header check.

## Real-site candidate desk

The current examples were verified against live homepage markup on August 26,
2026. Symfony is the primary example:

- [Symfony](https://symfony.com/) — a list rule containing
  `{"prefetch":[{"urls":["/blog/"]}]}`. Because list rules default to
  `immediate`, it is directly compatible with Firefox Milestone 1.
- [Symfony Browsertime comparison](https://perf-labs.netlify.app/gh/speculation-rules-prefetch/examples/symfony/index.html)
  — 10 fresh-browser runs per variant. Median Blog navigation load time was
  243 ms with Speculation Rules and 545 ms without; LCP was 71 ms versus
  342 ms.

- [TechCrunch](https://techcrunch.com/) — reported reach of 6.5M US readers per
  month
- [Rolling Stone](https://www.rollingstone.com/) — reported traffic of 12.78M
  visits per month

Both are useful examples of why a raw `type="speculationrules"` search is not a
Firefox investigation queue by itself. They use `prefetch` document rules with
`eagerness: "conservative"`, so the Field Lab correctly classifies them as
detected but outside Firefox M1. They remain valuable future-compatibility and
site-breakage cases.

The M1 acceptance gate is:

- `prefetch` action
- same-origin target
- list rule (`urls`, or an explicit `source: "list"`)
- immediate eagerness (explicit, or the list-rule default when omitted)

The playback is explicitly an expected lifecycle model rather than telemetry
from the external page. Compatible rules show the early prefetch request and
warm navigation activation; incompatible rules show the point at which Firefox
M1 filters them. The controlled target below the visualization remains the
source of real request headers and Navigation Timing values.

## Local controlled pair

The prefetched case injects a speculation rule, waits for a short warm-up, and
navigates to a cacheable measurement target. The control navigates without a
rule. The target records `PerformanceNavigationTiming.deliveryType`, transfer
size, request-to-response time, and total duration in local storage so the home
page can display the last result. It also embeds the server-observed
`Sec-Purpose`, `Sec-Fetch-Dest`, and `Sec-Fetch-Mode` request headers, providing
an independent signal when Firefox does not expose `deliveryType` as expected.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. In Firefox, enable these
preferences for the complete experiment:

```text
dom.speculation_rules.enabled = true
dom.performance.deliverytype.enabled = true
```

## Verify

```bash
npm test
```

The test command packages the extension, checks all extension scripts, builds
the hosted application, and runs the rendered-page and extension analyzer
tests. The generated download is
`public/downloads/speculation-rules-testbench-firefox.zip`.

The controlled runner is intentionally browser-local. Its result page displays
the request headers observed by the target route alongside the browser's
Navigation Timing values.
