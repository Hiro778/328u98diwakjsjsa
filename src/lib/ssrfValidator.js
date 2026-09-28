/**
 * SSRF & Security Validator for BisnisSehat SEO Services
 *
 * Implements strict CIDR checking, private address filtering, cloud metadata rejection,
 * and bot challenge detection.
 */

/**
 * Check if an IPv4 address is in a private, loopback, or reserved range.
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateIPv4(ip) {
  const parts = String(ip || '').split('.').map((p) => parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false
  }

  const [a, b, c] = parts

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true

  // 10.0.0.0/8 (Private RFC1918)
  if (a === 10) return true

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true

  // 169.254.0.0/16 (Link-local / Cloud metadata)
  if (a === 169 && b === 254) return true

  // 172.16.0.0/12 (Private RFC1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true

  // 192.168.0.0/16 (Private RFC1918)
  if (a === 192 && b === 168) return true

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true

  // 240.0.0.0/4 (Reserved / Future use & broadcast 255.255.255.255)
  if (a >= 240) return true

  return false
}

/**
 * Check if an IPv6 address is in a private, loopback, or reserved range.
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateIPv6(ip) {
  const cleanIp = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '')

  // Loopback (::1) or Unspecified (::)
  if (
    cleanIp === '::1' ||
    cleanIp === '::' ||
    cleanIp === '0:0:0:0:0:0:0:1' ||
    cleanIp === '0:0:0:0:0:0:0:0'
  ) {
    return true
  }

  // IPv4-mapped IPv6 address (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (cleanIp.startsWith('::ffff:') || cleanIp.includes(':ffff:')) {
    const lastPart = cleanIp.split(':').pop() || ''
    if (lastPart.includes('.')) {
      return isPrivateIPv4(lastPart)
    }
  }

  // Link-Local (fe80::/10 -> fe80 - febf)
  if (/^fe[89ab][0-9a-f]/i.test(cleanIp)) return true

  // Unique Local Address (fc00::/7 -> fc00 - fdff)
  if (/^f[cd][0-9a-f]{2}/i.test(cleanIp)) return true

  return false
}

/**
 * Check if hostname or IP address is prohibited by SSRF security policy.
 * @param {string} hostname
 * @returns {{ restricted: boolean, reason?: string }}
 */
export function isRestrictedHost(hostname) {
  const host = String(hostname || '').toLowerCase().trim()

  if (!host) {
    return { restricted: true, reason: 'Hostname kosong.' }
  }

  // Explicit forbidden hostnames
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.test') ||
    host.endsWith('.example') ||
    host.endsWith('.invalid') ||
    host === 'metadata.google.internal' ||
    host === 'instance-data' ||
    host === 'metadata.azure.com' ||
    host === 'kong' ||
    host === 'db' ||
    host === 'auth' ||
    host === 'rest' ||
    host === 'realtime' ||
    host === 'storage'
  ) {
    return {
      restricted: true,
      reason: `Target host "${host}" dilarang oleh kebijakan keamanan internal (SSRF Protection).`
    }
  }

  // Direct IPv4 literal
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    if (isPrivateIPv4(host)) {
      return {
        restricted: true,
        reason: `Target IP "${host}" adalah jaringan privat/lokal dan dilarang.`
      }
    }
  }

  // Direct IPv6 literal
  if (host.includes(':') || (host.startsWith('[') && host.endsWith(']'))) {
    if (isPrivateIPv6(host)) {
      return {
        restricted: true,
        reason: `Target IPv6 "${host}" adalah loopback/privat dan dilarang.`
      }
    }
  }

  return { restricted: false }
}

/**
 * Detect if response HTML contains anti-bot / Cloudflare challenge page.
 * @param {string} html
 * @returns {boolean}
 */
export function isBotChallenge(html) {
  const lower = String(html || '').toLowerCase()
  return (
    lower.includes('just a moment...') ||
    lower.includes('attention required! | cloudflare') ||
    lower.includes('cf-browser-verification') ||
    lower.includes('challenge-platform') ||
    lower.includes('cf-turnstile') ||
    lower.includes('ddos protection by cloudflare') ||
    lower.includes('<title>403 forbidden</title>') ||
    lower.includes('<title>access denied</title>') ||
    lower.includes('<title>security check</title>') ||
    lower.includes('shieldsquare') ||
    lower.includes('perimeterx') ||
    lower.includes('px-captcha') ||
    lower.includes('verify you are human') ||
    lower.includes('verifikasi bahwa anda adalah manusia')
  )
}
