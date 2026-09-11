# Security and privacy

The testbench runs with broad host permissions so it can inspect request and
response metadata for the page under test. Use a dedicated Firefox profile.

The extension does not send capture data to a server. Exported reports contain
only diagnostic allowlisted headers, omit inline speculation-rule source text,
and redact values of token-like query parameters. Reports can still contain
visited site URLs and page titles. Review every report before sharing it.

Do not report security-sensitive Firefox behavior in a public GitHub issue.
Use Mozilla's security bug process instead:
https://www.mozilla.org/security/bug-bounty/faq-webapp/
