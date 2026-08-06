"use client";

import { useEffect, useMemo, useState } from "react";

type RunResult = {
  case: "prefetch" | "control";
  runId: string;
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

const LAST_RESULT_KEY = "prefetch-lab:last-result";

export default function Home() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [deliveryTypeSupported, setDeliveryTypeSupported] = useState<
    boolean | null
  >(null);
  const [runnerState, setRunnerState] = useState<RunnerState>("idle");
  const [prefetchedUrl, setPrefetchedUrl] = useState("");
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [log, setLog] = useState<string[]>([
    "Runner ready. Each case receives a unique URL to avoid cache contamination.",
  ]);

  useEffect(() => {
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
        setLastResult(JSON.parse(stored) as RunResult);
      } catch {
        localStorage.removeItem(LAST_RESULT_KEY);
      }
    }
  }, []);

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
    lastResult?.deliveryType === "navigational-prefetch";

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Prefetch Lab home">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>Prefetch Lab</span>
        </a>
        <div className="header-context">Firefox · Speculation Rules M1</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Repeatable browser experiment</p>
          <h1>See what a prefetched navigation actually did.</h1>
          <p className="lede">
            Run a warm navigation and a clean control with cache-isolated URLs,
            then compare the browser’s own Navigation Timing signal.
          </p>
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
            Current Firefox scope: same-origin, list source, immediate eagerness.
          </div>
        </div>
      </section>

      <section className="experiment-grid" aria-labelledby="runner-title">
        <div className="runner-card">
          <div className="section-heading">
            <div>
              <p className="step-label">01 · Run</p>
              <h2 id="runner-title">A controlled pair</h2>
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
              <p className="step-label">02 · Inspect</p>
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
            <p className="step-label">03 · Compare</p>
            <h2 id="results-title">Last observed navigation</h2>
          </div>
          {lastResult && (
            <span className={`result-badge ${activationObserved ? "hit" : "miss"}`}>
              {activationObserved ? "prefetch activated" : lastResult.case}
            </span>
          )}
        </div>

        {lastResult ? (
          <div className="metric-grid">
            <Metric
              label="deliveryType"
              value={lastResult.deliveryType || "empty"}
              featured
            />
            <Metric label="transfer" value={`${lastResult.transferSize} B`} />
            <Metric
              label="request → response"
              value={`${Math.max(0, lastResult.responseStart - lastResult.requestStart).toFixed(1)} ms`}
            />
            <Metric label="duration" value={`${lastResult.duration.toFixed(1)} ms`} />
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
            This log captures the harness actions. Network-header confirmation
            remains a separate server-side check.
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
        <span>Local prototype · no data leaves this browser</span>
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
