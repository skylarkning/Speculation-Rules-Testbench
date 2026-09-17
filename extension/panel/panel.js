/* global browser */

import {
  analyzePageSnapshot,
  assessComparison,
  summarizeRun,
} from "../lib/analyzer.js";
import { sanitizeEvidence } from "../lib/privacy.js";

const tabId = browser.devtools.inspectedWindow.tabId;
const port = browser.runtime.connect({ name: "speculation-rules-testbench" });

const elements = {
  pageUrl: document.getElementById("page-url"),
  notice: document.getElementById("notice"),
  capabilities: document.getElementById("capabilities"),
  rulesSummary: document.getElementById("rules-summary"),
  rulesBody: document.getElementById("rules-body"),
  captureState: document.getElementById("capture-state"),
  sourceUrl: document.getElementById("source-url"),
  targetUrl: document.getElementById("target-url"),
  pairState: document.getElementById("pair-state"),
  cacheState: document.getElementById("cache-state"),
  requestCount: document.getElementById("request-count"),
  requestsBody: document.getElementById("requests-body"),
  enabledSummary: document.getElementById("enabled-summary"),
  blockedSummary: document.getElementById("blocked-summary"),
  comparisonAssessment: document.getElementById("comparison-assessment"),
  scanButton: document.getElementById("scan-button"),
  exportButton: document.getElementById("export-button"),
  feedbackButton: document.getElementById("feedback-button"),
  clearButton: document.getElementById("clear-button"),
  enabledButton: document.getElementById("enabled-button"),
  blockedButton: document.getElementById("blocked-button"),
  clearCacheButton: document.getElementById("clear-cache-button"),
  navigateButton: document.getElementById("navigate-button"),
  finishButton: document.getElementById("finish-button"),
  stopButton: document.getElementById("stop-button"),
};

let session = {
  tabId,
  active: null,
  runs: { enabled: null, blocked: null },
  lastRunMode: null,
  cacheEpoch: 0,
  lastStartedCacheEpoch: 0,
  lastCacheClearAt: null,
  cacheStatus: "idle",
  cacheError: "",
  commandError: "",
};
let pageSnapshot = null;
let analysis = null;
let sourcePageSnapshot = null;
let sourceAnalysis = null;
let sourceUrl = "";
let targetUrl = "";
let navigationScanTimer = 0;
let announcedCacheClearAt = null;
let cacheClearConfirmUntil = 0;
let cacheClearConfirmTimer = 0;
const pendingSnapshots = new Map();

function shortUrl(value) {
  if (!value) return "—";
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function setNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle("error", isError);
}

async function capturePageSnapshot() {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingSnapshots.delete(requestId);
      reject(
        new Error(
          "Page inspection timed out. Wait for the page to finish loading and scan again.",
        ),
      );
    }, 10000);
    pendingSnapshots.set(requestId, { resolve, reject, timeout });
    port.postMessage({ type: "CAPTURE_PAGE_SNAPSHOT", tabId, requestId });
  });
}

async function scanPage({ preserveTarget = false } = {}) {
  elements.scanButton.disabled = true;
  try {
    pageSnapshot = await capturePageSnapshot();
    analysis = analyzePageSnapshot(pageSnapshot);
    elements.pageUrl.textContent = `${pageSnapshot.title || "Untitled"} — ${pageSnapshot.pageUrl}`;

    const pairLocked = Boolean(sourceUrl && targetUrl);
    if (analysis.eligibleTargets.length) {
      if (!preserveTarget || !pairLocked) {
        sourceUrl = analysis.pageUrl;
        targetUrl = analysis.eligibleTargets[0].url;
        sourcePageSnapshot = pageSnapshot;
        sourceAnalysis = analysis;
        setNotice(
          `Locked ${shortUrl(sourceUrl)} → ${shortUrl(targetUrl)} for both conditions. Found ${analysis.eligibleTargets.length} compatible target${analysis.eligibleTargets.length === 1 ? "" : "s"}.`,
        );
      } else {
        setNotice(
          `Current page scanned. Comparison remains locked to ${shortUrl(sourceUrl)} → ${shortUrl(targetUrl)}.`,
        );
      }
    } else if (!preserveTarget) {
      sourceUrl = analysis.pageUrl;
      targetUrl = "";
      sourcePageSnapshot = pageSnapshot;
      sourceAnalysis = analysis;
      setNotice(
        analysis.scriptsFound
          ? "Rules were found, but none match Firefox M1 list + immediate + same-origin support."
          : "No inline speculationrules scripts were found on the current document.",
      );
    } else if (pairLocked) {
      setNotice(
        `Current page has no compatible target. Comparison remains locked to ${shortUrl(sourceUrl)} → ${shortUrl(targetUrl)}.`,
      );
    }
    render();
    return analysis;
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
    return null;
  } finally {
    elements.scanButton.disabled = false;
  }
}

function renderCapabilities() {
  elements.capabilities.replaceChildren();
  if (!analysis) {
    return;
  }
  const values = [
    ["API", analysis.apiSupported],
    ["deliveryType", analysis.deliveryTypeSupported],
  ];
  for (const [label, supported] of values) {
    const badge = document.createElement("span");
    badge.classList.toggle("ok", supported);
    badge.textContent = `${label} ${supported ? "exposed" : "not exposed"}`;
    elements.capabilities.append(badge);
  }
}

function appendEmptyRow(body, columnCount, message, className = "") {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.textContent = message;
  if (className) cell.className = className;
  row.append(cell);
  body.append(row);
}

function appendTextCell(row, value, { code = false, className = "" } = {}) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  const content = code ? document.createElement("code") : document.createTextNode(String(value));
  if (code) content.textContent = String(value);
  cell.append(content);
  row.append(cell);
  return cell;
}

function renderRules() {
  if (!analysis) return;
  elements.rulesSummary.textContent = `${analysis.scriptsFound} script${analysis.scriptsFound === 1 ? "" : "s"}, ${analysis.rules.length} rule${analysis.rules.length === 1 ? "" : "s"}, ${analysis.eligibleTargets.length} M1-compatible target${analysis.eligibleTargets.length === 1 ? "" : "s"}.`;

  elements.rulesBody.replaceChildren();
  analysis.rules.forEach((rule) => {
    const targets = rule.targets.length ? rule.targets : [{ url: "—", m1Compatible: false, reasons: rule.reasons }];
    targets.forEach((target) => {
      const reasons = [...new Set([...(rule.reasons || []), ...(target.reasons || [])])];
      const row = document.createElement("tr");
      appendTextCell(row, rule.action);
      appendTextCell(row, rule.source);
      appendTextCell(row, rule.eagerness);
      appendTextCell(row, shortUrl(target.url), { code: true });
      const statusCell = appendTextCell(
        row,
        target.m1Compatible ? "compatible" : "filtered",
        { className: target.m1Compatible ? "status-ok" : "status-warn" },
      );
      if (reasons.length) {
        const reason = document.createElement("span");
        reason.className = "reason";
        reason.textContent = reasons.join("; ");
        statusCell.append(reason);
      }
      elements.rulesBody.append(row);
    });
  });

  if (analysis.errors.length) {
    analysis.errors.forEach((error) =>
      appendEmptyRow(
        elements.rulesBody,
        5,
        `Script ${error.scriptIndex + 1}: ${error.message}`,
        "status-error",
      ),
    );
  }

  if (!elements.rulesBody.children.length) {
    appendEmptyRow(
      elements.rulesBody,
      5,
      "No prefetch or prerender entries were found.",
    );
  }
}

function currentDisplayRun() {
  return (
    session.active ||
    session.runs[session.lastRunMode] ||
    session.runs.blocked ||
    session.runs.enabled
  );
}

function renderRequests() {
  const run = currentDisplayRun();
  const requests = run?.requests || [];
  elements.requestCount.textContent = `${requests.length} relevant request${requests.length === 1 ? "" : "s"}`;
  elements.requestsBody.replaceChildren();
  if (!requests.length) {
    appendEmptyRow(
      elements.requestsBody,
      7,
      "No relevant requests recorded for the current run.",
    );
    return;
  }

  [...requests]
    .sort((a, b) => a.startedAt - b.startedAt)
    .forEach((request) => {
      const elapsed = Math.max(0, request.startedAt - run.startedAt);
      const kind = request.isPrefetch ? "prefetch" : request.type;
      const status = request.blocked
        ? "blocked"
        : request.statusCode
          ? `${request.statusCode} · ${request.status}`
          : request.status;
      const row = document.createElement("tr");
      appendTextCell(row, `${elapsed.toFixed(0)} ms`);
      appendTextCell(row, kind, {
        className: request.isPrefetch ? "status-ok" : "",
      });
      appendTextCell(row, shortUrl(request.url), { code: true });
      appendTextCell(row, request.purpose || "—", { code: true });
      appendTextCell(row, status, {
        className: request.blocked ? "status-warn" : "",
      });
      appendTextCell(row, request.responseHeaders?.["cache-control"] || "—", {
        code: true,
      });
      appendTextCell(row, request.fromCache ? "yes" : "no");
      elements.requestsBody.append(row);
    });
}

function formatBytes(value) {
  return Number.isFinite(value) ? `${value} B` : "not saved";
}

function formatMilliseconds(value) {
  return Number.isFinite(value) ? `${Math.max(0, value).toFixed(1)} ms` : "not saved";
}

function renderSummary(container, run) {
  container.replaceChildren();
  const summary = summarizeRun(run);
  const values = summary
    ? [
    ["Status", summary.status],
    ["Prefetch requests", summary.prefetchCount],
    ["Blocked", summary.blockedCount],
    ["Completed prefetches", summary.completedPrefetchCount],
    [
      "Prefetch duration",
      summary.blockedCount
        ? "blocked before response"
        : formatMilliseconds(summary.prefetchDuration),
    ],
    ["Target navigations", summary.targetNavigationCount],
    ["deliveryType", summary.navigation?.deliveryType || "empty"],
    ["Navigation transfer", formatBytes(summary.navigation?.transferSize)],
    [
      "Request → response",
      formatMilliseconds(
        summary.navigation
          ? summary.navigation.responseStart - summary.navigation.requestStart
          : Number.NaN,
      ),
    ],
    ["Navigation duration", formatMilliseconds(summary.navigation?.duration)],
    ["Activation", summary.activationObserved ? "observed" : "not exposed"],
    ["Prefetch reuse", summary.cacheReuseObserved ? "observed" : "not observed"],
    ["Navigation cache hit", summary.targetNavigationCacheHit ? "yes" : "no"],
    ["Clean cache start", summary.cachePrepared ? "yes" : "no"],
    [
      "Cache-Control",
      summary.blockedCount
        ? "not available — blocked before response"
        : summary.cacheControl || "not captured",
    ],
      ]
    : [["Status", "Not run"]];
  for (const [label, value] of values) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = String(label);
    description.textContent = String(value);
    wrapper.append(term, description);
    container.append(wrapper);
  }
}

function renderComparison() {
  renderSummary(elements.enabledSummary, session.runs.enabled);
  renderSummary(elements.blockedSummary, session.runs.blocked);
  const assessment = assessComparison(session.runs.enabled, session.runs.blocked);
  elements.comparisonAssessment.textContent = assessment.message;
  elements.comparisonAssessment.className = `assessment ${assessment.status}`;
}

function renderControls() {
  const active = session.active;
  const cacheReady = session.cacheEpoch > session.lastStartedCacheEpoch;
  const cacheClearing = session.cacheStatus === "clearing";
  const cacheClearArmed = Date.now() < cacheClearConfirmUntil;
  elements.captureState.textContent = active
    ? `${active.mode === "enabled" ? "Enabled" : "Blocked control"} · ${active.status}`
    : cacheReady
      ? "Idle · cache ready"
      : "Idle · clear cache before next run";
  elements.sourceUrl.textContent = sourceUrl || "—";
  elements.targetUrl.textContent = targetUrl || "No explicit compatible target";
  elements.pairState.textContent = sourceUrl && targetUrl ? "Locked" : "Not locked";
  elements.cacheState.textContent = cacheClearing
    ? "Clearing…"
    : cacheReady
      ? "Ready for one run"
      : "Clear before next run";
  elements.enabledButton.disabled = Boolean(active) || cacheClearing;
  elements.blockedButton.disabled = Boolean(active) || cacheClearing;
  elements.clearCacheButton.disabled = Boolean(active) || cacheClearing;
  elements.clearCacheButton.textContent = cacheClearing
    ? "Clearing HTTP cache…"
    : cacheClearArmed
      ? "Confirm: clear entire HTTP cache"
      : "Clear entire HTTP cache";
  elements.navigateButton.disabled = !active || !targetUrl;
  elements.finishButton.disabled = !active;
  elements.stopButton.disabled = !active;
}

function clearHttpCache() {
  if (Date.now() >= cacheClearConfirmUntil) {
    cacheClearConfirmUntil = Date.now() + 8000;
    window.clearTimeout(cacheClearConfirmTimer);
    cacheClearConfirmTimer = window.setTimeout(() => {
      cacheClearConfirmUntil = 0;
      renderControls();
    }, 8000);
    setNotice(
      "This clears the entire Firefox HTTP cache. Click the cache button again within 8 seconds to confirm.",
    );
    renderControls();
    return;
  }
  cacheClearConfirmUntil = 0;
  window.clearTimeout(cacheClearConfirmTimer);
  renderControls();
  port.postMessage({ type: "CLEAR_HTTP_CACHE", tabId });
  setNotice("Clearing the Firefox HTTP cache…");
}

function render() {
  renderCapabilities();
  if (analysis) renderRules();
  renderControls();
  renderRequests();
  renderComparison();
}

async function startRun(mode) {
  if (!sourceUrl) await scanPage();
  if (!sourceUrl) {
    setNotice("No inspectable HTTP or HTTPS source page is available.", true);
    return;
  }
  if (session.cacheStatus === "clearing") {
    setNotice("The HTTP cache is still clearing. Wait for Ready for one run.", true);
    return;
  }
  if (session.cacheEpoch <= session.lastStartedCacheEpoch) {
    setNotice(
      "Cache is not ready. Click Clear entire HTTP cache, then click its confirmation state within 8 seconds.",
      true,
    );
    return;
  }
  port.postMessage({
    type: "START_RUN",
    tabId,
    mode,
    sourceUrl,
    targetUrl,
  });
  setNotice(
    mode === "enabled"
      ? "Enabled capture started. Firefox is reloading the source page normally."
      : "Blocked-prefetch control started. Speculative prefetch requests will be cancelled.",
  );
}

async function navigateToTarget() {
  if (!targetUrl) return;
  port.postMessage({ type: "NAVIGATE_TARGET", tabId, url: targetUrl });
  setNotice("Navigating to the selected rule target. Finish the run after the page loads.");
}

async function finishRun() {
  try {
    const finalSnapshot = await capturePageSnapshot();
    port.postMessage({ type: "FINISH_RUN", tabId, pageSnapshot: finalSnapshot });
    setNotice("Run and final navigation measurement saved. Start the other condition or export the evidence.");
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  }
}

function exportEvidence() {
  const evidence = sanitizeEvidence({
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    inspectedTabId: tabId,
    sourceUrl,
    targetUrl,
    lockedPair: { sourceUrl, targetUrl },
    sourcePageSnapshot,
    pageAnalysis: sourceAnalysis || analysis,
    currentPageSnapshot: pageSnapshot,
    currentPageAnalysis: analysis,
    session,
    summaries: {
      enabled: summarizeRun(session.runs.enabled),
      blocked: summarizeRun(session.runs.blocked),
    },
    methodology: {
      enabled: "Firefox behavior is observed without intervention.",
      control: "Requests carrying Sec-Purpose: prefetch are cancelled by the extension.",
      cache: "Cache isolation is recorded per run. The explicit cache action clears the entire Firefox HTTP cache, so use a dedicated profile.",
    },
    privacy: {
      exportMode: "sanitized",
      headerPolicy: "Only diagnostic allowlisted headers are captured.",
      inlineRuleText: "Omitted from exported page snapshots.",
      sensitiveQueryValues: "Redacted by parameter name.",
    },
  });
  const blob = new Blob([JSON.stringify(evidence, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `speculation-rules-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function submitFeedback() {
  port.postMessage({ type: "OPEN_FEEDBACK", tabId });
  setNotice("Opening the repository issue form chooser in a new tab.");
}

elements.scanButton.addEventListener("click", () => scanPage());
elements.exportButton.addEventListener("click", exportEvidence);
elements.feedbackButton.addEventListener("click", submitFeedback);
elements.clearButton.addEventListener("click", () => {
  port.postMessage({ type: "CLEAR_SESSION", tabId });
  setNotice("Captured runs cleared. Page scan retained.");
});
elements.enabledButton.addEventListener("click", () => startRun("enabled"));
elements.blockedButton.addEventListener("click", () => startRun("blocked"));
elements.clearCacheButton.addEventListener("click", clearHttpCache);
elements.navigateButton.addEventListener("click", navigateToTarget);
elements.finishButton.addEventListener("click", finishRun);
elements.stopButton.addEventListener("click", () => {
  port.postMessage({ type: "STOP_RUN", tabId });
  setNotice("Run cancelled without a final navigation measurement. Use Finish and save measurement for a comparable result.", true);
});

port.onMessage.addListener((message) => {
  if (
    message.type === "PAGE_SNAPSHOT" ||
    message.type === "PAGE_SNAPSHOT_ERROR"
  ) {
    const pending = pendingSnapshots.get(message.requestId);
    if (!pending) return;
    pendingSnapshots.delete(message.requestId);
    window.clearTimeout(pending.timeout);
    if (message.type === "PAGE_SNAPSHOT") {
      pending.resolve(message.snapshot);
    } else {
      pending.reject(
        new Error(
          message.error ||
            "Unable to inspect the current page. Wait for it to load and scan again.",
        ),
      );
    }
    return;
  }
  if (message.type !== "STATE") return;
  session = message.session;
  if (session.cacheStatus === "clearing") {
    setNotice("Clearing the Firefox HTTP cache…");
  } else if (session.commandError) {
    setNotice(session.commandError, true);
  } else if (session.cacheError) {
    setNotice(session.cacheError, true);
  } else if (
    session.lastCacheClearAt &&
    session.lastCacheClearAt !== announcedCacheClearAt &&
    !session.active
  ) {
    announcedCacheClearAt = session.lastCacheClearAt;
    setNotice("HTTP cache cleared. Start one condition now; clear it again before the other condition.");
  }
  render();
});
port.onDisconnect.addListener(() => {
  for (const pending of pendingSnapshots.values()) {
    window.clearTimeout(pending.timeout);
    pending.reject(new Error("The extension background page disconnected."));
  }
  pendingSnapshots.clear();
  setNotice("The extension background page disconnected. Reopen DevTools to reconnect.", true);
});

browser.devtools.network.onNavigated.addListener(() => {
  window.clearTimeout(navigationScanTimer);
  navigationScanTimer = window.setTimeout(() => scanPage({ preserveTarget: true }), 600);
});

port.postMessage({ type: "REGISTER", tabId });
scanPage();
