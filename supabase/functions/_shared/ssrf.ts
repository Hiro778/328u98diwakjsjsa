// _shared/ssrf.ts
// Comprehensive SSRF and URL validation utility.
// Blocks loopback, private RFC1918, link-local, cloud metadata, and dangerous protocols.

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private RFC1918)
  if (a === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private RFC1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 & 192.0.2.0/24
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;

  // 192.168.0.0/16 (Private RFC1918)
  if (a === 192 && b === 168) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved)
  if (a >= 240) return true;

  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const cleanIp = ip.toLowerCase().replace(/^\[|\]$/g, "");

  // Loopback (::1) or Unspecified (::)
  if (cleanIp === "::1" || cleanIp === "::" || cleanIp === "0:0:0:0:0:0:0:1" || cleanIp === "0:0:0:0:0:0:0:0") {
    return true;
  }

  // IPv4-mapped IPv6 address (::ffff:127.0.0.1)
  if (cleanIp.startsWith("::ffff:") || cleanIp.includes(":ffff:")) {
    const lastPart = cleanIp.split(":").pop() || "";
    if (lastPart.includes(".")) {
      return isPrivateIPv4(lastPart);
    }
  }

  // Link-Local (fe80::/10)
  if (/^fe[89ab][0-9a-f]/i.test(cleanIp)) return true;

  // Unique Local Address (fc00::/7)
  if (/^f[cd][0-9a-f]{2}/i.test(cleanIp)) return true;

  return false;
}

export function validateSafeUrl(urlInput: string): { safe: boolean; error?: string; parsedUrl?: URL } {
  if (!urlInput || typeof urlInput !== "string") {
    return { safe: false, error: "URL input is required" };
  }

  const trimmed = urlInput.trim();
  let parsed: URL;

  try {
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return { safe: false, error: "Invalid URL format" };
  }

  // Protocol check: Only HTTP and HTTPS
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, error: `Disallowed protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Hostname checks
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") {
    return { safe: false, error: "Access to loopback/localhost is prohibited" };
  }

  // Cloud metadata hostnames
  if (
    hostname === "metadata.google.internal" ||
    hostname === "169.254.169.254" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".arpa")
  ) {
    return { safe: false, error: "Access to internal cloud metadata and private domains is prohibited" };
  }

  // IP checks
  if (isPrivateIPv4(hostname)) {
    return { safe: false, error: `Access to private IPv4 address (${hostname}) is prohibited` };
  }

  if (isPrivateIPv6(hostname)) {
    return { safe: false, error: `Access to private IPv6 address (${hostname}) is prohibited` };
  }

  return { safe: true, parsedUrl: parsed };
}

export function isNumericOrEncodedIp(str: string): boolean {
  const clean = str.trim().toLowerCase();

  // Hex format e.g. 0x7f000001
  if (/^0x[0-9a-f]+$/i.test(clean)) {
    try {
      const num = parseInt(clean, 16);
      if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
        const ip = [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join(".");
        return isPrivateIPv4(ip);
      }
    } catch {}
  }

  // Pure integer e.g. 2130706433 (127.0.0.1)
  if (/^\d+$/.test(clean)) {
    try {
      const num = parseInt(clean, 10);
      if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
        const ip = [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join(".");
        return isPrivateIPv4(ip);
      }
    } catch {}
  }

  // Dotted notation where parts are numbers (handles octal/shortened like 127.1)
  const dotParts = clean.split(".");
  if (dotParts.length >= 2 && dotParts.length <= 4 && dotParts.every((p) => /^\d+$/.test(p))) {
    const nums = dotParts.map((p) => parseInt(p, p.startsWith("0") && p.length > 1 ? 8 : 10));
    if (nums.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
      if (nums.length === 4) {
        return isPrivateIPv4(nums.join("."));
      }
    }
  }

  return false;
}

export function validateSafeDomain(domainInput: string): { safe: boolean; code?: string; error?: string; domain?: string } {
  if (!domainInput || typeof domainInput !== "string") {
    return { safe: false, code: "INVALID_INPUT", error: "Domain target wajib disertakan." };
  }

  let clean = domainInput.trim().toLowerCase();

  // Strip scheme if user provided it
  clean = clean.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");

  // Strip credentials or port if provided
  if (clean.includes("@")) {
    return { safe: false, code: "SSRF_REJECTED", error: "Format domain tidak boleh mengandung userinfo/kredensial." };
  }

  if (clean.includes(":")) {
    const rawIp = clean.startsWith("[") && clean.endsWith("]") ? clean.slice(1, -1) : clean;
    if (isPrivateIPv6(rawIp) || isPrivateIPv6(clean)) {
      return { safe: false, code: "SSRF_REJECTED", error: `Target IPv6 "${clean}" adalah privat/loopback dan dilarang (SSRF Protection).` };
    }
    if (clean.startsWith("[") && clean.includes("]:")) {
      const closingIdx = clean.indexOf("]");
      const ip = clean.slice(1, closingIdx);
      if (isPrivateIPv6(ip)) {
        return { safe: false, code: "SSRF_REJECTED", error: `Target IPv6 "${clean}" adalah privat/loopback dan dilarang (SSRF Protection).` };
      }
      clean = ip;
    } else if (!clean.includes("::") && clean.split(":").length === 2) {
      const parts = clean.split(":");
      clean = parts[0];
    }
  }

  if (!clean) {
    return { safe: false, code: "INVALID_INPUT", error: "Format domain target tidak valid." };
  }

  if (clean.length > 253) {
    return { safe: false, code: "INVALID_INPUT", error: "Panjang domain melebihi batas maksimal (253 karakter)." };
  }

  // Control characters check
  if (/[\x00-\x1F\x7F]/.test(clean)) {
    return { safe: false, code: "INVALID_INPUT", error: "Domain mengandung karakter kontrol yang tidak valid." };
  }

  // SSRF: Explicit forbidden hostnames
  const forbiddenHosts = [
    "localhost",
    "0.0.0.0",
    "127.0.0.1",
    "::1",
    "169.254.169.254",
    "metadata.google.internal",
    "instance-data",
    "metadata.azure.com",
    "kong",
    "db",
    "auth",
    "rest",
    "realtime",
    "storage",
  ];

  if (forbiddenHosts.includes(clean)) {
    return { safe: false, code: "SSRF_REJECTED", error: `Target host "${clean}" dilarang oleh proteksi SSRF.` };
  }

  // Forbidden suffixes
  if (
    clean.endsWith(".localhost") ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal") ||
    clean.endsWith(".lan") ||
    clean.endsWith(".test") ||
    clean.endsWith(".example") ||
    clean.endsWith(".invalid") ||
    clean.endsWith(".arpa")
  ) {
    return { safe: false, code: "SSRF_REJECTED", error: `Domain internal/privat "${clean}" dilarang oleh proteksi SSRF.` };
  }

  // Direct IPv4 check
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) {
    if (isPrivateIPv4(clean)) {
      return { safe: false, code: "SSRF_REJECTED", error: `Target IP "${clean}" adalah IP privat/loopback dan dilarang (SSRF Protection).` };
    }
  }

  // Direct IPv6 check
  if (isPrivateIPv6(clean)) {
    return { safe: false, code: "SSRF_REJECTED", error: `Target IPv6 "${clean}" adalah privat/loopback dan dilarang (SSRF Protection).` };
  }

  // Integer/Hex/Encoded IP check
  if (isNumericOrEncodedIp(clean)) {
    return { safe: false, code: "SSRF_REJECTED", error: `Target IP "${clean}" adalah IP privat terenkode dan dilarang (SSRF Protection).` };
  }

  // Domain syntax validation: must have valid labels and at least one dot, TLD non-numeric
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  if (!domainRegex.test(clean)) {
    return { safe: false, code: "INVALID_INPUT", error: `Format domain "${clean}" tidak valid. Contoh yang benar: tokokopi.id` };
  }

  const parts = clean.split(".");
  const tld = parts[parts.length - 1];
  if (/^\d+$/.test(tld)) {
    return { safe: false, code: "INVALID_INPUT", error: `TLD "${tld}" tidak valid.` };
  }

  return { safe: true, domain: clean };
}

