# Prefetch Lab

A local, repeatable runner for comparing Firefox Speculation Rules prefetch
navigations with clean controls.

The first prototype deliberately follows Firefox’s current M1 scope:

- same-origin targets
- list rules
- `eagerness: "immediate"`
- unique query strings for cache isolation

The prefetched case injects a speculation rule, waits for a short warm-up, and
navigates to a cacheable measurement target. The control navigates without a
rule. The target records `PerformanceNavigationTiming.deliveryType`, transfer
size, request-to-response time, and total duration in local storage so the home
page can display the last result.

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

The runner is intentionally browser-local. Confirm request headers such as
`Sec-Purpose`, `Sec-Fetch-Dest`, and `Sec-Fetch-Mode` with a server-side probe
when investigating networking behavior.
