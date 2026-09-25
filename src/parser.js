const START_MARKERS = [
  /\u5167\u5730\u7db2\u57df/i,
  /\u5185\u5730\u7f51\u57df/i,
  /\u4e2d\u570b\u5927\u9678/i,
  /\u4e2d\u56fd\u5927\u9646/i,
  /\u5927\u9678\u5165\u53e3/i,
  /\u5927\u9646\u5165\u53e3/i,
];

const END_MARKERS = [
  /APP\s*(?:\u8edf\u4ef6|\u8f6f\u4ef6)?\s*(?:\u4e0b\u8f09|\u4e0b\u8f7d)/i,
  /\u5982\u679c\u5730\u5740\u7121\u6cd5\u6253\u958b/i,
  /\u5982\u679c\u5730\u5740\u65e0\u6cd5\u6253\u5f00/i,
];

const DOMAIN_PATTERN = /(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{1,5})?(?:\/[^\s<>"'`\uff0c\u3002\uff01\uff1f]*)?/gi;

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", "\""],
  ["apos", "'"],
  ["nbsp", " "],
]);

export function decodeHtmlEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
    const lower = body.toLowerCase();
    if (lower.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    }
    if (lower.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    }
    return NAMED_ENTITIES.get(lower) ?? entity;
  });
}

function findFirstMatch(text, patterns, fromIndex = 0) {
  let first = null;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text.slice(fromIndex));
    if (!match) continue;
    const found = {
      index: fromIndex + match.index,
      length: match[0].length,
    };
    if (!first || found.index < first.index) first = found;
  }
  return first;
}

function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]+>/g, "\n"),
  );
}

function extractMainlandSection(decodedHtml) {
  const start = findFirstMatch(decodedHtml, START_MARKERS);
  if (start) {
    const contentStart = start.index + start.length;
    const end = findFirstMatch(decodedHtml, END_MARKERS, contentStart);
    if (end) return decodedHtml.slice(contentStart, end.index);
  }

  const text = htmlToText(decodedHtml);
  const textStart = findFirstMatch(text, START_MARKERS);
  if (!textStart) {
    throw new Error("mainland section marker not found");
  }
  const contentStart = textStart.index + textStart.length;
  const textEnd = findFirstMatch(text, END_MARKERS, contentStart);
  if (!textEnd) {
    throw new Error("mainland section end marker not found");
  }
  return text.slice(contentStart, textEnd.index);
}

function isValidHostname(hostname) {
  if (hostname === "localhost" || !hostname.includes(".")) return false;
  if (!/^[a-z0-9.-]+$/i.test(hostname)) return false;
  if (hostname.includes("..")) return false;
  return hostname.split(".").every(
    (label) => label.length > 0
      && label.length <= 63
      && !label.startsWith("-")
      && !label.endsWith("-"),
  );
}

export function normalizeCandidate(candidate, hostKeywords = []) {
  const cleaned = candidate.trim().replace(/[),.;:\]]+$/g, "");
  const withScheme = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (!isValidHostname(url.hostname)) return null;
  if (url.username || url.password || url.port) return null;
  if (hostKeywords.length > 0) {
    const hostname = url.hostname.toLowerCase();
    if (!hostKeywords.some((keyword) => hostname.includes(keyword))) return null;
  }

  url.protocol = "https:";
  url.hash = "";
  return url.toString();
}

export function parseMainlandTargets(html, options = {}) {
  const hostKeywords = options.hostKeywords ?? ["comic", "jm"];
  const decodedHtml = decodeHtmlEntities(html);
  const section = extractMainlandSection(decodedHtml);
  const matches = section.match(DOMAIN_PATTERN) ?? [];
  const targets = [];

  for (const match of matches) {
    const target = normalizeCandidate(match, hostKeywords);
    if (target && !targets.includes(target)) targets.push(target);
  }

  if (targets.length === 0) {
    throw new Error("no valid mainland target found");
  }
  if (targets.length > 10) {
    throw new Error(`suspicious mainland target count: ${targets.length}`);
  }
  return targets;
}
