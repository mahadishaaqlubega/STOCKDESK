const dns = require('dns').promises;
const net = require('net');

// Downloads a shop's logo from an https link for its PDFs. The link is typed
// in by a shop admin, so the server must not be tricked into calling
// addresses on its own network (Railway's private services, localhost),
// hanging on a slow server, or loading a huge file into memory.

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

const privateRanges = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) {
  privateRanges.addSubnet(address, prefix, 'ipv4');
}
// IPv4-mapped IPv6 (::ffff:a.b.c.d) is unwrapped and checked as IPv4 below;
// a ::ffff:0:0/96 rule here would match every IPv4 address.
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  privateRanges.addSubnet(address, prefix, 'ipv6');
}

function isPublicAddress(raw) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(String(raw));
  const address = mapped ? mapped[1] : String(raw);
  const type = net.isIP(address);
  if (!type) return false;
  return !privateRanges.check(address, type === 6 ? 'ipv6' : 'ipv4');
}

async function isPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return isPublicAddress(host);
  if (/\.(internal|local|localhost)$/i.test(host) || host.toLowerCase() === 'localhost') return false;
  try {
    const addresses = await dns.lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((entry) => isPublicAddress(entry.address));
  } catch {
    return false;
  }
}

async function readLimited(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Returns the image bytes, or null for anything unsafe or unreachable.
async function fetchRemoteImage(rawUrl) {
  let url = String(rawUrl || '');
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    if (!(await isPublicHost(parsed.hostname))) return null;

    let response;
    try {
      response = await fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      url = new URL(location, parsed).toString();
      continue;
    }
    if (!response.ok) return null;
    try {
      return await readLimited(response);
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = { fetchRemoteImage, isPublicAddress, isPublicHost };
