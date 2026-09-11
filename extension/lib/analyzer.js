export const FIREFOX_M1 = Object.freeze({
  action: "prefetch",
  source: "list",
  eagerness: "immediate",
  sameOrigin: true,
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeUrl(value, base) {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

export function normalizeHeaders(headers = []) {
  return Object.fromEntries(
    headers
      .filter((header) => header && typeof header.name === "string")
      .map((header) => [
        header.name.toLowerCase(),
        typeof header.value === "string" ? header.value : "",
      ]),
  );
}

export function isPrefetchRequest(headers = [], resourceType = "") {
  const normalized = normalizeHeaders(headers);
  const purpose = [normalized["sec-purpose"], normalized.purpose]
    .filter(Boolean)
    .join(",")
    .toLowerCase();
  return resourceType === "speculative" || /(^|[,;\s])prefetch([,;\s]|$)/.test(purpose);
}

export function analyzePageSnapshot(snapshot) {
  const pageUrl = safeUrl(snapshot?.pageUrl || "", "https://invalid.example/");
  const scripts = asArray(snapshot?.scripts);
  const rules = [];
  const errors = [];

  scripts.forEach((script, scriptIndex) => {
    let documentRule;
    try {
      documentRule = JSON.parse(script.text || "");
    } catch (error) {
      errors.push({
        scriptIndex,
        message: error instanceof Error ? error.message : "Invalid JSON",
      });
      return;
    }

    for (const action of ["prefetch", "prerender"]) {
      asArray(documentRule?.[action]).forEach((rule, ruleIndex) => {
        const urls = asArray(rule?.urls);
        const source =
          typeof rule?.source === "string"
            ? rule.source
            : urls.length
              ? "list"
              : "document";
        const eagerness =
          typeof rule?.eagerness === "string"
            ? rule.eagerness
            : source === "list"
              ? "immediate"
              : "conservative";
        const reasons = [];

        if (action !== FIREFOX_M1.action) reasons.push("action is not prefetch");
        if (source !== FIREFOX_M1.source) reasons.push("source is not list");
        if (eagerness !== FIREFOX_M1.eagerness) {
          reasons.push("eagerness is not immediate");
        }
        if (!urls.length) reasons.push("list rule has no urls");

        const targets = urls.map((value) => {
          const targetUrl = pageUrl ? safeUrl(value, pageUrl.href) : null;
          const targetReasons = [...reasons];
          const sameOrigin = Boolean(
            pageUrl && targetUrl && pageUrl.origin === targetUrl.origin,
          );
          if (!targetUrl) targetReasons.push("target URL is invalid");
          else if (!sameOrigin) targetReasons.push("target is cross-origin");

          return {
            input: String(value),
            url: targetUrl?.href || String(value),
            sameOrigin,
            m1Compatible: targetReasons.length === 0,
            reasons: targetReasons,
          };
        });

        rules.push({
          scriptIndex,
          ruleIndex,
          action,
          source,
          eagerness,
          targets,
          m1Compatible:
            targets.length > 0 && targets.some((target) => target.m1Compatible),
          reasons,
          raw: rule,
        });
      });
    }
  });

  const eligibleTargets = rules.flatMap((rule) =>
    rule.targets.filter((target) => target.m1Compatible),
  );

  return {
    pageUrl: pageUrl?.href || snapshot?.pageUrl || "",
    title: snapshot?.title || "",
    apiSupported: Boolean(snapshot?.apiSupported),
    deliveryTypeSupported: Boolean(snapshot?.deliveryTypeSupported),
    scriptsFound: scripts.length,
    rules,
    errors,
    eligibleTargets,
  };
}

function comparableUrl(value) {
  const url = safeUrl(value || "", "https://invalid.example/");
  if (!url) return value || "";
  url.hash = "";
  return url.href;
}

export function summarizeRun(run) {
  if (!run) return null;
  const requests = asArray(run.requests);
  const prefetchRequests = requests.filter((request) => request.isPrefetch);
  const blockedRequests = prefetchRequests.filter((request) => request.blocked);
  const completedPrefetches = prefetchRequests.filter(
    (request) => request.status === "completed",
  );
  const targetUrl = comparableUrl(run.targetUrl);
  const targetNavigations = requests.filter(
    (request) =>
      request.type === "main_frame" &&
      targetUrl &&
      comparableUrl(request.url) === targetUrl,
  );
  const navigation = run.pageSnapshot?.navigation || null;
  const activationObserved =
    navigation?.deliveryType === "navigational-prefetch";
  const targetNavigationCacheHit = targetNavigations.some(
    (request) => request.fromCache,
  );
  const completedTargetPrefetch = completedPrefetches.some(
    (request) => comparableUrl(request.url) === targetUrl,
  );
  const cacheReuseObserved =
    activationObserved || (completedTargetPrefetch && targetNavigationCacheHit);
  const firstPrefetch = prefetchRequests[0] || null;
  const prefetchDuration = firstPrefetch && firstPrefetch.status === "completed"
    ? Math.max(0, firstPrefetch.lastEventAt - firstPrefetch.startedAt)
    : null;

  return {
    id: run.id,
    mode: run.mode,
    status: run.status,
    sourceUrl: run.sourceUrl || "",
    targetUrl: run.targetUrl || "",
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
    prefetchCount: prefetchRequests.length,
    blockedCount: blockedRequests.length,
    completedPrefetchCount: completedPrefetches.length,
    targetNavigationCount: targetNavigations.length,
    activationObserved,
    cacheReuseObserved,
    targetNavigationCacheHit,
    cachePrepared: Boolean(run.cachePrepared),
    purpose: firstPrefetch?.purpose || "",
    cacheControl: firstPrefetch?.responseHeaders?.["cache-control"] || "",
    responseStatus: firstPrefetch?.statusCode || null,
    prefetchDuration,
    navigation,
  };
}

export function assessComparison(enabledRun, blockedRun) {
  const enabled = summarizeRun(enabledRun);
  const blocked = summarizeRun(blockedRun);
  if (!enabled || !blocked) {
    return {
      status: "incomplete",
      message: "Run and save both conditions before interpreting the comparison.",
    };
  }
  if (enabled.status !== "complete" || blocked.status !== "complete") {
    return {
      status: "inconclusive",
      message:
        "One or both runs were stopped without saving the final navigation measurement. Repeat them and use Finish and save measurement after the target loads.",
    };
  }
  if (
    comparableUrl(enabled.sourceUrl) !== comparableUrl(blocked.sourceUrl) ||
    comparableUrl(enabled.targetUrl) !== comparableUrl(blocked.targetUrl)
  ) {
    return {
      status: "inconclusive",
      message:
        "The enabled and blocked runs used different source/target URLs. Rescan the intended source once, then repeat both conditions with the locked pair.",
    };
  }
  if (!enabled.cachePrepared || !blocked.cachePrepared) {
    return {
      status: "inconclusive",
      message:
        "Cache isolation is missing. Clear the HTTP cache immediately before each run, then repeat both conditions.",
    };
  }
  if (enabled.prefetchCount === 0) {
    return {
      status: "inconclusive",
      message:
        "No prefetch request was captured in the enabled run. Verify the rule, Nightly feature state, and request log before comparing navigation results.",
    };
  }
  if (blocked.blockedCount === 0) {
    return {
      status: "inconclusive",
      message:
        "The control did not intercept a prefetch request. Its target may already have been cached, or Firefox did not schedule the rule.",
    };
  }
  if (enabled.cacheReuseObserved) {
    return {
      status: "observed",
      message:
        "The enabled run captured a completed prefetch and later reuse evidence; the control intercepted the speculative request.",
    };
  }
  return {
    status: "partial",
    message:
      "The enabled prefetch and blocked control were captured, but Firefox did not expose conclusive reuse evidence for the navigation.",
  };
}
