# Mozilla Add-ons submission package

This directory contains the copy and operational notes needed to submit
Speculation Rules Testbench as a listed Firefox desktop extension.

- `listing.md` — public AMO name, summary, description, URLs, category, license,
  and compatibility information.
- `reviewer-notes.md` — testing steps, data-handling statement, permission
  justification, and reproducible package instructions for Mozilla reviewers.
- `release-notes.md` — notes for the initial public AMO version.
- `screenshots.md` — the four screenshots to capture without overstating what a
  single measurement proves.
- `submission-checklist.md` — the remaining steps that require the owner's
  Mozilla account, support email, screenshots, and acceptance of AMO terms.

Build the upload file from the repository root:

```bash
npm ci
npm test
npm run extension:package:amo
```

Upload `artifacts/speculation_rules_testbench-1.4.0.zip` through the AMO
Developer Hub. The package is the readable source in `extension/`; no bundling,
minification, or source-generation step is used.
