import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * Checks that a URL the model chose points at the public internet before the
 * server fetches it (server-side request forgery). Hostnames are resolved and
 * every address checked. Not covered: a DNS answer that changes between this
 * check and the fetch (DNS rebinding).
 */

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network": 0.0.0.0 reaches the local machine
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT (includes Alibaba Cloud metadata, 100.100.100.200)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments (includes Oracle Cloud metadata, 192.0.0.192)
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and broadcast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64: an IPv4 address in disguise
  ['fc00::', 7], // unique local, including AWS metadata (fd00:ec2::254)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/** Hostnames refused before any lookup: they name this machine or a metadata service. */
const BLOCKED_HOSTNAMES = /^(localhost|.*\.localhost|metadata|metadata\.google\.internal)$/i;

export class NonPublicUrlError extends Error {
  constructor(url: string, reason: string) {
    super(`Refused ${url}: ${reason}`);
    this.name = 'NonPublicUrlError';
  }
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 6) {
    // IPv4-mapped (::ffff:127.0.0.1) is checked as the IPv4 address it carries
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (mapped) return blocked.check(mapped, 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return blocked.check(address, 'ipv4');
}

/** Throws NonPublicUrlError unless `url` is http(s) and every address it resolves to is public. */
export async function assertPublicUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NonPublicUrlError(url, 'not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new NonPublicUrlError(url, `${parsed.protocol} is not http or https`);
  }

  const host = parsed.hostname.replace(/^\[(.*)\]$/, '$1');
  if (BLOCKED_HOSTNAMES.test(host)) throw new NonPublicUrlError(url, `${host} is not public`);

  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new NonPublicUrlError(url, `${host} did not resolve`);
  const internal = addresses.find(isBlockedAddress);
  if (internal)
    throw new NonPublicUrlError(url, `${host} resolves to ${internal}, which is not public`);
}
