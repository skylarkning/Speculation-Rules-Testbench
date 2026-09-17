# AMO submission checklist

## Prepared in this repository

- [x] Stable, non-Mozilla extension ID
- [x] Firefox desktop minimum version declared
- [x] No-data-collection manifest declaration
- [x] Unused permission removed
- [x] MPL-2.0 license
- [x] Public privacy policy
- [x] Listing copy
- [x] Detailed reviewer instructions and permission justifications
- [x] Reproducible AMO upload command
- [x] Automated tests and `web-ext lint`

## Complete in the AMO Developer Hub

- [ ] Sign in with the owner's Mozilla account and accept the developer terms.
- [ ] Select **On this site** for a public AMO listing.
- [ ] Upload the ZIP produced by `npm run extension:package:amo`.
- [ ] Select Firefox desktop only.
- [ ] Paste the name, summary, description, URLs, and reviewer notes from
      `amo/`.
- [ ] Select MPL-2.0 as the license.
- [ ] Confirm that the extension does not collect or transmit user data.
- [ ] Add the owner's support email address. Do not put it in the repository
      unless it is intended to be public.
- [ ] Upload native-resolution screenshots described in `amo/screenshots.md`.
- [ ] Review the generated permission prompts and submit the version.

## Updating later

Increment `extension/manifest.json`'s version, run the full test suite, build a
new AMO ZIP, and upload it as a new version of the existing AMO listing. Do not
create a second listing.
