const SENSITIVE_QUERY_NAME =
  /(?:^|[_-])(token|key|secret|password|passwd|auth|authorization|session|sid|jwt|code|signature|sig)(?:$|[_-])/i;

export function sanitizeUrl(value) {
  if (typeof value !== "string" || !/^https?:/i.test(value)) return value;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const name of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_NAME.test(name)) {
        url.searchParams.set(name, "[REDACTED]");
      }
    }
    return url.href;
  } catch {
    return value;
  }
}

function sanitizeValue(value, key = "") {
  if (Array.isArray(value)) {
    if (key === "scripts") {
      return value.map((script) => ({
        index: script?.index,
        src: sanitizeUrl(script?.src || ""),
        text: "[omitted from sanitized export]",
      }));
    }
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeValue(childValue, childKey),
      ]),
    );
  }
  if (
    typeof value === "string" &&
    /^(?:url|sourceUrl|targetUrl|pageUrl|documentUrl|originUrl|name)$/i.test(key)
  ) {
    return sanitizeUrl(value);
  }
  return value;
}

export function sanitizeEvidence(evidence) {
  return sanitizeValue(evidence);
}
