/* global browser */

const sessions = new Map();
const subscribers = new Map();
const requestOwners = new Map();
const MAX_REQUESTS_PER_RUN = 600;
const REQUEST_HEADER_ALLOWLIST = new Set([
  "accept",
  "purpose",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-purpose",
]);
const RESPONSE_HEADER_ALLOWLIST = new Set([
  "age",
  "cache-control",
  "content-length",
  "content-type",
  "expires",
  "vary",
]);
const FEEDBACK_URL =
  "https://github.com/skylarkning/Speculation-Rules-Testbench/issues";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readableError(error, fallback) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message || /unexpected error occurred/i.test(message)) return fallback;
  return message.replace(/^Error:\s*/, "");
}

async function capturePageSnapshot(tabId) {
  let lastError;
  for (const wait of [0, 250, 750]) {
    if (wait) await delay(wait);
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          const navigation = performance.getEntriesByType("navigation")[0];
          return {
            pageUrl: location.href,
            title: document.title,
            apiSupported:
              typeof HTMLScriptElement.supports === "function" &&
              HTMLScriptElement.supports("speculationrules"),
            deliveryTypeSupported:
              "PerformanceNavigationTiming" in window &&
              "deliveryType" in PerformanceNavigationTiming.prototype,
            scripts: Array.from(
              document.querySelectorAll('script[type="speculationrules"]'),
            ).map((script, index) => ({
              index,
              text: script.textContent || "",
              src: script.src || "",
            })),
            navigation: navigation
              ? {
                  name: navigation.name,
                  deliveryType:
                    "deliveryType" in navigation ? navigation.deliveryType : "",
                  transferSize: navigation.transferSize,
                  encodedBodySize: navigation.encodedBodySize,
                  decodedBodySize: navigation.decodedBodySize,
                  requestStart: navigation.requestStart,
                  responseStart: navigation.responseStart,
                  duration: navigation.duration,
                  type: navigation.type,
                }
              : null,
          };
        },
      });
      if (!results?.[0]?.result) {
        throw new Error("The inspected page did not return a snapshot.");
      }
      return results[0].result;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    readableError(
      lastError,
      "Firefox could not access the inspected page. Wait for navigation to finish, then scan again.",
    ),
  );
}

function openFeedback() {
  return browser.tabs.create({ url: FEEDBACK_URL });
}

function getSession(tabId) {
  if (!sessions.has(tabId)) {
    sessions.set(tabId, {
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
    });
  }
  return sessions.get(tabId);
}

function publicSession(tabId) {
  const session = getSession(tabId);
  return JSON.parse(JSON.stringify(session));
}

function publish(tabId) {
  const message = { type: "STATE", session: publicSession(tabId) };
  for (const port of subscribers.get(tabId) || []) {
    try {
      port.postMessage(message);
    } catch {
      // The disconnect listener removes stale ports.
    }
  }
}

function registerPort(tabId, port) {
  if (!subscribers.has(tabId)) subscribers.set(tabId, new Set());
  subscribers.get(tabId).add(port);
  port.__speculationRulesTabId = tabId;
  publish(tabId);
}

function unregisterPort(port) {
  const tabId = port.__speculationRulesTabId;
  if (!Number.isInteger(tabId)) return;
  const ports = subscribers.get(tabId);
  ports?.delete(port);
  if (ports?.size === 0) subscribers.delete(tabId);
}

function normalizedHeaders(headers = [], allowlist = null) {
  return Object.fromEntries(
    headers
      .filter((header) => header && typeof header.name === "string")
      .filter((header) => !allowlist || allowlist.has(header.name.toLowerCase()))
      .map((header) => [
        header.name.toLowerCase(),
        typeof header.value === "string" ? header.value : "",
      ]),
  );
}

function purposeFrom(headers = []) {
  const values = normalizedHeaders(headers);
  return [values["sec-purpose"], values.purpose].filter(Boolean).join(", ");
}

function comparableUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value || "";
  }
}

function clearRequestOwners(tabId) {
  for (const [requestId, ownerTabId] of requestOwners) {
    if (ownerTabId === tabId) requestOwners.delete(requestId);
  }
}

function isPrefetch(details) {
  const purpose = purposeFrom(details.requestHeaders).toLowerCase();
  return (
    details.type === "speculative" ||
    /(^|[,;\s])prefetch([,;\s]|$)/.test(purpose)
  );
}

function findRequest(run, requestId) {
  return run.requests.find((request) => request.requestId === requestId);
}

function ensureRequest(run, details) {
  let request = findRequest(run, details.requestId);
  if (request) return request;

  request = {
    requestId: details.requestId,
    url: details.url,
    method: details.method || "GET",
    type: details.type || "other",
    frameId: details.frameId,
    parentFrameId: details.parentFrameId,
    documentUrl: details.documentUrl || details.originUrl || "",
    startedAt: details.timeStamp,
    lastEventAt: details.timeStamp,
    status: "started",
    isPrefetch: false,
    blocked: false,
    purpose: "",
    requestHeaders: {},
    responseHeaders: {},
    statusCode: null,
    fromCache: false,
    error: "",
    phases: [],
  };
  run.requests.push(request);
  if (run.requests.length > MAX_REQUESTS_PER_RUN) run.requests.shift();
  return request;
}

function recordPhase(request, phase, timeStamp) {
  request.lastEventAt = timeStamp;
  request.phases.push({ phase, timeStamp });
}

function activeContext(details) {
  const ownedTabId = requestOwners.get(details.requestId);
  if (Number.isInteger(ownedTabId)) {
    const ownedRun = sessions.get(ownedTabId)?.active;
    if (ownedRun) {
      return {
        tabId: ownedTabId,
        run: ownedRun,
        targetMatch:
          comparableUrl(details.url) === comparableUrl(ownedRun.targetUrl),
      };
    }
    requestOwners.delete(details.requestId);
  }

  if (Number.isInteger(details.tabId) && details.tabId >= 0) {
    const run = sessions.get(details.tabId)?.active;
    if (run) {
      return {
        tabId: details.tabId,
        run,
        targetMatch: comparableUrl(details.url) === comparableUrl(run.targetUrl),
      };
    }
  }

  // Firefox may expose speculative requests without usable tab information.
  // Associate an unowned request only when exactly one active run expects its
  // URL (or identifies the source document), avoiding cross-tab attribution.
  const requestUrl = comparableUrl(details.url);
  const documentUrl = comparableUrl(details.documentUrl || details.originUrl);
  const candidates = [];
  for (const [tabId, session] of sessions) {
    const run = session.active;
    if (!run) continue;
    const targetMatch =
      Boolean(run.targetUrl) && requestUrl === comparableUrl(run.targetUrl);
    const sourceMatch =
      Boolean(documentUrl) && documentUrl === comparableUrl(run.sourceUrl);
    if (targetMatch || sourceMatch) candidates.push({ tabId, run, targetMatch });
  }
  if (candidates.length !== 1) return null;
  return candidates[0];
}

async function startRun(tabId, payload) {
  const session = getSession(tabId);
  clearRequestOwners(tabId);
  session.commandError = "";
  if (session.active) {
    session.active.status = "superseded";
    session.active.finishedAt = Date.now();
    session.runs[session.active.mode] = session.active;
  }

  session.active = {
    id: crypto.randomUUID(),
    mode: payload.mode === "blocked" ? "blocked" : "enabled",
    status: "recording",
    sourceUrl: payload.sourceUrl || "",
    targetUrl: payload.targetUrl || "",
    startedAt: Date.now(),
    finishedAt: null,
    cachePrepared: session.cacheEpoch > session.lastStartedCacheEpoch,
    cacheEpoch: session.cacheEpoch,
    cacheClearedAt: session.lastCacheClearAt,
    requests: [],
    pageSnapshot: null,
  };
  session.cacheStatus = "consumed";
  session.lastRunMode = session.active.mode;
  session.lastStartedCacheEpoch = session.cacheEpoch;
  publish(tabId);

  const tab = await browser.tabs.get(tabId);
  const sourceUrl = session.active.sourceUrl;
  if (sourceUrl && tab.url !== sourceUrl) {
    await browser.tabs.update(tabId, { url: sourceUrl });
  } else {
    await browser.tabs.reload(tabId);
  }
}

async function clearHttpCache(tabId) {
  const session = getSession(tabId);
  if (session.active) throw new Error("Stop the active capture before clearing cache.");
  session.cacheStatus = "clearing";
  session.cacheError = "";
  session.commandError = "";
  publish(tabId);
  try {
    await browser.browsingData.removeCache({});
    session.cacheEpoch += 1;
    session.lastCacheClearAt = Date.now();
    session.cacheStatus = "ready";
  } catch (error) {
    session.cacheStatus = "error";
    session.cacheError = error instanceof Error ? error.message : String(error);
  }
  publish(tabId);
}

function finishRun(tabId, pageSnapshot) {
  const session = getSession(tabId);
  if (!session.active) return;
  session.active.status = "complete";
  session.active.finishedAt = Date.now();
  session.active.pageSnapshot = pageSnapshot || null;
  session.runs[session.active.mode] = session.active;
  session.active = null;
  publish(tabId);
}

function stopRun(tabId) {
  const session = getSession(tabId);
  if (session.active) {
    session.active.status = "stopped";
    session.active.finishedAt = Date.now();
    session.runs[session.active.mode] = session.active;
    session.active = null;
  }
  publish(tabId);
}

function clearSession(tabId) {
  const previous = getSession(tabId);
  clearRequestOwners(tabId);
  sessions.set(tabId, {
    tabId,
    active: null,
    runs: { enabled: null, blocked: null },
    lastRunMode: null,
    cacheEpoch: previous.cacheEpoch,
    lastStartedCacheEpoch: previous.lastStartedCacheEpoch,
    lastCacheClearAt: previous.lastCacheClearAt,
    cacheStatus: previous.cacheStatus || "idle",
    cacheError: previous.cacheError || "",
    commandError: "",
  });
  publish(tabId);
}

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "speculation-rules-testbench") return;

  port.onMessage.addListener((message) => {
    const tabId = Number(message?.tabId);
    if (!Number.isInteger(tabId)) return;

    if (message.type === "REGISTER") {
      registerPort(tabId, port);
      return;
    }
    if (message.type === "GET_STATE") {
      publish(tabId);
      return;
    }
    if (message.type === "CAPTURE_PAGE_SNAPSHOT") {
      capturePageSnapshot(tabId)
        .then((snapshot) => {
          port.postMessage({
            type: "PAGE_SNAPSHOT",
            requestId: message.requestId,
            snapshot,
          });
        })
        .catch((error) => {
          port.postMessage({
            type: "PAGE_SNAPSHOT_ERROR",
            requestId: message.requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }
    if (message.type === "NAVIGATE_TARGET") {
      browser.tabs.update(tabId, { url: message.url }).catch((error) => {
        const session = getSession(tabId);
        session.commandError = `Could not navigate to target: ${readableError(
          error,
          "Firefox rejected the navigation. Try the target link directly.",
        )}`;
        publish(tabId);
      });
      return;
    }
    if (message.type === "OPEN_FEEDBACK") {
      openFeedback().catch((error) => {
        const session = getSession(tabId);
        session.commandError = `Could not open the Issues page: ${readableError(
          error,
          `Open ${FEEDBACK_URL} directly.`,
        )}`;
        publish(tabId);
      });
      return;
    }
    if (message.type === "START_RUN") {
      startRun(tabId, message).catch((error) => {
        const session = getSession(tabId);
        if (session.active) {
          session.active.status = "error";
          session.active.error = String(error);
          session.active.finishedAt = Date.now();
          session.runs[session.active.mode] = session.active;
          session.active = null;
        }
        session.commandError = `Could not start capture: ${readableError(
          error,
          "Firefox could not reload the source page. Wait for navigation to finish and try again.",
        )}`;
        publish(tabId);
      });
      return;
    }
    if (message.type === "FINISH_RUN") {
      finishRun(tabId, message.pageSnapshot);
      return;
    }
    if (message.type === "STOP_RUN") {
      stopRun(tabId);
      return;
    }
    if (message.type === "CLEAR_HTTP_CACHE") {
      clearHttpCache(tabId).catch((error) => {
        const session = getSession(tabId);
        session.cacheStatus = "error";
        session.cacheError = String(error);
        publish(tabId);
      });
      return;
    }
    if (message.type === "CLEAR_SESSION") clearSession(tabId);
  });

  port.onDisconnect.addListener(() => unregisterPort(port));
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const context = activeContext(details);
    if (!context) return;
    const { run, tabId } = context;
    if (
      details.type !== "main_frame" &&
      details.type !== "speculative" &&
      !context.targetMatch
    ) return;
    const request = ensureRequest(run, details);
    requestOwners.set(details.requestId, tabId);
    recordPhase(request, "before-request", details.timeStamp);
    publish(tabId);
  },
  { urls: ["<all_urls>"] },
);

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const context = activeContext(details);
    if (!context) return undefined;
    const { run, tabId } = context;
    const prefetch = isPrefetch(details);
    if (!prefetch && details.type !== "main_frame") return undefined;

    const request = ensureRequest(run, details);
    requestOwners.set(details.requestId, tabId);
    request.requestHeaders = normalizedHeaders(
      details.requestHeaders,
      REQUEST_HEADER_ALLOWLIST,
    );
    request.purpose = purposeFrom(details.requestHeaders);
    request.isPrefetch = prefetch;
    recordPhase(request, "before-send-headers", details.timeStamp);

    if (prefetch && run.mode === "blocked") {
      request.blocked = true;
      request.status = "blocked";
      recordPhase(request, "blocked-by-testbench", details.timeStamp);
      publish(tabId);
      return { cancel: true };
    }

    publish(tabId);
    return undefined;
  },
  { urls: ["<all_urls>"] },
  ["blocking", "requestHeaders"],
);

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    const context = activeContext(details);
    if (!context) return;
    const { run, tabId } = context;
    const request = findRequest(run, details.requestId);
    if (!request) {
      requestOwners.delete(details.requestId);
      return;
    }
    request.responseHeaders = normalizedHeaders(
      details.responseHeaders,
      RESPONSE_HEADER_ALLOWLIST,
    );
    request.statusCode = details.statusCode;
    request.status = "response-started";
    recordPhase(request, "headers-received", details.timeStamp);
    publish(tabId);
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);

browser.webRequest.onCompleted.addListener(
  (details) => {
    const context = activeContext(details);
    if (!context) return;
    const { run, tabId } = context;
    const request = findRequest(run, details.requestId);
    if (!request) {
      requestOwners.delete(details.requestId);
      return;
    }
    request.status = "completed";
    request.statusCode = details.statusCode;
    request.fromCache = Boolean(details.fromCache);
    request.ip = details.ip || "";
    recordPhase(request, "completed", details.timeStamp);
    publish(tabId);
    requestOwners.delete(details.requestId);
  },
  { urls: ["<all_urls>"] },
);

browser.webRequest.onErrorOccurred.addListener(
  (details) => {
    const context = activeContext(details);
    if (!context) return;
    const { run, tabId } = context;
    const request = findRequest(run, details.requestId);
    if (!request) {
      requestOwners.delete(details.requestId);
      return;
    }
    request.status = request.blocked ? "blocked" : "error";
    request.error = details.error || "request failed";
    recordPhase(request, "error", details.timeStamp);
    publish(tabId);
    requestOwners.delete(details.requestId);
  },
  { urls: ["<all_urls>"] },
);

browser.tabs.onRemoved.addListener((tabId) => {
  clearRequestOwners(tabId);
  sessions.delete(tabId);
  subscribers.delete(tabId);
});
