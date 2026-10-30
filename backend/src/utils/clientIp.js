const net = require('net');

// The visitor's real IP address, for rate limits and the activity log.
//
// Requests reach the API through Railway's edge (trusted via
// app.set('trust proxy', 1)), so req.ip is whoever connected to Railway.
// When the API is served through Cloudflare (api.stockdeskinventory.com),
// that is a Cloudflare server shared by thousands of visitors, and the real
// address is in CF-Connecting-IP. The header is only believed when the
// request really came from Cloudflare; anyone could send it directly to
// Railway to dodge the sign-in limits.
//
// Ranges from https://www.cloudflare.com/ips/ (unchanged for years).
const CLOUDFLARE_RANGES = [
  ['173.245.48.0', 20], ['103.21.244.0', 22], ['103.22.200.0', 22], ['103.31.4.0', 22],
  ['141.101.64.0', 18], ['108.162.192.0', 18], ['190.93.240.0', 20], ['188.114.96.0', 20],
  ['197.234.240.0', 22], ['198.41.128.0', 17], ['162.158.0.0', 15], ['104.16.0.0', 13],
  ['104.24.0.0', 14], ['172.64.0.0', 13], ['131.0.72.0', 22],
  ['2400:cb00::', 32], ['2606:4700::', 32], ['2803:f800::', 32], ['2405:b500::', 32],
  ['2405:8100::', 32], ['2a06:98c0::', 29], ['2c0f:f248::', 32],
];

const cloudflare = new net.BlockList();
for (const [address, prefix] of CLOUDFLARE_RANGES) {
  cloudflare.addSubnet(address, prefix, net.isIPv6(address) ? 'ipv6' : 'ipv4');
}

// "::ffff:1.2.3.4" (IPv4 seen over an IPv6 socket) -> "1.2.3.4".
function normalize(address) {
  const value = String(address || '').trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value);
  return mapped ? mapped[1] : value;
}

function isCloudflare(address) {
  const ip = normalize(address);
  const type = net.isIP(ip);
  if (!type) return false;
  return cloudflare.check(ip, type === 6 ? 'ipv6' : 'ipv4');
}

function clientIp(req) {
  const peer = normalize(req.ip || req.socket?.remoteAddress);
  if (isCloudflare(peer)) {
    const forwarded = normalize(req.get?.('cf-connecting-ip'));
    if (net.isIP(forwarded)) return forwarded;
  }
  return peer || 'unknown';
}

module.exports = { clientIp, isCloudflare };
