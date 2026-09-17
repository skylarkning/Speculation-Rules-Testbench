# AMO screenshot plan

Capture PNG screenshots at native resolution in a clean Firefox testing
profile. Do not resize screenshots upward, include unrelated tabs, or expose
private browsing data.

Recommended set:

1. **Rule detection** — the panel on Symfony's homepage showing the `/blog/`
   list/immediate/same-origin target as compatible.
2. **Enabled capture** — the captured prefetch request, `Sec-Purpose`, response
   status, `Cache-Control`, and subsequent navigation evidence.
3. **Blocked control** — the matching control run showing the speculative
   request blocked before response.
4. **Comparison** — both completed run summaries and the comparison assessment.

Captions should describe only what the screenshot proves. Do not claim a
performance improvement from a single run, and do not claim
`deliveryType: navigational-prefetch` unless that value is visible in the
submitted Firefox build.
