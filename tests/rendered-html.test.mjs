import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/", headers = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", ...headers },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Speculation Rules Prefetch Test Harness", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Speculation Rules Prefetch Test Harness · Firefox Nightly<\/title>/i,
  );
  assert.match(html, /Speculation Rules Prefetch Test Harness/);
  assert.match(html, /Open controlled test/);
  assert.match(html, /Download DevTools extension/);
  assert.match(html, /Inspect the real browser behavior/);
  assert.match(html, /blocked control/i);
  assert.match(
    html,
    /\/downloads\/speculation-rules-testbench-firefox\.zip/,
  );
  assert.match(html, /Observable signals/);
  assert.match(html, /Request timing/);
  assert.match(html, /Navigation reuse/);
  assert.match(html, /Symfony/);
  assert.match(html, /prefetches \/blog\//);
  assert.match(html, /View benchmark/);
  assert.match(html, /List defaults to immediate/);
  assert.match(html, /Median LCP: 71 ms/);
  assert.match(html, /TechCrunch/);
  assert.match(html, /Rolling Stone/);
  assert.match(html, /Field Lab target/);
  assert.match(html, /Run with rules enabled/);
  assert.match(html, /Run with rules disabled/);
  assert.match(html, /Compare runs/);
  assert.match(html, /Prefetch \/blog\//);
  assert.match(html, /Response cached/);
  assert.match(html, /Prepare prefetch/);
  assert.match(html, /Run control/);
  assert.match(html, /Known-good controlled pair/);
  assert.match(html, /live M1/);
  assert.match(html, /filtered/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships a self-contained static codelab", async () => {
  const fs = await import("node:fs/promises");
  const labHtml = await fs.readFile(
    new URL("../public/lab/index.html", import.meta.url),
    "utf8",
  );
  const targetHtml = await fs.readFile(
    new URL("../public/lab/target.html", import.meta.url),
    "utf8",
  );
  const labScript = await fs.readFile(
    new URL("../public/lab/lab.js", import.meta.url),
    "utf8",
  );

  assert.match(labHtml, /Speculation Rules Prefetch Test Harness/);
  assert.match(labHtml, /Run with rules enabled/);
  assert.match(labHtml, /Run with rules disabled/);
  assert.match(labHtml, /Observable signals/);
  assert.match(labHtml, /Sec-Purpose: prefetch/);
  assert.match(labHtml, /Symfony/);
  assert.match(labScript, /rule\.type = "speculationrules"/);
  assert.match(labScript, /eagerness: "immediate"/);
  assert.match(targetHtml, /performance\.getEntriesByType\("navigation"\)/);
  assert.match(targetHtml, /navigational-prefetch/);
});

test("serves a cacheable measurement target", async () => {
  const response = await render("/target?run=test&case=prefetch", {
    "sec-purpose": "prefetch",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /performance\.getEntriesByType\("navigation"\)/);
  assert.match(html, /new PerformanceObserver/);
  assert.match(html, /window\.addEventListener\("load", captureNavigationTiming/);
  assert.match(html, /timingAvailable/);
  assert.match(html, /Navigation timing unavailable/);
  assert.match(html, /purpose: "prefetch"/);
  assert.match(html, /fetchDest: "empty"/);
  assert.match(html, /fetchMode: "cors"/);
  assert.match(html, /Prefetch request observed/);
  assert.match(html, /prefetch-lab:last-result/);
  assert.match(html, /navigational-prefetch/);
});
