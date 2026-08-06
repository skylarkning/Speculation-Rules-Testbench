const targetPage = `<!doctype html>
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
      </div>
      <div class="actions">
        <a class="primary" href="/">Return to comparison</a>
        <a class="secondary" href="/" id="run-other">Run other case</a>
      </div>
      <p class="note">A blank deliveryType means Firefox did not expose navigational-prefetch for this load. Confirm Sec-Purpose and Sec-Fetch headers separately when diagnosing request behavior.</p>
    </section>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const runCase = params.get("case") === "prefetch" ? "prefetch" : "control";
    const runId = params.get("run") || "unknown";
    const nav = performance.getEntriesByType("navigation")[0];
    const result = {
      case: runCase,
      runId,
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
    document.getElementById("headline").textContent = activated ? "Prefetch activation observed." : "Navigation recorded.";
    document.getElementById("summary").textContent = activated ? "Firefox reported that this document navigation reused a navigational prefetch." : "The timing entry was captured. Compare it with the other case before drawing a conclusion.";
    document.getElementById("case-label").textContent = runCase === "prefetch" ? "Prefetched case" : "Control case";
    document.getElementById("badge").textContent = activated ? "prefetch activated" : runCase;
    document.getElementById("delivery").textContent = result.deliveryType || "empty";
    document.getElementById("transfer").textContent = result.transferSize + " B";
    document.getElementById("latency").textContent = Math.max(0, result.responseStart - result.requestStart).toFixed(1) + " ms";
    document.getElementById("duration").textContent = result.duration.toFixed(1) + " ms";
    document.getElementById("run-other").textContent = runCase === "prefetch" ? "Run control next" : "Run prefetch next";
  </script>
</body>
</html>`;

export function GET() {
  return new Response(targetPage, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
