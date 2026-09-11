function inlineScriptString(value: string) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function createTargetPage(request: Request) {
  const serverPurpose = request.headers.get("sec-purpose") ?? "";
  const serverFetchDest = request.headers.get("sec-fetch-dest") ?? "";
  const serverFetchMode = request.headers.get("sec-fetch-mode") ?? "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prefetch Lab · Run result</title>
  <style>
    :root { color-scheme: light; --ink:#172018; --muted:#657067; --paper:#f4f2ea; --panel:#fcfbf7; --line:#d8d8ce; --green:#2a6f4e; --soft:#dfece3; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at 75% 15%,rgba(42,111,78,.11),transparent 26rem),var(--paper); color:var(--ink); font-family:Arial,sans-serif; }
    main { width:min(800px,calc(100% - 32px)); margin:0 auto; padding:60px 0; }
    .mark { width:34px;height:34px;display:grid;place-items:center;border-radius:9px 9px 9px 2px;background:var(--green);color:white;font:14px monospace; }
    .eyebrow { margin:50px 0 12px;color:var(--green);font:600 11px monospace;letter-spacing:.12em;text-transform:uppercase; }
    h1 { margin:0 0 18px;font-size:clamp(44px,8vw,72px);line-height:.98;letter-spacing:-.055em;font-weight:580; }
    .lede { max-width:630px;margin:0 0 42px;color:var(--muted);font-size:17px;line-height:1.55; }
    .card { padding:28px;border:1px solid var(--line);border-radius:18px;background:rgba(252,251,247,.9);box-shadow:0 18px 44px rgba(27,37,29,.05); }
    .status { display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:24px;border-bottom:1px solid var(--line); }
    .badge { border-radius:999px;padding:7px 10px;background:var(--soft);color:#1f503a;font:10px monospace;text-transform:uppercase; }
    .metrics { display:grid;grid-template-columns:repeat(2,1fr); }
    .metric { padding:22px 0;border-bottom:1px solid var(--line); }
    .metric:nth-child(odd) { border-right:1px solid var(--line); }
    .metric:nth-child(even) { padding-left:22px; }
    .metric span { display:block;margin-bottom:9px;color:var(--muted);font:10px monospace;text-transform:uppercase; }
    .metric strong { font-size:20px;font-weight:600; }
    .actions { display:flex;align-items:center;gap:12px;margin-top:26px; }
    a { display:inline-flex;min-height:43px;align-items:center;border-radius:10px;padding:0 17px;text-decoration:none;font-size:13px;font-weight:650; }
    .primary { background:var(--green);color:white; }
    .secondary { border:1px solid var(--line);color:var(--ink); }
    .note { margin:25px 0 0;color:var(--muted);font-size:12px;line-height:1.55; }
    @media(max-width:560px){ main{padding:35px 0}.metrics{grid-template-columns:1fr}.metric:nth-child(odd){border-right:0}.metric:nth-child(even){padding-left:0}.actions{align-items:stretch;flex-direction:column}a{justify-content:center;width:100%} }
  </style>
</head>
<body>
  <main>
    <div class="mark">P</div>
    <p class="eyebrow">Run complete</p>
    <h1 id="headline">Reading navigation timing…</h1>
    <p class="lede" id="summary">The destination is collecting the browser-visible result for this navigation.</p>
    <section class="card">
      <div class="status">
        <strong id="case-label">Experiment result</strong>
        <span class="badge" id="badge">checking</span>
      </div>
      <div class="metrics">
        <div class="metric"><span>deliveryType</span><strong id="delivery">—</strong></div>
        <div class="metric"><span>transfer size</span><strong id="transfer">—</strong></div>
        <div class="metric"><span>request → response</span><strong id="latency">—</strong></div>
        <div class="metric"><span>total duration</span><strong id="duration">—</strong></div>
        <div class="metric"><span>Sec-Purpose</span><strong id="server-purpose">—</strong></div>
        <div class="metric"><span>Sec-Fetch</span><strong id="server-fetch">—</strong></div>
      </div>
      <div class="actions">
        <a class="primary" href="/">Return to comparison</a>
        <a class="secondary" href="/" id="run-other">Run other case</a>
      </div>
      <p class="note">Sec-Purpose: prefetch confirms that the displayed response was fetched speculatively. deliveryType reports whether Firefox exposed that response as an activated navigational prefetch.</p>
    </section>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const runCase = params.get("case") === "prefetch" ? "prefetch" : "control";
    const runId = params.get("run") || "unknown";
    const serverRequest = {
      purpose: ${inlineScriptString(serverPurpose)},
      fetchDest: ${inlineScriptString(serverFetchDest)},
      fetchMode: ${inlineScriptString(serverFetchMode)}
    };
    const serverPrefetchObserved = serverRequest.purpose.toLowerCase().includes("prefetch");
    let observedNavigation = null;
    let navigationObserver = null;

    try {
      navigationObserver = new PerformanceObserver((list) => {
        observedNavigation = list.getEntries().find((entry) => entry.entryType === "navigation") || observedNavigation;
      });
      navigationObserver.observe({ type: "navigation", buffered: true });
    } catch {
      navigationObserver = null;
    }

    function recordResult(nav) {
      const timingAvailable = Boolean(nav);
      const result = {
        case: runCase,
        runId,
        timingAvailable,
        serverPurpose: serverRequest.purpose,
        serverFetchDest: serverRequest.fetchDest,
        serverFetchMode: serverRequest.fetchMode,
        deliveryType: nav && "deliveryType" in nav ? nav.deliveryType : "",
        transferSize: nav ? nav.transferSize : 0,
        encodedBodySize: nav ? nav.encodedBodySize : 0,
        decodedBodySize: nav ? nav.decodedBodySize : 0,
        duration: nav ? nav.duration : 0,
        requestStart: nav ? nav.requestStart : 0,
        responseStart: nav ? nav.responseStart : 0,
        recordedAt: new Date().toISOString()
      };
      localStorage.setItem("prefetch-lab:last-result", JSON.stringify(result));

      const activated = result.deliveryType === "navigational-prefetch";
      document.getElementById("headline").textContent = !timingAvailable
        ? "Navigation timing unavailable."
        : activated
          ? "Prefetch activation observed."
          : serverPrefetchObserved
            ? "Prefetch request observed."
          : "Navigation recorded.";
      document.getElementById("summary").textContent = !timingAvailable
        ? "Firefox did not expose a navigation timing entry for this load, so no performance result was recorded."
        : activated
          ? "Firefox reported that this document navigation reused a navigational prefetch."
          : serverPrefetchObserved
            ? "The server received Sec-Purpose: prefetch, although Firefox left deliveryType blank for this navigation."
          : "The timing entry was captured. Compare it with the other case before drawing a conclusion.";
      document.getElementById("case-label").textContent = runCase === "prefetch" ? "Prefetched case" : "Control case";
      document.getElementById("badge").textContent = !timingAvailable
        ? "timing unavailable"
        : activated
          ? "prefetch activated"
          : serverPrefetchObserved
            ? "prefetch request observed"
          : runCase;
      document.getElementById("delivery").textContent = timingAvailable ? result.deliveryType || "empty" : "unavailable";
      document.getElementById("transfer").textContent = timingAvailable ? result.transferSize + " B" : "unavailable";
      document.getElementById("latency").textContent = timingAvailable
        ? Math.max(0, result.responseStart - result.requestStart).toFixed(1) + " ms"
        : "unavailable";
      document.getElementById("duration").textContent = timingAvailable ? result.duration.toFixed(1) + " ms" : "unavailable";
      document.getElementById("server-purpose").textContent = serverRequest.purpose || "not present";
      document.getElementById("server-fetch").textContent = [serverRequest.fetchDest, serverRequest.fetchMode].filter(Boolean).join(" · ") || "not present";
      document.getElementById("run-other").textContent = runCase === "prefetch" ? "Run control next" : "Run prefetch next";
    }

    function captureNavigationTiming() {
      let attempts = 0;

      function tryCapture() {
        const nav = observedNavigation || performance.getEntriesByType("navigation")[0];
        if (!nav && attempts < 20) {
          attempts += 1;
          setTimeout(tryCapture, 50);
          return;
        }

        navigationObserver?.disconnect();
        recordResult(nav);
      }

      // Run after the load event handler returns so final navigation fields,
      // including duration, have had a chance to settle.
      setTimeout(tryCapture, 0);
    }

    if (document.readyState === "complete") {
      captureNavigationTiming();
    } else {
      window.addEventListener("load", captureNavigationTiming, { once: true });
    }
  </script>
</body>
</html>`;
}

export function GET(request: Request) {
  return new Response(createTargetPage(request), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
