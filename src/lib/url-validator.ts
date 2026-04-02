/* eslint-disable @typescript-eslint/no-require-imports */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  'metadata.google.internal',    // GCP metadata
  'instance-data',               // AWS metadata alias
]);

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) {
    const [a, b] = parts;
    if (a === 0) return true;            // 0.0.0.0/8
    if (a === 10) return true;           // 10.0.0.0/8
    if (a === 127) return true;          // 127.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 (link-local / cloud metadata)
  }
  // IPv6 loopback & private
  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;   // ULA
  if (ip.startsWith('fe80')) return true;                         // link-local
  return false;
}

export async function validateScanUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP/HTTPS URLs are allowed' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with credentials are not allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: 'This URL cannot be scanned' };
  }

  if (isPrivateIP(hostname)) {
    return { valid: false, error: 'This URL cannot be scanned' };
  }

  // DNS resolution — check resolved IP is not private
  try {
    const r = eval('require') as NodeRequire;
    const dns = r('dns') as typeof import('dns');
    const { address } = await dns.promises.lookup(hostname);
    if (isPrivateIP(address)) {
      return { valid: false, error: 'This URL cannot be scanned' };
    }
  } catch {
    return { valid: false, error: 'Could not resolve hostname' };
  }

  return { valid: true };
}
