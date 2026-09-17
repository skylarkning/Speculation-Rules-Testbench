# AMO listing copy

## Name

Speculation Rules Testbench

## Summary

Inspect Firefox Speculation Rules on live sites, capture prefetch requests, and
compare normal behavior with a blocked-prefetch control.

## Description

Speculation Rules Testbench adds a dedicated panel to Firefox DevTools for
investigating navigational prefetch behavior on real websites.

The panel can:

- find and classify inline Speculation Rules;
- identify list, immediate, same-origin prefetch targets supported by the
  Firefox Milestone 1 implementation;
- capture speculative and top-level request lifecycles;
- show `Sec-Purpose`, completion status, cache headers, cache hits, Navigation
  Timing, and `deliveryType` when Firefox exposes it;
- compare normal behavior with a control that blocks speculative prefetches;
- enforce a matching source/target pair and explicit cache isolation; and
- export a privacy-sanitized JSON report.

The extension is intended for browser engineers, performance investigators,
and web developers. It is an investigation tool, not a performance benchmark:
single runs should not be treated as statistically meaningful performance
results.

Captured data remains in the local extension process. Nothing is uploaded
automatically.

## Suggested categories

- Developer Tools
- Other

## URLs

- Homepage: https://github.com/skylarkning/Speculation-Rules-Testbench
- Support: https://github.com/skylarkning/Speculation-Rules-Testbench/issues
- Privacy policy: https://github.com/skylarkning/Speculation-Rules-Testbench/blob/main/PRIVACY.md

## License

Mozilla Public License 2.0

## Compatibility

- Firefox desktop 142 and later
- Not submitted for Firefox for Android because the workflow depends on desktop
  DevTools panels.
