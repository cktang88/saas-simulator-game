// SSRF-guard helpers shared by server.js (/api/site) and the static-mode site fetcher: public http(s) hosts only.

export function isPrivateIp(ip) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) and deprecated IPv4-compatible (::a.b.c.d) addresses. The URL parser rewrites
    // [::ffff:127.0.0.1] to the hex form ::ffff:7f00:1, so convert that back to dotted IPv4 before checking.
    const m = v.match(/^::(?:ffff:)?(?:([0-9a-f]{1,4}):([0-9a-f]{1,4})|(\d+\.\d+\.\d+\.\d+))$/);
    if (m) {
      if (m[3]) return isPrivateIp(m[3]);
      const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    // ULA fc00::/7, link-local fe80::/10 (fe80-febf, not just "fe80"), deprecated site-local fec0::/10, multicast ff00::/8.
    return v === '::1' || v === '::' || /^f[cd][0-9a-f]{2}:/.test(v) || /^fe[89a-f][0-9a-f]:/.test(v) || /^ff[0-9a-f]{2}:/.test(v);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

const isIpLiteral = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');

/**
 * Static-mode validation (no DNS available in a browser): only http(s), and the host must be a public-looking name
 * or a public IP literal. Rejects localhost, single-label and internal suffixes, and private/loopback/link-local IPs.
 * → URL, or throws an Error with status 400.
 */
export function assertPublicUrlStatic(raw) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw bad('Not a valid URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw bad('Only http(s) URLs');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIpLiteral(host)) { if (isPrivateIp(host)) throw bad('Host is not a public address'); return u; }
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|localdomain)$/.test(host)) throw bad('Host is not a public address');
  return u;
}
