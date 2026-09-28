// src/lib/googleMapsUtils.js
// Utility for Google Maps URL validation and normalization
// Strictly validates official Google Maps links without Google Places API or scraping

const GOOGLE_DOMAIN_REGEX = /^(www\.)?google\.(com(\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2,3})$/i;
const MAPS_SUBDOMAIN_REGEX = /^maps\.google\.(com(\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2,3})$/i;

/**
 * Validates whether a URL string is a legitimate Google Maps link.
 *
 * Accepts:
 * - https://www.google.com/maps/...
 * - https://google.com/maps/...
 * - https://maps.google.com/...
 * - https://maps.google.co.id/...
 * - https://maps.app.goo.gl/...
 * - https://goo.gl/maps/...
 *
 * Rejects:
 * - arbitrary domains (e.g. facebook.com, example.com)
 * - non-maps Google URLs (e.g. google.com/search)
 * - javascript: or data: URIs
 * - malformed URLs
 */
export function isValidGoogleMapsUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;

  const trimmed = urlString.trim();
  if (!trimmed) return false;

  // Reject dangerous protocols
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return false;
  }

  try {
    const formatted = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(formatted);

    // Protocol must be http or https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // 1. Short links: maps.app.goo.gl
    if (hostname === 'maps.app.goo.gl' || hostname.endsWith('.maps.app.goo.gl')) {
      return pathname.length > 1; // Needs a slug/path
    }

    // 2. Short links: goo.gl/maps/...
    if (hostname === 'goo.gl' && pathname.startsWith('/maps')) {
      return true;
    }

    // 3. Subdomain: maps.google.<tld>
    if (MAPS_SUBDOMAIN_REGEX.test(hostname)) {
      return true;
    }

    // 4. Main domain with /maps: (www.)google.<tld>/maps...
    if (GOOGLE_DOMAIN_REGEX.test(hostname)) {
      return pathname.startsWith('/maps');
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Normalizes a Google Maps URL safely.
 * Adds https:// protocol if missing and trims whitespace.
 */
export function normalizeGoogleMapsUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return '';
  const trimmed = urlString.trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Validates an optional website URL.
 * Returns true if empty/undefined, or if it is a valid HTTP/HTTPS URL.
 * Rejects arbitrary dangerous protocols or malformed URLs.
 */
export function isValidWebsiteUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return true;
  const trimmed = urlString.trim();
  if (!trimmed) return true;

  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return false;
  }

  try {
    const formatted = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(formatted);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return parsed.hostname.includes('.') && parsed.hostname.length > 3;
  } catch {
    return false;
  }
}

/**
 * Normalizes website URL safely.
 */
export function normalizeWebsiteUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return '';
  const trimmed = urlString.trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Returns default unavailable message for Google Maps structured fields
 * (Ensures no fabricated ratings, review count, address, phone, or category)
 */
export const UNAVAILABLE_MAPS_SOURCE_TEXT = 'Tidak tersedia dari sumber yang terhubung.';
export const INSUFFICIENT_EVIDENCE_TEXT = 'Data tidak cukup untuk menarik kesimpulan.';
