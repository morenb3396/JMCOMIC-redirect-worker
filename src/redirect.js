export function buildRedirectTarget(baseTarget, incomingUrl, preservePath) {
  const target = new URL(baseTarget);
  if (!preservePath) return target.toString();

  const incoming = new URL(incomingUrl);
  const basePath = target.pathname.replace(/\/$/, "");
  const incomingPath = incoming.pathname === "/" ? "" : incoming.pathname;
  target.pathname = `${basePath}${incomingPath}` || "/";
  target.search = incoming.search;
  return target.toString();
}

export function redirectResponse(location) {
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Location: location,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
