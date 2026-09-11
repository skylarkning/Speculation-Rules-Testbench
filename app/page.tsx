"use client";

import { useEffect, useMemo, useState } from "react";

type RunResult = {
  case: "prefetch" | "control";
  runId: string;
  timingAvailable: boolean;
  serverPurpose?: string;
  serverFetchDest?: string;
  serverFetchMode?: string;
  deliveryType: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  duration: number;
  requestStart: number;
  responseStart: number;
  recordedAt: string;
};

type RunnerState = "idle" | "prefetching" | "ready";
type VisualMode = "enabled" | "disabled";

type Candidate = {
  slug: string;
  name: string;
  url: string;
  reach: string;
  reachSource: string;
  observed: string;
  rule: object;
  source: "list" | "document";
  eagerness: "immediate" | "conservative";
  m1Compatible: boolean;
  external: boolean;
  evidenceUrl?: string;
  benchmark?: {
    enabledLoad: number;
    enabledLcp: number;
    disabledLoad: number;
    disabledLcp: number;
    iterations: number;
  };
};

type VisualEvent = {
  label: string;
  detail: string;
  kind: "rule" | "network" | "interaction" | "result";
};

const LAST_RESULT_KEY = "prefetch-lab:last-result";

const CANDIDATES: Candidate[] = [
  {
    slug: "symfony",
    name: "Symfony",
    url: "https://symfony.com/",
    reach: "Live M1 match · prefetches /blog/",
    reachSource:
      "https://perf-labs.netlify.app/gh/speculation-rules-prefetch/examples/symfony/index.html",
    observed: "Live homepage markup · Aug 26, 2026",
    source: "list",
    eagerness: "immediate",
    m1Compatible: true,
    external: true,
    evidenceUrl:
      "https://perf-labs.netlify.app/gh/speculation-rules-prefetch/examples/symfony/index.html",
    benchmark: {
      enabledLoad: 243,
      enabledLcp: 71,
      disabledLoad: 545,
      disabledLcp: 342,
      iterations: 10,
    },
    rule: {
      prefetch: [{ urls: ["/blog/"] }],
    },
  },
  {
    slug: "field-lab-target",
    name: "Field Lab target",
    url: "#local-control",
    reach: "Known-good same-origin demo",
    reachSource: "#local-control",
    observed: "Controlled local target",
    source: "list",
    eagerness: "immediate",
    m1Compatible: true,
    external: false,
    rule: {
      prefetch: [
        {
          source: "list",
          urls: ["/target?run=<unique-id>&case=prefetch"],
          eagerness: "immediate",
        },
      ],
    },
  },
  {
    slug: "techcrunch",
    name: "TechCrunch",
    url: "https://techcrunch.com/",
    reach: "6.5M US readers / month",
    reachSource: "https://prnews.io/sites/12840-techcrunchcom.html",
    observed: "Live homepage markup · Aug 26, 2026",
    source: "document",
    eagerness: "conservative",
    m1Compatible: false,
    external: true,
    rule: {
      prefetch: [
        {
          source: "document",
          where: {
            and: [
              { href_matches: "/*" },
              { not: { selector_matches: "a[rel~=nofollow]" } },
              { not: { selector_matches: ".no-prefetch" } },
            ],
          },
          eagerness: "conservative",
        },
      ],
    },
  },
  {
    slug: "rolling-stone",
    name: "Rolling Stone",
    url: "https://www.rollingstone.com/",
    reach: "12.78M visits / month",
    reachSource:
      "https://www.semrush.com/website/rollingstone.com/overview/",
    observed: "Live homepage markup · Aug 26, 2026",
    source: "document",
    eagerness: "conservative",
    m1Compatible: false,
    external: true,
    rule: {
      prefetch: [
        {
          source: "document",
          where: {
            and: [
              { href_matches: "/*" },
              { not: { selector_matches: "a[rel~=nofollow]" } },
              { not: { selector_matches: ".no-prefetch" } },
            ],
          },
          eagerness: "conservative",
        },
      ],
    },
  },
];

function getVisualEvents(
  candidate: Candidate,
  mode: VisualMode,
): VisualEvent[] {
  if (mode === "disabled") {
    if (candidate.slug === "symfony") {
      return [
        { label: "Rule found", detail: "List rule targets /blog/", kind: "rule" },
        { label: "Feature off", detail: "Firefox ignores the rule", kind: "rule" },
        { label: "Hover Blog", detail: "No request is started", kind: "interaction" },
        { label: "Click Blog", detail: "/blog/ request starts now", kind: "network" },
        { label: "Page paints", detail: "Median LCP: 342 ms", kind: "result" },
      ];
    }

    return [
      { label: "Rule found", detail: "The page exposes a rule", kind: "rule" },
      { label: "Feature off", detail: "Firefox does not act on it", kind: "rule" },
      { label: "Link hover", detail: "No request is started", kind: "interaction" },
      { label: "Click", detail: "Navigation request begins", kind: "network" },
      { label: "Response", detail: "The page loads normally", kind: "result" },
    ];
  }

  if (!candidate.m1Compatible) {
    return [
      { label: "Rule found", detail: `${candidate.source} source detected`, kind: "rule" },
      { label: "Rule filtered", detail: `${candidate.eagerness} is outside M1`, kind: "rule" },
      { label: "Link hover", detail: "No request is started", kind: "interaction" },
      { label: "Click", detail: "Navigation request begins", kind: "network" },
      { label: "Response", detail: "The page loads normally", kind: "result" },
    ];
  }

  if (candidate.slug === "symfony") {
    return [
      { label: "Rule parsed", detail: "List defaults to immediate", kind: "rule" },
      { label: "Prefetch /blog/", detail: "Request starts before interaction", kind: "network" },
      { label: "Response cached", detail: "The navigation is warm", kind: "network" },
      { label: "Hover Blog", detail: "No new request is needed", kind: "interaction" },
      { label: "Click Blog", detail: "Median LCP: 71 ms", kind: "result" },
    ];
  }

  return [
    { label: "Rule accepted", detail: "List + immediate matches M1", kind: "rule" },
    { label: "Prefetch starts", detail: "Sec-Purpose: prefetch", kind: "network" },
    { label: "Response ready", detail: "Navigation response is warm", kind: "network" },
    { label: "Link hover", detail: "The response is already ready", kind: "interaction" },
    { label: "Click", detail: "Warm response is activated", kind: "result" },
  ];
}

export default function Home() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [deliveryTypeSupported, setDeliveryTypeSupported] = useState<
    boolean | null
  >(null);
  const [runnerState, setRunnerState] = useState<RunnerState>("idle");
  const [prefetchedUrl, setPrefetchedUrl] = useState("");
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState(CANDIDATES[0]);
  const [visualMode, setVisualMode] = useState<VisualMode | null>(null);
  const [lastVisualMode, setLastVisualMode] = useState<VisualMode>("enabled");
  const [visualStep, setVisualStep] = useState(0);
  const [completedVisualRuns, setCompletedVisualRuns] = useState({
    enabled: false,
    disabled: false,
  });
  const [showVisualComparison, setShowVisualComparison] = useState(false);
  const [log, setLog] = useState<string[]>([
    "Runner ready. Each case receives a unique URL to avoid cache contamination.",
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSupported(
        typeof HTMLScriptElement.supports === "function" &&
          HTMLScriptElement.supports("speculationrules"),
      );
      setDeliveryTypeSupported(
        "PerformanceNavigationTiming" in window &&
          "deliveryType" in PerformanceNavigationTiming.prototype,
      );

      const stored = localStorage.getItem(LAST_RESULT_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as RunResult;
          setLastResult({
            ...parsed,
            // Results from the first prototype did not include this field. Treat
            // an all-zero legacy result as unavailable instead of valid timing.
            timingAvailable:
              typeof parsed.timingAvailable === "boolean"
                ? parsed.timingAvailable
                : Boolean(
                    parsed.duration ||
                      parsed.responseStart ||
                      parsed.requestStart,
                  ),
          });
        } catch {
          localStorage.removeItem(LAST_RESULT_KEY);
        }
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const visualEvents = useMemo(
    () =>
      visualMode ? getVisualEvents(selectedCandidate, visualMode) : [],
    [selectedCandidate, visualMode],
  );

  useEffect(() => {
    if (!visualMode) return;

    const timer = window.setTimeout(
      () => {
        if (visualStep + 1 >= visualEvents.length) {
          setCompletedVisualRuns((runs) => ({ ...runs, [visualMode]: true }));
          setVisualMode(null);
          return;
        }

        setVisualStep((step) => step + 1);
      },
      visualStep === 0 ? 350 : 760,
    );

    return () => window.clearTimeout(timer);
  }, [visualEvents.length, visualMode, visualStep]);

  const rulePreview = useMemo(
    () =>
      JSON.stringify(
        {
          prefetch: [
            {
              source: "list",
              urls: ["/target?run=<unique-id>&case=prefetch"],
              eagerness: "immediate",
            },
          ],
        },
        null,
        2,
      ),
    [],
  );

  function appendLog(message: string) {
    setLog((entries) => [message, ...entries].slice(0, 6));
  }

  function selectCandidate(candidate: Candidate) {
    setSelectedCandidate(candidate);
    setVisualMode(null);
    setLastVisualMode("enabled");
    setVisualStep(0);
    setCompletedVisualRuns({ enabled: false, disabled: false });
    setShowVisualComparison(false);
  }

  function startVisualRun(mode: VisualMode) {
    setVisualMode(mode);
    setLastVisualMode(mode);
    setVisualStep(0);
    setCompletedVisualRuns((runs) => ({ ...runs, [mode]: false }));
    setShowVisualComparison(false);
  }

  function preparePrefetch() {
    const runId = crypto.randomUUID();
    const url = new URL(
      `/target?run=${runId}&case=prefetch`,
      window.location.href,
    );
    const rule = document.createElement("script");
    rule.type = "speculationrules";
    rule.textContent = JSON.stringify({
      prefetch: [
        {
          source: "list",
          urls: [url.href],
          eagerness: "immediate",
        },
      ],
    });
    document.head.appendChild(rule);
    setPrefetchedUrl(url.href);
    setRunnerState("prefetching");
    appendLog(`Injected an immediate list rule for run ${runId.slice(0, 8)}.`);

    window.setTimeout(() => {
      setRunnerState("ready");
      appendLog("Warm-up window complete. The prefetched navigation is ready.");
    }, 1500);
  }

  function navigateToPrefetchedCase() {
    if (prefetchedUrl) {
      window.location.assign(prefetchedUrl);
    }
  }

  function navigateToControl() {
    const runId = crypto.randomUUID();
    appendLog(`Opening control run ${runId.slice(0, 8)} without a rule.`);
    window.location.assign(`/target?run=${runId}&case=control`);
  }

  async function copyRule() {
    await navigator.clipboard.writeText(rulePreview);
    appendLog("Rule JSON copied to the clipboard.");
  }

  const activationObserved =
    lastResult?.timingAvailable === true &&
    lastResult.deliveryType === "navigational-prefetch";
  const serverPrefetchObserved =
    lastResult?.serverPurpose?.toLowerCase().includes("prefetch") ?? false;
  const prefetchObserved = activationObserved || serverPrefetchObserved;
  const visibleVisualMode = visualMode ?? lastVisualMode;
  const visibleVisualEvents = getVisualEvents(
    selectedCandidate,
    visibleVisualMode,
  );
  const visibleVisualStep = visualMode
    ? visualStep
    : completedVisualRuns[visibleVisualMode]
      ? visibleVisualEvents.length
      : 0;

  return (
    <main>
      <header className="site-header">
        <a
          className="brand"
          href="#top"
          aria-label="Speculation Rules Prefetch Test Harness home"
        >
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Speculation Rules Prefetch Test Harness</span>
        </a>
        <div className="header-context">Firefox Nightly · M1 field work</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Firefox Nightly · Milestone 1</p>
          <h1>Speculation Rules Prefetch Test Harness</h1>
          <p className="lede">
            Symfony prefetches its Blog page before you interact. Run the same
            navigation with Speculation Rules on and off, watch the requests,
            and compare the measured result.
          </p>
          <div className="hero-actions">
            <a className="hero-primary" href="/lab/">
              Open controlled test
            </a>
            <a
              className="hero-secondary"
              href="/downloads/speculation-rules-testbench-firefox.zip"
              download
            >
              Download DevTools extension
            </a>
            <a className="hero-secondary" href="#candidate-title">
              Review site queue ↓
            </a>
          </div>
        </div>
        <div className="signal-panel" aria-label="Browser capability checks">
          <CapabilityRow
            label="Speculation Rules"
            value={supported}
            onText="supported"
            offText="not exposed"
          />
          <CapabilityRow
            label="deliveryType"
            value={deliveryTypeSupported}
            onText="observable"
            offText="pref disabled"
          />
          <div className="signal-note">
            M1 scope: same-origin prefetch · list source · immediate eagerness ·
            Nightly on all platforms.
          </div>
        </div>
      </section>

      <section className="extension-section" aria-labelledby="extension-title">
        <div className="section-heading">
          <div>
            <p className="step-label">Live-site testbench</p>
            <h2 id="extension-title">Inspect the real browser behavior</h2>
          </div>
          <a
            className="extension-download"
            href="/downloads/speculation-rules-testbench-firefox.zip"
            download
          >
            Download extension ZIP
          </a>
        </div>
        <div className="extension-grid">
          <article>
            <span>01</span>
            <h3>Load in Nightly</h3>
            <p>
              Download and unzip the extension. Open <code>about:debugging</code>,
              choose Load Temporary Add-on, select <code>manifest.json</code>,
              then open the Speculation Rules DevTools panel.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Capture a site</h3>
            <p>
              Scan its rules, clear the dedicated profile’s HTTP cache, reload
              with capture enabled, and record the early request,
              <code> Sec-Purpose</code>, cache policy, navigation, and
              browser-exposed activation.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Run the control</h3>
            <p>
              Repeat with speculative prefetch requests blocked, compare the
              request sequence, and export both runs as JSON.
            </p>
          </article>
        </div>
        <p className="extension-note">
          The blocked control cancels requests carrying
          <code> Sec-Purpose: prefetch</code>; it does not change the global
          preference. Cache clearing is explicit and affects the whole Firefox
          HTTP cache, so use a dedicated profile.
        </p>
      </section>

      <section className="field-console" aria-labelledby="candidate-title">
        <div className="section-heading candidate-heading">
          <div>
            <p className="step-label">01 · Define the observation</p>
            <h2 id="candidate-title">Observable signals</h2>
          </div>
          <span className="run-count">1 live M1 match · 2 filtered · 1 control</span>
        </div>

        <div className="observation-guide" aria-label="Observable prefetch behaviour">
          <article>
            <span>01</span>
            <strong>Rule handling</strong>
            <p>Did Firefox find and accept the list rule?</p>
            <i>markup + DevTools</i>
          </article>
          <article>
            <span>02</span>
            <strong>Request timing</strong>
            <p>Did the target request start before hover or click?</p>
            <i>network + profile</i>
          </article>
          <article>
            <span>03</span>
            <strong>Request identity</strong>
            <p>Was it marked as a prefetch and sent only once?</p>
            <i>headers + logs</i>
          </article>
          <article>
            <span>04</span>
            <strong>Navigation reuse</strong>
            <p>Did the click reuse the warm response from cache?</p>
            <i>timing + cache</i>
          </article>
          <article>
            <span>05</span>
            <strong>Impact &amp; breakage</strong>
            <p>Was navigation faster, correct, and free of side effects?</p>
            <i>LCP + correctness</i>
          </article>
        </div>

        <div className="section-heading playback-section-heading">
          <div>
            <p className="step-label">02 · Review a recorded site</p>
            <h2>Recorded request sequence</h2>
          </div>
          <p>
            Enabled and disabled runs make the lifecycle—not only the final
            timing—easy to compare.
          </p>
        </div>

        <div className="field-console-grid">
          <nav className="site-picker" aria-label="Sites to test">
            <p className="picker-label">Choose a site</p>
            {CANDIDATES.map((candidate, index) => (
              <button
                type="button"
                className={`site-option ${
                  selectedCandidate.slug === candidate.slug ? "selected" : ""
                }`}
                key={candidate.slug}
                onClick={() => selectCandidate(candidate)}
                aria-pressed={selectedCandidate.slug === candidate.slug}
              >
                <span className="site-option-index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>{candidate.name}</strong>
                  <small>{candidate.reach}</small>
                </span>
                <i className={candidate.m1Compatible ? "ready" : "filtered"}>
                  {candidate.slug === "symfony"
                    ? "live M1"
                    : candidate.slug === "field-lab-target"
                      ? "control"
                      : "filtered"}
                </i>
              </button>
            ))}
          </nav>

          <div className="playback-stage">
            <div className="playback-heading">
              <div>
                <p className="step-label">Selected</p>
                <h3>{selectedCandidate.name}</h3>
                <p>
                  {selectedCandidate.source} rule · {selectedCandidate.eagerness}
                  {selectedCandidate.external && ` · ${selectedCandidate.observed}`}
                </p>
              </div>
              <div className="playback-links">
                {selectedCandidate.external && (
                  <a
                    href={selectedCandidate.url}
                    target="_blank"
                    rel="noreferrer"
                    className="site-link"
                  >
                    Open site ↗
                  </a>
                )}
                {selectedCandidate.evidenceUrl && (
                  <a
                    href={selectedCandidate.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="site-link evidence-link"
                  >
                    View benchmark ↗
                  </a>
                )}
              </div>
            </div>

            <div className="observed-rule">
              <div>
                <span>Rule observed on page</span>
                <strong>
                  {selectedCandidate.m1Compatible
                    ? "Accepted by Firefox M1"
                    : "Outside Firefox M1"}
                </strong>
              </div>
              <code>{JSON.stringify(selectedCandidate.rule)}</code>
            </div>

            <div className="run-controls" aria-label="Playback controls">
              <button
                type="button"
                className="run-button enabled"
                onClick={() => startVisualRun("enabled")}
                disabled={visualMode !== null}
              >
                <span aria-hidden="true">●</span>
                Run with rules enabled
                {completedVisualRuns.enabled && <i>done</i>}
              </button>
              <button
                type="button"
                className="run-button disabled"
                onClick={() => startVisualRun("disabled")}
                disabled={visualMode !== null}
              >
                <span aria-hidden="true">○</span>
                Run with rules disabled
                {completedVisualRuns.disabled && <i>done</i>}
              </button>
              <button
                type="button"
                className="compare-button"
                onClick={() => setShowVisualComparison(true)}
                disabled={
                  !completedVisualRuns.enabled || !completedVisualRuns.disabled
                }
              >
                Compare runs
              </button>
            </div>

            <div
              className={`timeline-visual ${visibleVisualMode}`}
              aria-live="polite"
              aria-label={`${visibleVisualMode} run playback`}
            >
              <div className="timeline-status">
                <span>
                  {visualMode
                    ? `Running with rules ${visualMode}`
                    : completedVisualRuns[visibleVisualMode]
                      ? `${visibleVisualMode} run complete`
                      : "Ready to run"}
                </span>
                <strong>
                  {visualMode
                    ? `${Math.min(visibleVisualStep + 1, visibleVisualEvents.length)} / ${visibleVisualEvents.length}`
                    : "browser lifecycle"}
                </strong>
              </div>

              <div className="timeline-track" aria-hidden="true">
                <span
                  className="timeline-progress"
                  style={{
                    width: `${
                      visibleVisualEvents.length > 1
                        ? (Math.min(visibleVisualStep, visibleVisualEvents.length - 1) /
                            (visibleVisualEvents.length - 1)) *
                          100
                        : 0
                    }%`,
                  }}
                />
                {visualMode && <i className="request-pulse" />}
              </div>

              <ol className="timeline-events">
                {visibleVisualEvents.map((event, index) => {
                  const state =
                    index < visibleVisualStep
                      ? "complete"
                      : index === visibleVisualStep && visualMode
                        ? "active"
                        : "waiting";
                  return (
                    <li className={`${state} ${event.kind}`} key={`${event.label}-${index}`}>
                      <span aria-hidden="true">{index + 1}</span>
                      <em>
                        {event.kind === "interaction" ? "user action" : event.kind}
                      </em>
                      <strong>{event.label}</strong>
                      <small>{event.detail}</small>
                    </li>
                  );
                })}
              </ol>
            </div>

            {showVisualComparison && (
              <div className="visual-comparison" aria-live="polite">
                <div>
                  <span>Rules enabled</span>
                  <strong>
                    {selectedCandidate.benchmark
                      ? `${selectedCandidate.benchmark.enabledLoad} ms load · ${selectedCandidate.benchmark.enabledLcp} ms LCP`
                      : selectedCandidate.m1Compatible
                        ? "Prefetch begins before interaction"
                      : "Rule is filtered; normal navigation"}
                  </strong>
                </div>
                <div>
                  <span>Rules disabled</span>
                  <strong>
                    {selectedCandidate.benchmark
                      ? `${selectedCandidate.benchmark.disabledLoad} ms load · ${selectedCandidate.benchmark.disabledLcp} ms LCP`
                      : "Request begins only after the click"}
                  </strong>
                </div>
                <p>
                  <strong>
                    {selectedCandidate.benchmark
                      ? `Recorded result (${selectedCandidate.benchmark.iterations} runs per variant):`
                      : "Expected difference:"}
                  </strong>{" "}
                  {selectedCandidate.benchmark
                    ? "prefetching cut the median Blog navigation load time by 302 ms and LCP by 271 ms."
                    : selectedCandidate.m1Compatible
                      ? "the enabled run has a warm response ready to activate."
                    : "none in Firefox M1. This site is a compatibility case, not a performance comparison yet."}
                </p>
              </div>
            )}

            <p className="playback-disclaimer">
              Symfony playback follows recorded Firefox profiles and a
              10-iteration Browsertime comparison. This page cannot toggle a
              Firefox preference for an external site; use the controlled target
              below for live headers and Navigation Timing values.
            </p>
          </div>
        </div>
      </section>

      <section className="experiment-grid" aria-labelledby="runner-title">
        <div className="runner-card">
          <div className="section-heading">
            <div>
              <p className="step-label">03 · Run it yourself</p>
              <h2 id="runner-title">Known-good controlled pair</h2>
            </div>
            <span className="run-count">2 cases</span>
          </div>

          <div className="case-list">
            <article className="case-row warm">
              <div className="case-index">A</div>
              <div className="case-copy">
                <h3>Prefetched</h3>
                <p>Inject the rule, allow 1.5 seconds, then navigate.</p>
              </div>
              <div className="case-action">
                {runnerState === "idle" && (
                  <button
                    className="primary-button"
                    onClick={preparePrefetch}
                    disabled={supported === false}
                  >
                    Prepare prefetch
                  </button>
                )}
                {runnerState === "prefetching" && (
                  <button className="primary-button" disabled>
                    Warming…
                  </button>
                )}
                {runnerState === "ready" && (
                  <button
                    className="primary-button"
                    onClick={navigateToPrefetchedCase}
                  >
                    Navigate now
                  </button>
                )}
              </div>
            </article>

            <article className="case-row control">
              <div className="case-index">B</div>
              <div className="case-copy">
                <h3>Control</h3>
                <p>Navigate to a fresh URL without adding a rule.</p>
              </div>
              <div className="case-action">
                <button className="secondary-button" onClick={navigateToControl}>
                  Run control
                </button>
              </div>
            </article>
          </div>

          <div className="runner-footnote">
            The target response is cacheable for five minutes. Query strings
            prevent one case from warming the other.
          </div>
        </div>

        <aside className="rule-card" aria-labelledby="rule-title">
          <div className="section-heading compact">
            <div>
              <p className="step-label">04 · Inspect</p>
              <h2 id="rule-title">Rule under test</h2>
            </div>
            <button className="text-button" onClick={copyRule}>
              Copy JSON
            </button>
          </div>
          <pre>
            <code>{rulePreview}</code>
          </pre>
          <div className="rule-legend">
            <span>list</span>
            <span>immediate</span>
            <span>same-origin</span>
          </div>
        </aside>
      </section>

      <section className="results-section" aria-labelledby="results-title">
        <div className="section-heading">
          <div>
            <p className="step-label">05 · Compare measurement</p>
            <h2 id="results-title">Last observed navigation</h2>
          </div>
          {lastResult && (
            <span
              className={`result-badge ${prefetchObserved ? "hit" : "miss"}`}
            >
              {!lastResult.timingAvailable
                ? "timing unavailable"
                : activationObserved
                  ? "prefetch activated"
                  : serverPrefetchObserved
                    ? "prefetch request observed"
                  : lastResult.case}
            </span>
          )}
        </div>

        {lastResult ? (
          <div className="metric-grid">
            <Metric
              label="deliveryType"
              value={
                lastResult.timingAvailable
                  ? lastResult.deliveryType || "empty"
                  : "unavailable"
              }
              featured
            />
            <Metric
              label="Sec-Purpose"
              value={lastResult.serverPurpose || "not present"}
            />
            <Metric
              label="transfer"
              value={
                lastResult.timingAvailable
                  ? `${lastResult.transferSize} B`
                  : "unavailable"
              }
            />
            <Metric
              label="request → response"
              value={
                lastResult.timingAvailable
                  ? `${Math.max(0, lastResult.responseStart - lastResult.requestStart).toFixed(1)} ms`
                  : "unavailable"
              }
            />
            <Metric
              label="duration"
              value={
                lastResult.timingAvailable
                  ? `${lastResult.duration.toFixed(1)} ms`
                  : "unavailable"
              }
            />
          </div>
        ) : (
          <div className="empty-result">
            <span className="empty-pulse" aria-hidden="true" />
            <div>
              <strong>No run recorded yet</strong>
              <p>Complete either case; the target page records the result here.</p>
            </div>
          </div>
        )}
      </section>

      <section className="activity-section" aria-labelledby="activity-title">
        <div className="activity-copy">
          <p className="step-label">Activity</p>
          <h2 id="activity-title">What the runner changed</h2>
          <p>
            This log captures the harness actions. The target also echoes the
            request headers observed server-side for an independent check.
          </p>
        </div>
        <ol className="activity-log">
          {log.map((entry, index) => (
            <li key={`${entry}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{entry}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer>
        <span>Candidate data verified Aug 26, 2026</span>
        <span>Built for Firefox networking investigation</span>
      </footer>
    </main>
  );
}

function CapabilityRow({
  label,
  value,
  onText,
  offText,
}: {
  label: string;
  value: boolean | null;
  onText: string;
  offText: string;
}) {
  return (
    <div className="capability-row">
      <span>{label}</span>
      <span className={`capability-value ${value ? "on" : ""}`}>
        <i aria-hidden="true" />
        {value === null ? "checking" : value ? onText : offText}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  featured = false,
}: {
  label: string;
  value: string;
  featured?: boolean;
}) {
  return (
    <div className={`metric ${featured ? "featured" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
