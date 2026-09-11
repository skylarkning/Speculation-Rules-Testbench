const RESULT_PREFIX = "speculation-static-lab:";
const enabledButton = document.getElementById("enabled-button");
const disabledButton = document.getElementById("disabled-button");
const resetButton = document.getElementById("reset-button");
const runnerState = document.getElementById("runner-state");
const runnerNote = document.getElementById("runner-note");
const lifecycle = [...document.querySelectorAll("#lifecycle li")];

const apiSupported =
  typeof HTMLScriptElement.supports === "function" &&
  HTMLScriptElement.supports("speculationrules");
const deliverySupported =
  "PerformanceNavigationTiming" in window &&
  "deliveryType" in PerformanceNavigationTiming.prototype;

setCapability("api-status", apiSupported, apiSupported ? "Speculation Rules supported" : "Speculation Rules not exposed");
setCapability("timing-status", deliverySupported, deliverySupported ? "deliveryType observable" : "deliveryType not exposed");

let preparedUrl = "";
let warmTimer = 0;

function setCapability(id, supported, label) {
  const node = document.getElementById(id);
  node.classList.toggle("supported", supported);
  node.lastChild.textContent = label;
}

function createTargetUrl(runCase) {
  const url = new URL("./target.html", location.href);
  url.searchParams.set("run", crypto.randomUUID());
  url.searchParams.set("case", runCase);
  return url;
}

function setLifecycle(step) {
  lifecycle.forEach((item, index) => {
    item.classList.toggle("active", index === step);
    item.classList.toggle("complete", index < step);
  });
}

function prepareEnabledRun() {
  if (preparedUrl) {
    setLifecycle(3);
    location.assign(preparedUrl);
    return;
  }

  const target = createTargetUrl("prefetch");
  const rule = document.createElement("script");
  rule.type = "speculationrules";
  rule.textContent = JSON.stringify({
    prefetch: [{ source: "list", urls: [target.href], eagerness: "immediate" }]
  });
  document.head.appendChild(rule);
  preparedUrl = target.href;
  setLifecycle(0);
  runnerState.textContent = "Rule injected";
  runnerNote.textContent = "The target request should now appear in Network—before any navigation.";
  enabledButton.disabled = true;
  disabledButton.disabled = true;

  window.setTimeout(() => {
    setLifecycle(1);
    runnerState.textContent = "Prefetch dispatched";
  }, 300);

  warmTimer = window.setTimeout(() => {
    setLifecycle(2);
    runnerState.textContent = "Warm response ready";
    enabledButton.textContent = "Open the prefetched target";
    enabledButton.disabled = false;
    disabledButton.disabled = false;
    runnerNote.textContent = "Now navigate. Firefox can match this exact URL to the prefetched response.";
  }, 1600);
}

function runDisabled() {
  window.clearTimeout(warmTimer);
  runnerState.textContent = "Opening without a rule";
  runnerNote.textContent = "The control request begins only after this click.";
  location.assign(createTargetUrl("control"));
}

function readResult(runCase) {
  try {
    const value = localStorage.getItem(RESULT_PREFIX + runCase);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function showResult(runCase, result) {
  if (!result) return;
  const prefix = runCase === "prefetch" ? "enabled" : "disabled";
  document.getElementById(prefix + "-delivery").textContent = result.deliveryType || "deliveryType empty";
  document.getElementById(prefix + "-transfer").textContent = result.transferSize + " B";
  document.getElementById(prefix + "-latency").textContent = Math.max(0, result.responseStart - result.requestStart).toFixed(1) + " ms";
  document.getElementById(prefix + "-duration").textContent = Number(result.duration).toFixed(1) + " ms";
}

function updateComparison() {
  const enabled = readResult("prefetch");
  const disabled = readResult("control");
  showResult("prefetch", enabled);
  showResult("control", disabled);

  if (enabled && disabled) {
    document.getElementById("compare-status").textContent = "Both cases recorded";
    const activated = enabled.deliveryType === "navigational-prefetch";
    const enabledLatency = Math.max(0, enabled.responseStart - enabled.requestStart);
    const disabledLatency = Math.max(0, disabled.responseStart - disabled.requestStart);
    document.getElementById("interpretation").innerHTML = activated
      ? `<strong>Activation observed.</strong> Firefox reported <code>navigational-prefetch</code>. Request-to-response was ${enabledLatency.toFixed(1)} ms enabled versus ${disabledLatency.toFixed(1)} ms disabled.`
      : `<strong>Both timings are recorded, but activation is not exposed.</strong> Check Network for the early <code>Sec-Purpose: prefetch</code> request and verify that the URL matched exactly.`;
  }
}

function reset() {
  localStorage.removeItem(RESULT_PREFIX + "prefetch");
  localStorage.removeItem(RESULT_PREFIX + "control");
  location.reload();
}

enabledButton.addEventListener("click", prepareEnabledRun);
disabledButton.addEventListener("click", runDisabled);
resetButton.addEventListener("click", reset);
updateComparison();
