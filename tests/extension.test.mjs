import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import {
  analyzePageSnapshot,
  assessComparison,
  isPrefetchRequest,
  summarizeRun,
} from "../extension/lib/analyzer.js";
import { sanitizeEvidence, sanitizeUrl } from "../extension/lib/privacy.js";

test("sanitizes credentials, token-like query values, and inline rule text", () => {
  assert.equal(
    sanitizeUrl("https://name:pass@example.com/path?token=secret&case=enabled"),
    "https://example.com/path?token=%5BREDACTED%5D&case=enabled",
  );
  const evidence = sanitizeEvidence({
    sourceUrl: "https://example.com/?access_token=secret&case=enabled",
    scripts: [{ index: 0, src: "", text: '{"prefetch":[]}' }],
  });
  assert.match(evidence.sourceUrl, /access_token=%5BREDACTED%5D/);
  assert.equal(evidence.scripts[0].text, "[omitted from sanitized export]");
});

test("classifies Symfony's list rule as Firefox M1 compatible", () => {
  const analysis = analyzePageSnapshot({
    pageUrl: "https://symfony.com/",
    apiSupported: true,
    scripts: [{ text: '{"prefetch":[{"urls":["/blog/"]}]}' }],
  });

  assert.equal(analysis.rules.length, 1);
  assert.equal(analysis.rules[0].source, "list");
  assert.equal(analysis.rules[0].eagerness, "immediate");
  assert.equal(analysis.eligibleTargets[0].url, "https://symfony.com/blog/");
});

test("filters document, conservative, cross-origin, and prerender rules", () => {
  const analysis = analyzePageSnapshot({
    pageUrl: "https://example.com/",
    scripts: [
      {
        text: JSON.stringify({
          prefetch: [
            { source: "document", where: { href_matches: "/*" }, eagerness: "conservative" },
            { urls: ["https://other.example/path"], eagerness: "immediate" },
          ],
          prerender: [{ urls: ["/next"] }],
        }),
      },
    ],
  });

  assert.equal(analysis.eligibleTargets.length, 0);
  assert.equal(analysis.rules.length, 3);
  assert.match(analysis.rules[0].reasons.join(" "), /source is not list/);
  assert.match(analysis.rules[1].targets[0].reasons.join(" "), /cross-origin/);
  assert.match(analysis.rules[2].reasons.join(" "), /action is not prefetch/);
});

test("reports invalid speculation rule JSON", () => {
  const analysis = analyzePageSnapshot({
    pageUrl: "https://example.com/",
    scripts: [{ text: "{" }],
  });
  assert.equal(analysis.errors.length, 1);
  assert.equal(analysis.rules.length, 0);
});

test("recognizes Firefox prefetch request headers", () => {
  assert.equal(
    isPrefetchRequest([{ name: "Sec-Purpose", value: "prefetch" }]),
    true,
  );
  assert.equal(
    isPrefetchRequest([{ name: "Purpose", value: "prefetch;prerender" }]),
    true,
  );
  assert.equal(isPrefetchRequest([], "speculative"), true);
  assert.equal(isPrefetchRequest([{ name: "Accept", value: "text/html" }]), false);
});

test("summarizes activation and blocked controls without inventing cache reuse", () => {
  const base = {
    id: "run-1",
    status: "complete",
    startedAt: 1,
    finishedAt: 2,
    targetUrl: "https://example.com/next",
  };
  const enabled = summarizeRun({
    ...base,
    mode: "enabled",
    requests: [
      {
        url: "https://example.com/next",
        type: "other",
        isPrefetch: true,
        blocked: false,
        status: "completed",
        purpose: "prefetch",
        statusCode: 200,
        responseHeaders: { "cache-control": "public, max-age=300" },
      },
    ],
    pageSnapshot: { navigation: { deliveryType: "navigational-prefetch" } },
  });
  const blocked = summarizeRun({
    ...base,
    mode: "blocked",
    requests: [
      {
        url: "https://example.com/next",
        type: "other",
        isPrefetch: true,
        blocked: true,
        status: "blocked",
        purpose: "prefetch",
        responseHeaders: {},
      },
    ],
    pageSnapshot: { navigation: { deliveryType: "" } },
  });

  assert.equal(enabled.activationObserved, true);
  assert.equal(enabled.cacheReuseObserved, true);
  assert.equal(blocked.blockedCount, 1);
  assert.equal(blocked.cacheReuseObserved, false);
});

test("does not attribute an ordinary navigation cache hit to prefetch", () => {
  const summary = summarizeRun({
    id: "cache-only",
    mode: "enabled",
    status: "complete",
    startedAt: 1,
    targetUrl: "https://example.com/next",
    requests: [
      {
        url: "https://example.com/next",
        type: "main_frame",
        isPrefetch: false,
        blocked: false,
        status: "completed",
        fromCache: true,
      },
    ],
    pageSnapshot: { navigation: { deliveryType: "" } },
  });

  assert.equal(summary.targetNavigationCacheHit, true);
  assert.equal(summary.cacheReuseObserved, false);
});

test("marks a comparison without cache isolation as inconclusive", () => {
  const run = {
    id: "run",
    mode: "enabled",
    status: "complete",
    startedAt: 1,
    targetUrl: "https://example.com/next",
    cachePrepared: false,
    requests: [],
  };
  const assessment = assessComparison(run, { ...run, id: "control", mode: "blocked" });
  assert.equal(assessment.status, "inconclusive");
  assert.match(assessment.message, /Cache isolation/);
});

test("requires completed runs before comparing saved navigation timing", () => {
  const stopped = {
    id: "stopped",
    mode: "enabled",
    status: "stopped",
    startedAt: 1,
    targetUrl: "https://example.com/next",
    cachePrepared: true,
    requests: [],
  };
  const assessment = assessComparison(stopped, {
    ...stopped,
    id: "control",
    mode: "blocked",
  });
  assert.equal(assessment.status, "inconclusive");
  assert.match(assessment.message, /stopped without saving/);
});

test("rejects an enabled/control comparison that used different URL pairs", () => {
  const base = {
    id: "enabled",
    mode: "enabled",
    status: "complete",
    startedAt: 1,
    sourceUrl: "https://symfony.com/",
    targetUrl: "https://symfony.com/blog/",
    cachePrepared: true,
    requests: [],
  };
  const assessment = assessComparison(base, {
    ...base,
    id: "blocked",
    mode: "blocked",
    sourceUrl: "https://symfony.com/blog/",
    targetUrl: "https://symfony.com/blog/article",
  });
  assert.equal(assessment.status, "inconclusive");
  assert.match(assessment.message, /different source\/target URLs/);
});

test("attributes a tabless speculative request to one exact active target", async () => {
  const background = await readFile(
    new URL("../extension/background.js", import.meta.url),
    "utf8",
  );
  const event = { addListener() {} };
  let cacheClears = 0;
  let reloads = 0;
  let feedbackUrl = "";
  let snapshotAttempts = 0;
  const context = {
    URL,
    crypto,
    setTimeout,
    browser: {
      browsingData: {
        async removeCache() {
          cacheClears += 1;
        },
      },
      runtime: { onConnect: event },
      scripting: {
        async executeScript() {
          snapshotAttempts += 1;
          return [{ result: { pageUrl: "https://symfony.com/", scripts: [] } }];
        },
      },
      tabs: {
        onRemoved: event,
        async create({ url }) {
          feedbackUrl = url;
        },
        async get() {
          return { url: "https://symfony.com/" };
        },
        async reload() {
          reloads += 1;
        },
        async update() {},
      },
      webRequest: {
        onBeforeRequest: event,
        onBeforeSendHeaders: event,
        onHeadersReceived: event,
        onCompleted: event,
        onErrorOccurred: event,
      },
    },
  };
  vm.runInNewContext(
    `${background}\nglobalThis.__testbench = { sessions, activeContext, capturePageSnapshot, clearHttpCache, openFeedback, startRun };`,
    context,
  );
  context.__testbench.sessions.set(17, {
    active: {
      sourceUrl: "https://symfony.com/",
      targetUrl: "https://symfony.com/blog/",
    },
  });

  const match = context.__testbench.activeContext({
    requestId: "prefetch-1",
    tabId: -1,
    url: "https://symfony.com/blog/",
  });

  assert.equal(match.tabId, 17);
  assert.equal(match.targetMatch, true);

  await context.__testbench.clearHttpCache(18);
  const cacheSession = context.__testbench.sessions.get(18);
  assert.equal(cacheClears, 1);
  assert.equal(cacheSession.cacheEpoch, 1);
  assert.equal(cacheSession.cacheStatus, "ready");

  await context.__testbench.startRun(18, {
    mode: "enabled",
    sourceUrl: "https://symfony.com/",
    targetUrl: "https://symfony.com/blog/",
  });
  assert.equal(reloads, 1);
  assert.equal(cacheSession.active.status, "recording");
  assert.equal(cacheSession.active.cachePrepared, true);

  const snapshot = await context.__testbench.capturePageSnapshot(18);
  assert.equal(snapshot.pageUrl, "https://symfony.com/");
  assert.equal(snapshotAttempts, 1);

  await context.__testbench.openFeedback();
  assert.equal(
    feedbackUrl,
    "https://github.com/skylarkning/Speculation-Rules-Testbench/issues",
  );
});

test("extension manifest and panel declare the required Firefox surfaces", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"),
  );
  const panel = await readFile(
    new URL("../extension/panel/panel.html", import.meta.url),
    "utf8",
  );
  const background = await readFile(
    new URL("../extension/background.js", import.meta.url),
    "utf8",
  );
  const panelScript = await readFile(
    new URL("../extension/panel/panel.js", import.meta.url),
    "utf8",
  );

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.devtools_page, "devtools/devtools.html");
  assert.ok(manifest.permissions.includes("webRequest"));
  assert.ok(manifest.permissions.includes("webRequestBlocking"));
  assert.ok(manifest.permissions.includes("browsingData"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(manifest.host_permissions.includes("<all_urls>"));
  assert.match(panel, /Start enabled capture/);
  assert.match(panel, /Start blocked-prefetch control/);
  assert.match(panel, /Finish and save measurement/);
  assert.match(panel, /Cancel without measurement/);
  assert.match(panel, /Scan and lock pair/);
  assert.match(panel, /Submit feedback/);
  assert.match(background, /return \{ cancel: true \}/);
  assert.match(
    background,
    /github\.com\/skylarkning\/Speculation-Rules-Testbench\/issues/,
  );
  assert.match(background, /browser\.scripting\.executeScript/);
  assert.match(background, /OPEN_FEEDBACK/);
  assert.match(panelScript, /Confirm: clear entire HTTP cache/);
  assert.match(panelScript, /lockedPair: \{ sourceUrl, targetUrl \}/);
  assert.doesNotMatch(panelScript, /browser\.tabs\.create/);
  assert.doesNotMatch(panelScript, /inspectedWindow\.eval/);
  assert.doesNotMatch(panelScript, /window\.confirm/);
});
