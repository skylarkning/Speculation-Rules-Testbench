# Contributing

Bug reports, site compatibility findings, workflow feedback, documentation
changes, and code contributions are welcome.

Before filing an issue, remove private site details and credentials. The
extension's JSON export is sanitized, but it intentionally retains site URLs
needed to explain a run. Review the file before attaching it publicly.

For code changes:

1. Install Node.js 22 or later and run `npm ci`.
2. Make a focused change with tests where practical.
3. Run `npm test` and `npm run lint`.
4. Open a pull request describing the behavior being changed and how it was
   verified.

Firefox implementation bugs belong in Bugzilla; testbench bugs and feature
requests belong in this repository.
