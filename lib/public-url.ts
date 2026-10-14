export function publicOrigin(request: Request) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL;
  const url = new URL(configured || request.url);
  if (!configured && request.headers.get("host")) url.host = request.headers.get("host")!;
  if (configured && (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)) {
    throw new Error('PUBLIC_BASE_URL must be an HTTPS origin without a path');
  }
  if (configured && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('PUBLIC_BASE_URL must be a public HTTPS address');
  }
  return url.origin;
}
export function checkinUrl(request: Request, token: string) {
  return `${publicOrigin(request)}/student?token=${encodeURIComponent(token)}`;
}
export function allowedOrigin(request: Request) {
  const header = request.headers.get('origin');
  if (!header) return true;
  try {
    const origin = new URL(header);
    if (header !== origin.origin || !['http:', 'https:'].includes(origin.protocol)) return false;
    if (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL) return origin.origin === publicOrigin(request);
    return origin.host === (request.headers.get('host') || new URL(request.url).host);
  } catch { return false; }
}
