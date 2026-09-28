/**
 * SEO Analyzer Core Engine (Revision: Evidence-Based Audit)
 *
 * Deterministic, evidence-based SEO auditing tool for websites and landing pages.
 * Supports:
 * - Deterministic page-type detection (PRODUCT, ARTICLE, BLOG, CATEGORY, SERVICE, LOCAL_BUSINESS, HOMEPAGE, OTHER)
 * - JSON-LD Schema.org detection & validation
 * - Open Graph & Twitter card social metadata evaluation
 * - Natural keyword relevance (multi-signal, no rigid density target)
 * - Heading hierarchy inspection (H1-H3, skip detection, empty/duplicate detection)
 * - Image audit (alt text quality, generic alt detection, dimensions, lazy loading, modern format)
 * - Link audit (internal vs external, generic anchor detection, placeholder detection)
 * - Unknown != Pass contract with audit confidence (HIGH, MEDIUM, LOW)
 * - Calibrated conservative scoring (0-100) with detailed score explanation
 */

/**
 * Clean and normalize text
 */
function cleanText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim()
}

/**
 * Validate HTML content and HTTP status for auditability
 */
export function validateHtmlForAudit(html = '', httpStatus = 200) {
  if (httpStatus && (httpStatus < 200 || httpStatus >= 400)) {
    return {
      valid: false,
      reason: 'http_error',
      message: `Server merespons dengan status HTTP ${httpStatus}. Halaman tidak dapat diaudit.`
    }
  }

  const str = String(html || '').trim()
  if (!str || str.length < 100) {
    return {
      valid: false,
      reason: 'partial_fetch',
      message: 'Konten HTML halaman kosong atau terlalu sedikit / terpotong (kurang dari 100 karakter). Pastikan URL dapat diakses penuh atau tempelkan source code HTML lengkap.'
    }
  }

  // Detect anti-bot, captcha, or interstitial challenge
  const lower = str.toLowerCase()
  const isChallenge =
    lower.includes('just a moment...') ||
    lower.includes('attention required! | cloudflare') ||
    lower.includes('cf-browser-verification') ||
    lower.includes('challenge-platform') ||
    lower.includes('cf-turnstile') ||
    lower.includes('ddos protection by cloudflare') ||
    lower.includes('<title>403 forbidden</title>') ||
    lower.includes('<title>404 not found</title>') ||
    lower.includes('<title>access denied</title>') ||
    lower.includes('<title>security check</title>')

  if (isChallenge) {
    return {
      valid: false,
      reason: 'challenge_interstitial',
      message: 'Halaman memuat proteksi bot / challenge interstitial (misalnya Cloudflare atau halaman error), bukan konten asli website. Halaman tidak dapat diaudit secara otomatis.'
    }
  }

  // Detect JS-only client-side stub / SPA without pre-rendered content
  const bodyMatch = str.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    const strippedBody = bodyMatch[1]
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .trim()
    const isSpaMount = /id=["'](?:root|app|__next|application)["']/i.test(bodyMatch[1])
    if (isSpaMount && strippedBody.length < 25) {
      return {
        valid: false,
        reason: 'js_only_stub',
        message: 'Halaman terdeteksi sebagai Single Page Application (SPA) / client-side stub tanpa konten HTML awal yang ter-render. Konten utama memerlukan eksekusi JavaScript di browser sehingga audit statis tidak dapat mengevaluasi SEO halaman asli.'
      }
    }
  }

  return { valid: true }
}

/**
 * Parse JSON-LD structured data from HTML
 */
export function extractJsonLd(html = '') {
  const result = {
    detected: false,
    types: [],
    schemas: [],
    isValid: true,
    error: null,
  }

  if (!html || typeof html !== 'string') return result

  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRegex.exec(html)) !== null) {
    const rawContent = match[1].trim()
    if (!rawContent) continue

    result.detected = true
    try {
      const cleanJson = rawContent
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
      const parsed = JSON.parse(cleanJson)

      const items = Array.isArray(parsed)
        ? parsed
        : parsed['@graph'] && Array.isArray(parsed['@graph'])
        ? parsed['@graph']
        : [parsed]

      for (const item of items) {
        if (item && typeof item === 'object') {
          result.schemas.push(item)
          if (item['@type']) {
            const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']]
            types.forEach(t => {
              if (typeof t === 'string' && !result.types.includes(t)) {
                result.types.push(t)
              }
            })
          }
        }
      }
    } catch {
      result.isValid = false
      result.error = 'Sintaks JSON-LD tidak valid (parse error).'
    }
  }

  return result
}

/**
 * Deterministic Page Type Detector
 */
export function detectPageType(url = '', html = '', metadata = {}, jsonLd = {}) {
  let type = 'OTHER'
  let label = 'Halaman Web Umum'
  let confidence = 'LOW'

  const parsedUrl = url ? new URL(url.startsWith('http') ? url : `https://${url}`, 'https://example.com') : null
  const pathname = parsedUrl ? parsedUrl.pathname.toLowerCase() : ''
  const isHomepage = pathname === '/' || pathname === ''

  if (isHomepage) {
    return { type: 'HOMEPAGE', label: 'Halaman Beranda (Homepage)', confidence: 'HIGH' }
  }

  const types = jsonLd?.types || []
  if (types.includes('Product')) {
    return { type: 'PRODUCT', label: 'Halaman Produk', confidence: 'HIGH' }
  }
  if (types.includes('Article') || types.includes('NewsArticle') || types.includes('TechArticle')) {
    return { type: 'ARTICLE', label: 'Halaman Artikel', confidence: 'HIGH' }
  }
  if (types.includes('BlogPosting')) {
    return { type: 'BLOG', label: 'Artikel Blog', confidence: 'HIGH' }
  }
  if (types.includes('CollectionPage') || types.includes('ItemList')) {
    return { type: 'CATEGORY', label: 'Kategori / Katalog', confidence: 'HIGH' }
  }
  if (types.includes('LocalBusiness') || types.includes('Restaurant') || types.includes('Store')) {
    return { type: 'LOCAL_BUSINESS', label: 'Bisnis Lokal / Cabang', confidence: 'HIGH' }
  }
  if (types.includes('Service')) {
    return { type: 'SERVICE', label: 'Halaman Layanan / Jasa', confidence: 'HIGH' }
  }

  // URL pattern checks
  const segments = pathname.split('/').filter(Boolean)
  const firstSegment = segments[0] || ''

  if (/^(kategori|category|katalog|catalog|collection|collections)$/i.test(firstSegment)) {
    return { type: 'CATEGORY', label: 'Kategori / Katalog', confidence: 'HIGH' }
  }
  if (/^(produk|product|p|item|barang)$/i.test(firstSegment) || /^jual-/i.test(firstSegment)) {
    return { type: 'PRODUCT', label: 'Halaman Produk', confidence: 'HIGH' }
  }
  if (/^(artikel|article|post|news|berita|baca)$/i.test(firstSegment)) {
    return { type: 'ARTICLE', label: 'Halaman Artikel', confidence: 'HIGH' }
  }
  if (/^(blog|insights|opini)$/i.test(firstSegment)) {
    return { type: 'BLOG', label: 'Artikel Blog', confidence: 'HIGH' }
  }
  if (/^(layanan|service|services|paket|pricing|biaya|paket-harga)$/i.test(firstSegment)) {
    return { type: 'SERVICE', label: 'Halaman Layanan / Jasa', confidence: 'HIGH' }
  }
  if (/^(lokasi|cabang|kontak|resto|cafe|warung|store-locator)$/i.test(firstSegment)) {
    return { type: 'LOCAL_BUSINESS', label: 'Bisnis Lokal / Cabang', confidence: 'HIGH' }
  }

  // HTML content clues
  const lowerHtml = (html || '').toLowerCase()
  const hasPrice = /rp\.?\s*[\d.]+|idr\s*[\d.]+|harga\s*:/i.test(lowerHtml)
  const hasCartAction = /(beli sekarang|tambah ke keranjang|add to cart|checkout|pesan sekarang|order)/i.test(lowerHtml)

  if (hasPrice && hasCartAction) {
    return { type: 'PRODUCT', label: 'Halaman Produk', confidence: 'MEDIUM' }
  }

  if (lowerHtml.includes('<article') || (metadata.h1s && metadata.h1s.length > 0 && metadata.wordCount > 350)) {
    return { type: 'ARTICLE', label: 'Halaman Artikel', confidence: 'MEDIUM' }
  }

  return { type, label, confidence }
}

/**
 * Parse HTML string into DOM structure and extract SEO signals
 */
export function extractHtmlMetadata(html = '', currentUrl = '') {
  const result = {
    title: '',
    metaDescription: '',
    canonical: '',
    viewport: '',
    robots: '',
    charset: '',
    lang: '',
    openGraph: {
      title: '',
      description: '',
      image: '',
      type: '',
      url: ''
    },
    twitterCard: {
      card: '',
      title: '',
      description: '',
      image: ''
    },
    h1s: [],
    h2s: [],
    h3s: [],
    headingSequence: [], // [{ level: 1, text: '...' }]
    headingHierarchyIssues: [],
    images: [],
    links: [],
    bodyText: '',
    mainContentText: '',
    wordCount: 0,
    mainWordCount: 0,
    paragraphsCount: 0,
    listsCount: 0,
    jsonLd: {
      detected: false,
      types: [],
      schemas: [],
      isValid: true,
      error: null
    }
  }

  if (!html || typeof html !== 'string') return result

  // Extract JSON-LD first
  result.jsonLd = extractJsonLd(html)

  // Strip comments, scripts, styles, and templates
  const cleanHtml = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<template\b[^<]*(?:(?!<\/template>)<[^<]*)*<\/template>/gi, ' ')

  // Extract lang attribute from <html lang="...">
  const htmlTagMatch = cleanHtml.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)
  if (htmlTagMatch) {
    result.lang = cleanText(htmlTagMatch[1].toLowerCase())
  }

  // Title
  const titleMatch = cleanHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) {
    result.title = cleanText(titleMatch[1].replace(/<[^>]+>/g, ''))
  }

  // Meta tags
  const metaRegex = /<meta\s+([^>]+)>/gi
  let metaMatch
  while ((metaMatch = metaRegex.exec(cleanHtml)) !== null) {
    const attrs = metaMatch[1]
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i) || attrs.match(/property=["']([^"']+)["']/i)
    const contentMatch = attrs.match(/content=["']([^"']*)["']/i)
    const charsetMatch = attrs.match(/charset=["']([^"']+)["']/i)

    if (charsetMatch) {
      result.charset = charsetMatch[1].toLowerCase()
    }

    if (nameMatch && contentMatch) {
      const name = nameMatch[1].toLowerCase()
      const content = cleanText(contentMatch[1])
      if (name === 'description') result.metaDescription = content
      if (name === 'viewport') result.viewport = content
      if (name === 'robots') result.robots = content

      // Open Graph
      if (name === 'og:title') result.openGraph.title = content
      if (name === 'og:description') result.openGraph.description = content
      if (name === 'og:image') result.openGraph.image = content
      if (name === 'og:type') result.openGraph.type = content
      if (name === 'og:url') result.openGraph.url = content

      // Twitter Card
      if (name === 'twitter:card') result.twitterCard.card = content
      if (name === 'twitter:title') result.twitterCard.title = content
      if (name === 'twitter:description') result.twitterCard.description = content
      if (name === 'twitter:image') result.twitterCard.image = content
    }
  }

  // Canonical link
  const canonicalMatch = cleanHtml.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i) ||
                         cleanHtml.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i)
  if (canonicalMatch) {
    result.canonical = cleanText(canonicalMatch[1])
  }

  // Headings with hierarchical sequence tracking
  const headingRegex = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi
  let hMatch
  let lastHeadingLevel = 0

  while ((hMatch = headingRegex.exec(cleanHtml)) !== null) {
    const tag = hMatch[1].toLowerCase()
    const level = parseInt(tag.replace('h', ''), 10)
    const rawText = hMatch[2].replace(/<[^>]+>/g, '')
    const text = cleanText(rawText)

    result.headingSequence.push({ level, text, raw: hMatch[0] })

    if (level === 1 && text) result.h1s.push(text)
    if (level === 2 && text) result.h2s.push(text)
    if (level === 3 && text) result.h3s.push(text)

    // Check skipped heading hierarchy (e.g. H1 followed directly by H3 without H2)
    if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
      result.headingHierarchyIssues.push({
        type: 'skipped_level',
        from: lastHeadingLevel,
        to: level,
        text
      })
    }
    lastHeadingLevel = level
  }

  // Check duplicate / empty headings
  const seenHeadings = new Set()
  for (const h of result.headingSequence) {
    if (!h.text) {
      result.headingHierarchyIssues.push({ type: 'empty_heading', level: h.level })
    } else {
      const lower = h.text.toLowerCase()
      if (seenHeadings.has(lower) && h.level <= 2) {
        result.headingHierarchyIssues.push({ type: 'duplicate_heading', level: h.level, text: h.text })
      }
      seenHeadings.add(lower)
    }
  }

  // Images analysis
  const imgRegex = /<img\b\s+([^>]+)>/gi
  let imgMatch
  const genericAltTerms = ['image', 'gambar', 'foto', 'img', 'photo', 'untitled', 'banner', 'logo', 'icon']

  while ((imgMatch = imgRegex.exec(cleanHtml)) !== null) {
    const attrs = imgMatch[1]
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i)
    const altMatch = attrs.match(/alt=["']([^"']*)["']/i)
    const widthMatch = attrs.match(/width=["']([^"']*)["']/i)
    const heightMatch = attrs.match(/height=["']([^"']*)["']/i)
    const loadingMatch = attrs.match(/loading=["']([^"']*)["']/i)

    const src = srcMatch ? srcMatch[1] : ''
    const alt = altMatch ? altMatch[1] : null
    const hasAlt = alt !== null && cleanText(alt).length > 0
    const altClean = hasAlt ? cleanText(alt).toLowerCase() : ''

    const isGenericAlt = hasAlt && (
      genericAltTerms.includes(altClean) ||
      /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(altClean) ||
      /^img[_-]?\d+/i.test(altClean) ||
      /^dsc[_-]?\d+/i.test(altClean)
    )

    const isModernFormat = /\.(webp|avif|svg)(\?.*)?$/i.test(src)
    const hasDimensions = Boolean(widthMatch && heightMatch)
    const isLazy = loadingMatch ? loadingMatch[1].toLowerCase() === 'lazy' : false

    result.images.push({
      src,
      alt,
      hasAlt,
      isGenericAlt,
      isModernFormat,
      hasDimensions,
      isLazy,
    })
  }

  // Links analysis
  const linkRegex = /<a\b\s+([^>]+)>([\s\S]*?)<\/a>/gi
  let aMatch
  const genericAnchorTerms = ['klik di sini', 'click here', 'baca selengkapnya', 'selengkapnya', 'disini', 'link', 'web', 'url', 'read more', 'lihat', 'detail']

  const host = currentUrl ? (() => {
    try { return new URL(currentUrl.startsWith('http') ? currentUrl : `https://${currentUrl}`).hostname } catch { return '' }
  })() : ''

  while ((aMatch = linkRegex.exec(cleanHtml)) !== null) {
    const attrs = aMatch[1]
    const rawText = aMatch[2].replace(/<[^>]+>/g, '')
    const text = cleanText(rawText)
    const hrefMatch = attrs.match(/href=["']([^"']*)["']/i)
    const relMatch = attrs.match(/rel=["']([^"']*)["']/i)
    const href = hrefMatch ? cleanText(hrefMatch[1]) : ''
    const rel = relMatch ? cleanText(relMatch[1].toLowerCase()) : ''

    const isPlaceholder = !href || href === '#' || href === 'javascript:void(0)'
    let isInternal = true
    let isExternal = false

    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        const linkHost = new URL(href).hostname
        if (host && linkHost && linkHost !== host) {
          isInternal = false
          isExternal = true
        }
      } catch {
        // keep internal fallback
      }
    }

    const isGenericAnchor = text ? genericAnchorTerms.includes(text.toLowerCase()) : false
    const isEmptyAnchor = !text || text.length === 0

    result.links.push({
      href,
      text,
      isInternal,
      isExternal,
      isPlaceholder,
      isGenericAnchor,
      isEmptyAnchor,
      rel
    })
  }

  // Count paragraphs and lists
  result.paragraphsCount = (cleanHtml.match(/<p\b[^>]*>/gi) || []).length
  result.listsCount = (cleanHtml.match(/<li\b[^>]*>/gi) || []).length

  // Main content extraction (exclude header, nav, footer, aside)
  const contentOnlyHtml = cleanHtml
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')

  const mainStripped = contentOnlyHtml.replace(/<[^>]+>/g, ' ')
  result.mainContentText = cleanText(mainStripped)
  const mainWords = result.mainContentText.match(/[\p{L}\p{N}]+/gu) || []
  result.mainWordCount = mainWords.length

  // Total stripped body text
  const stripped = cleanHtml.replace(/<[^>]+>/g, ' ')
  result.bodyText = cleanText(stripped)
  const words = result.bodyText.match(/[\p{L}\p{N}]+/gu) || []
  result.wordCount = words.length

  return result
}

/**
 * Validate URL structure and technical formatting
 */
export function validateUrl(rawUrl = '') {
  const trimmed = String(rawUrl || '').trim()
  if (!trimmed) {
    return { valid: false, error: 'URL tidak boleh kosong.' }
  }

  let parsed
  try {
    const toParse = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    parsed = new URL(toParse)
  } catch {
    return { valid: false, error: 'Format URL tidak valid. Pastikan alamat web benar (contoh: https://tokosaya.com).' }
  }

  const isHttps = parsed.protocol === 'https:'
  const pathname = parsed.pathname
  const hasUnderscore = pathname.includes('_')
  const hasUppercase = /[A-Z]/.test(pathname)
  const isTooLong = trimmed.length > 80

  return {
    valid: true,
    normalizedUrl: parsed.href,
    origin: parsed.origin,
    hostname: parsed.hostname,
    pathname: parsed.pathname,
    isHttps,
    hasUnderscore,
    hasUppercase,
    isTooLong,
    urlLength: trimmed.length
  }
}

/**
 * Extract root domain from hostname (handles subdomains and common multi-part TLDs)
 */
export function getRootDomain(hostname = '') {
  if (!hostname || typeof hostname !== 'string') return ''
  const cleanHost = hostname.trim().toLowerCase().replace(/:\d+$/, '')
  const parts = cleanHost.split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')

  // Common second-level domain extensions
  const slds = ['co.id', 'web.id', 'or.id', 'ac.id', 'go.id', 'my.id', 'biz.id', 'co.uk', 'com.au', 'com.sg', 'co.jp']
  const lastTwo = parts.slice(-2).join('.')
  if (slds.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

/**
 * Validate source identity consistency between requested URL and document metadata
 */
export function validateAuditSourceIdentity({ requestedUrl = '', finalUrl = '', canonicalUrl = '', targetKeyword = '', metadata = {} }) {
  const result = {
    hasMismatch: false,
    reason: null,
    requestedHost: '',
    canonicalHost: '',
    confidenceImpact: 'NONE'
  }

  const effective = finalUrl || requestedUrl
  if (!effective) return result

  try {
    const effHost = new URL(effective.startsWith('http') ? effective : `https://${effective}`).hostname.toLowerCase()
    result.requestedHost = effHost

    if (canonicalUrl) {
      const canHost = new URL(canonicalUrl.startsWith('http') ? canonicalUrl : `https://${canonicalUrl}`).hostname.toLowerCase()
      result.canonicalHost = canHost

      const effRoot = getRootDomain(effHost)
      const canRoot = getRootDomain(canHost)

      // If root domains differ significantly (e.g. tokokopinusantara.id vs ngodingpakeai.com)
      if (effRoot && canRoot && effRoot !== canRoot) {
        // Legitimate cross-domain canonical syndication retains the same resource path/slug
        // Source mismatch occurs when paths and domains are entirely disjoint (e.g. homepage vs product page of another site)
        const effPath = new URL(effective.startsWith('http') ? effective : `https://${effective}`).pathname.replace(/\/$/, '')
        const canPath = new URL(canonicalUrl.startsWith('http') ? canonicalUrl : `https://${canonicalUrl}`).pathname.replace(/\/$/, '')
        const isSyndicatedPathMatch = effPath && canPath && effPath === canPath

        if (!isSyndicatedPathMatch) {
          result.hasMismatch = true
          result.confidenceImpact = 'HIGH'
          result.reason = `Ketidakcocokan sumber konten: URL yang diminta mengarah ke domain "${effHost}", namun tag canonical dokumen mengarah ke domain berbeda ("${canHost}"). Konten HTML terindikasi berasal dari halaman atau audit lain.`
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  return result
}

/**
 * Calculate keyword frequency and distribution in text
 * Evaluates naturalness rather than enforcing a rigid numeric density target.
 */
export function calculateKeywordRelevance(text = '', keyword = '') {
  if (!keyword || !text) {
    return { count: 0, density: 0, present: false, totalWords: 0 }
  }

  const cleanKeyword = keyword.trim().toLowerCase()
  if (!cleanKeyword) {
    return { count: 0, density: 0, present: false, totalWords: 0 }
  }

  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []
  const totalWords = words.length
  if (totalWords === 0) {
    return { count: 0, density: 0, present: false, totalWords: 0 }
  }

  const keywordRegex = new RegExp(`\\b${cleanKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
  const matches = text.match(keywordRegex) || []
  const count = matches.length
  const density = Number(((count / totalWords) * 100).toFixed(2))

  return {
    count,
    density,
    present: count > 0,
    totalWords
  }
}

/**
 * Main SEO Audit Runner
 *
 * Evidence-based, conservative scoring engine without unsubstantiated absolute claims.
 */
export function runSeoAudit({ url = '', html = '', content = '', targetKeyword = '', httpStatus = 200, finalUrl = '', auditId = null } = {}) {
  const effectiveUrl = finalUrl || url
  const urlCheck = validateUrl(effectiveUrl)
  if (!urlCheck.valid) {
    throw new Error(urlCheck.error)
  }

  const rawHtml = html || content || ''
  const htmlCheck = validateHtmlForAudit(rawHtml, httpStatus)
  if (!htmlCheck.valid) {
    throw new Error(htmlCheck.message)
  }

  const kw = cleanText(targetKeyword).toLowerCase()
  const metadata = extractHtmlMetadata(rawHtml, urlCheck.normalizedUrl)

  // Validate Source Identity consistency (Prevent cross-URL data contamination)
  const identityCheck = validateAuditSourceIdentity({
    requestedUrl: url,
    finalUrl: effectiveUrl,
    canonicalUrl: metadata.canonical,
    targetKeyword: kw,
    metadata
  })

  // If raw content was provided without HTML body
  if (!metadata.bodyText && content) {
    metadata.bodyText = cleanText(content)
    metadata.mainContentText = cleanText(content)
    const words = metadata.bodyText.match(/[\p{L}\p{N}]+/gu) || []
    metadata.wordCount = words.length
    metadata.mainWordCount = words.length
  }

  // Detect Page Type
  const pageTypeInfo = detectPageType(effectiveUrl, rawHtml, metadata, metadata.jsonLd)

  // Confidence estimation
  let confidence = 'HIGH'
  if (identityCheck.hasMismatch) {
    confidence = 'LOW'
  } else if (metadata.mainWordCount < 60 || !metadata.title || metadata.h1s.length === 0) {
    confidence = metadata.mainWordCount < 30 ? 'LOW' : 'MEDIUM'
  }

  const issues = []
  const passed = []
  const unverified = []

  // Add source identity mismatch issue if detected
  if (identityCheck.hasMismatch) {
    issues.push({
      id: 'source_domain_mismatch',
      category: 'technical',
      severity: 'critical',
      title: 'Ketidakcocokan Sumber Dokumen (Source Identity Mismatch)',
      message: identityCheck.reason,
      recommendation: `Pastikan dokumen HTML yang diaudit benar-benar bersumber dari "${urlCheck.hostname}". Jika baru saja mengganti URL, bersihkan input HTML lama untuk menghindari data tercampur.`
    })
  }

  // 4 Balanced Categories (Max 25 each, Total 100)
  let scoreMeta = 25
  let scoreContent = 25
  let scoreTechnical = 25
  let scoreMedia = 25

  // ── 1. META & SOCIAL METADATA (Max 25) ──────────────────────────────────────
  const title = metadata.title
  if (!title) {
    scoreMeta -= 10
    issues.push({
      id: 'title_missing',
      category: 'meta',
      severity: 'critical',
      title: 'Tag Title Hilang',
      message: 'Halaman ini tidak memiliki tag <title>. Mesin pencari memerlukan judul untuk menampilkan cuplikan di hasil pencarian.',
      recommendation: 'Tambahkan tag <title> deskriptif yang memuat nama produk atau identitas bisnis Anda.'
    })
  } else if (title.length < 25) {
    scoreMeta -= 4
    issues.push({
      id: 'title_short',
      category: 'meta',
      severity: 'warning',
      title: `Judul Relatif Pendek (${title.length} karakter)`,
      message: `Judul "${title}" relatif singkat. Teks yang terlalu ringkas mungkin melewatkan konteks penting bagi calon pengunjung di hasil pencarian.`,
      recommendation: 'Pertimbangkan menambahkan kata kunci pendukung atau nama brand (kisaran 50–60 karakter sebagai panduan tampilan cuplikan).'
    })
  } else if (title.length > 65) {
    scoreMeta -= 3
    issues.push({
      id: 'title_long',
      category: 'meta',
      severity: 'warning',
      title: `Judul Berpotensi Terpotong (${title.length} karakter)`,
      message: `Panjang judul melebihi 65 karakter dan berisiko terpotong dengan tanda elipsis (...) di layar peramban.`,
      recommendation: 'Pertimbangkan menempatkan kata kunci utama di depan dan mempersingkat judul agar inti informasi tetap terbaca jelas.'
    })
  } else {
    passed.push({
      id: 'title_optimal',
      category: 'meta',
      title: `Tag Title Terpasang Sesuai Panduan (${title.length} karakter)`,
      message: `Judul "${title}" berada dalam kisaran panjang yang memadai untuk keterbacaan di hasil pencarian.`
    })
  }

  if (kw && title) {
    if (title.toLowerCase().includes(kw)) {
      passed.push({
        id: 'title_kw_present',
        category: 'meta',
        title: 'Kata Kunci Ada di Judul',
        message: `Kata kunci sasaran "${kw}" berhasil ditemukan di dalam tag title.`
      })
    } else {
      scoreMeta -= 3
      issues.push({
        id: 'title_kw_missing',
        category: 'meta',
        severity: 'warning',
        title: 'Kata Kunci Tidak Ada di Judul',
        message: `Tag title belum memuat kata kunci sasaran "${kw}".`,
        recommendation: `Sisipkan kata kunci "${kw}" secara natural di tag title.`
      })
    }
  }

  // Meta Description
  const desc = metadata.metaDescription
  if (!desc) {
    scoreMeta -= 6
    issues.push({
      id: 'desc_missing',
      category: 'meta',
      severity: 'critical',
      title: 'Meta Description Tidak Ditemukan',
      message: 'Halaman tidak memiliki tag meta description. Mesin pencari akan otomatis mengambil cuplikan teks acak dari isi halaman.',
      recommendation: 'Tambahkan meta description informatif dengan ajakan bertindak (kisaran 120–160 karakter sebagai heuristic cuplikan).'
    })
  } else if (desc.length < 60) {
    scoreMeta -= 3
    issues.push({
      id: 'desc_short',
      category: 'meta',
      severity: 'warning',
      title: `Meta Description Relatif Singkat (${desc.length} karakter)`,
      message: 'Deskripsi relatif singkat; evaluasi apakah informasi sudah cukup memikat calon pengunjung untuk mengklik halaman.',
      recommendation: 'Tambahkan informasi manfaat, keunggulan, atau ajakan bertindak agar lebih informatif (kisaran 120–160 karakter sebagai panduan tampilan cuplikan).'
    })
  } else if (desc.length > 165) {
    scoreMeta -= 2
    issues.push({
      id: 'desc_long',
      category: 'meta',
      severity: 'warning',
      title: `Meta Description Panjang (${desc.length} karakter)`,
      message: 'Panjang deskripsi berpotensi terpotong pada tampilan hasil pencarian seluler atau desktop.',
      recommendation: 'Pastikan pesan terpenting berada di 120–150 karakter pertama.'
    })
  } else {
    passed.push({
      id: 'desc_optimal',
      category: 'meta',
      title: `Meta Description Terpasang (${desc.length} karakter)`,
      message: 'Panjang meta description relatif sesuai untuk snippet cuplikan, meskipun mesin pencari dapat memilih cuplikan langsung dari isi halaman.'
    })
  }

  if (kw && desc) {
    if (desc.toLowerCase().includes(kw)) {
      passed.push({
        id: 'desc_kw_present',
        category: 'meta',
        title: 'Kata Kunci Ada di Meta Description',
        message: `Kata kunci sasaran "${kw}" termuat di dalam meta description.`
      })
    } else {
      scoreMeta -= 2
      issues.push({
        id: 'desc_kw_missing',
        category: 'meta',
        severity: 'warning',
        title: 'Kata Kunci Belum Ada di Meta Description',
        message: `Kata kunci sasaran "${kw}" belum ditemukan di meta description.`,
        recommendation: `Gunakan kata kunci "${kw}" secara alami dalam kalimat deskripsi.`
      })
    }
  }

  // Open Graph & Social Meta
  const hasOgTitle = Boolean(metadata.openGraph.title)
  const hasOgDesc = Boolean(metadata.openGraph.description)
  const hasOgImage = Boolean(metadata.openGraph.image)

  if (hasOgTitle && hasOgDesc && hasOgImage) {
    passed.push({
      id: 'og_complete',
      category: 'meta',
      title: 'Open Graph Metadata Lengkap',
      message: 'Tag og:title, og:description, dan og:image terpasang untuk pratinjau media sosial yang menarik.'
    })
  } else {
    const missingOg = []
    if (!hasOgTitle) missingOg.push('og:title')
    if (!hasOgDesc) missingOg.push('og:description')
    if (!hasOgImage) missingOg.push('og:image')

    scoreMeta -= 6
    issues.push({
      id: 'og_missing',
      category: 'meta',
      severity: 'warning',
      title: 'Metadata Open Graph Belum Lengkap',
      message: `Tag metadata sosial (${missingOg.join(', ')}) belum ditemukan. Halaman mungkin tidak menampilkan cuplikan menarik saat dibagikan di WhatsApp, Facebook, atau LinkedIn.`,
      recommendation: 'Tambahkan tag Open Graph (<meta property="og:title" ...>) beserta gambar pratinjau (og:image).'
    })
  }

  // ── 2. KONTEN, HEADING & RELEVANSI TOPIK (Max 25) ───────────────────────────
  const h1Count = metadata.h1s.length
  if (h1Count === 0) {
    scoreContent -= 8
    issues.push({
      id: 'h1_missing',
      category: 'content',
      severity: 'critical',
      title: 'Tag H1 Tidak Ditemukan',
      message: 'Halaman ini tidak memiliki tag <h1>. Heading level 1 penting sebagai sinyal utama topik halaman bagi pembaca dan bot perayap.',
      recommendation: 'Tambahkan tepat satu tag <h1> deskriptif untuk judul utama topik halaman.'
    })
  } else if (h1Count > 1) {
    scoreContent -= 3
    issues.push({
      id: 'h1_multiple',
      category: 'content',
      severity: 'warning',
      title: `Ditemukan Lebih dari Satu H1 (${h1Count} tag H1)`,
      message: 'Penggunaan beberapa tag H1 dapat mengaburkan hierarki utama konten halaman.',
      recommendation: 'Gunakan 1 tag H1 saja untuk judul utama, dan gunakan <h2> untuk sub-bagian berikutnya.'
    })
  } else {
    passed.push({
      id: 'h1_perfect',
      category: 'content',
      title: 'Struktur Tag H1 Sesuai (1 tag)',
      message: `H1 terdeteksi: "${metadata.h1s[0]}".`
    })
  }

  if (kw && metadata.h1s.length > 0) {
    const h1HasKw = metadata.h1s.some(h1 => h1.toLowerCase().includes(kw))
    if (h1HasKw) {
      passed.push({
        id: 'h1_kw_present',
        category: 'content',
        title: 'Kata Kunci Ada di H1',
        message: `Kata kunci sasaran "${kw}" ditemukan di tag heading H1.`
      })
    }
  }

  // Subheadings (H2, H3) & Hierarchy
  const totalSubheadings = metadata.h2s.length + metadata.h3s.length
  if (totalSubheadings === 0) {
    scoreContent -= 4
    issues.push({
      id: 'subheadings_missing',
      category: 'content',
      severity: 'warning',
      title: 'Sub-Heading (H2 / H3) Tidak Ditemukan',
      message: 'Halaman tidak memiliki tag <h2> atau <h3> untuk memecah informasi ke dalam bagian yang terstruktur.',
      recommendation: 'Gunakan tag <h2> untuk membagi topik ke dalam bab atau fitur yang mudah dipindai pembaca.'
    })
  } else {
    passed.push({
      id: 'subheadings_present',
      category: 'content',
      title: `Sub-Heading Terstruktur (${metadata.h2s.length} H2, ${metadata.h3s.length} H3)`,
      message: 'Hierarki sub-heading membantu keterbacaan pembaca dan perayap.'
    })
  }

  // Check skipped heading hierarchy
  const skippedLevels = metadata.headingHierarchyIssues.filter(i => i.type === 'skipped_level')
  if (skippedLevels.length > 0) {
    scoreContent -= 2
    issues.push({
      id: 'heading_hierarchy_skipped',
      category: 'content',
      severity: 'warning',
      title: 'Lompatan Hierarki Heading Terdeteksi',
      message: `Ditemukan hierarki heading yang melompat (misal H${skippedLevels[0].from} langsung ke H${skippedLevels[0].to} tanpa tingkatan perantara).`,
      recommendation: 'Susun tingkatan heading secara berurutan (H1 -> H2 -> H3) demi aksesibilitas dan struktur dokumen yang rapi.'
    })
  }

  // Content Length & Depth (Context-Aware by Page Type)
  const mainWords = metadata.mainWordCount || metadata.wordCount
  if (pageTypeInfo.type === 'PRODUCT') {
    if (mainWords < 80) {
      scoreContent -= 8
      issues.push({
        id: 'content_thin_product',
        category: 'content',
        severity: 'critical',
        title: `Deskripsi Produk Terlalu Ringkas (${mainWords} kata)`,
        message: 'Konten halaman produk sangat minim. Informasi yang terlalu sedikit dapat menyulitkan calon pembeli memahami spesifikasi dan manfaat produk.',
        recommendation: 'Lengkapi deskripsi produk dengan rincian material/varian, spesifikasi, petunjuk pemakaian, dan keunggulan produk.'
      })
    } else if (mainWords < 200) {
      scoreContent -= 5
      issues.push({
        id: 'content_brief_product',
        category: 'content',
        severity: 'warning',
        title: `Konten Produk Relatif Singkat (${mainWords} kata)`,
        message: 'Konten utama yang terdeteksi relatif singkat. Tidak ada batas minimum jumlah kata yang secara umum menjamin ranking; evaluasi apakah halaman sudah memberikan informasi yang cukup untuk intent pencarian pembeli.',
        recommendation: 'Periksa apakah halaman sudah memuat informasi origin, karakteristik, cara penyajian/penggunaan, garansi, atau testimoni pembeli.'
      })
    } else {
      passed.push({
        id: 'content_adequate_product',
        category: 'content',
        title: `Informasi Produk Memadai (${mainWords} kata)`,
        message: 'Panjang teks deskripsi produk memberikan konteks penjelasan yang cukup memadai bagi pengunjung.'
      })
    }
  } else if (pageTypeInfo.type === 'ARTICLE' || pageTypeInfo.type === 'BLOG') {
    // Article/Blog: expect more substantive content
    if (mainWords < 120) {
      scoreContent -= 9
      issues.push({
        id: 'content_thin_article',
        category: 'content',
        severity: 'critical',
        title: `Artikel Sangat Singkat (${mainWords} kata)`,
        message: `Konten artikel hanya memuat ${mainWords} kata. Artikel yang sangat singkat berisiko tidak memenuhi search intent pembaca yang mencari informasi komprehensif.`,
        recommendation: 'Kembangkan pembahasan dengan sub-topik, contoh konkret, dan panduan praktis yang menjawab pertanyaan pembaca secara menyeluruh.'
      })
    } else if (mainWords < 350) {
      scoreContent -= 5
      issues.push({
        id: 'content_brief_article',
        category: 'content',
        severity: 'warning',
        title: `Artikel Relatif Singkat (${mainWords} kata)`,
        message: `Konten artikel terdeteksi ${mainWords} kata. Evaluasi apakah pembahasan sudah komprehensif bagi pembaca yang mencari informasi lengkap tentang topik ini.`,
        recommendation: 'Tambahkan sub-bab pendukung, contoh nyata, atau studi kasus untuk memperkaya kedalaman topik artikel.'
      })
    } else {
      passed.push({
        id: 'content_adequate_article',
        category: 'content',
        title: `Kedalaman Konten Artikel Memadai (${mainWords} kata)`,
        message: 'Panjang teks artikel memadai untuk memberikan konteks topik yang bermakna bagi pembaca.'
      })
    }
  } else {
    // HOMEPAGE, SERVICE, LOCAL_BUSINESS, OTHER, CATEGORY
    if (mainWords < 80) {
      scoreContent -= 9
      issues.push({
        id: 'content_thin_general',
        category: 'content',
        severity: 'critical',
        title: `Konten Terlalu Sedikit (${mainWords} kata)`,
        message: `Konten utama halaman sangat sedikit (${mainWords} kata). Halaman memerlukan informasi yang cukup untuk menjelaskan tujuan dan nilai yang ditawarkan kepada pengunjung.`,
        recommendation: 'Tambahkan paragraf penjelasan, fitur utama, atau informasi kontak yang relevan untuk tipe halaman ini.'
      })
    } else if (mainWords < 150) {
      scoreContent -= 4
      issues.push({
        id: 'content_brief_general',
        category: 'content',
        severity: 'warning',
        title: `Konten Relatif Singkat (${mainWords} kata)`,
        message: `Konten utama yang terdeteksi relatif singkat (${mainWords} kata). Evaluasi apakah halaman sudah memberikan informasi yang cukup untuk search intent pengunjung.`,
        recommendation: 'Pertimbangkan menambahkan informasi tentang keunggulan, layanan, atau panduan yang relevan untuk halaman ini.'
      })
    } else {
      passed.push({
        id: 'content_adequate_general',
        category: 'content',
        title: `Kedalaman Konten Cukup (${mainWords} kata)`,
        message: 'Panjang teks halaman memadai untuk memberikan konteks yang bermakna bagi pengunjung.'
      })
    }
  }

  // Keyword relevance & natural distribution (No rigid density target!)
  if (kw && (metadata.mainContentText || metadata.bodyText)) {
    const kwAnalysis = calculateKeywordRelevance(metadata.mainContentText || metadata.bodyText, kw)
    if (kwAnalysis.count === 0) {
      scoreContent -= 4
      issues.push({
        id: 'kw_body_missing',
        category: 'content',
        severity: 'warning',
        title: `Kata Kunci "${kw}" Tidak Muncul di Teks Utama`,
        message: 'Kata kunci yang ditargetkan sama sekali tidak muncul pada paragraf konten utama halaman.',
        recommendation: `Gunakan kata kunci "${kw}" secara wajar di paragraf pembuka atau isi pembahasan.`
      })
    } else if (kwAnalysis.density > 3.5 || (mainWords < 150 && kwAnalysis.count >= 4)) {
      const isExtremeStuffing = kwAnalysis.density > 6 || (mainWords < 80 && kwAnalysis.count >= 4)
      scoreContent -= isExtremeStuffing ? 6 : 3
      issues.push({
        id: 'kw_stuffing',
        category: 'content',
        severity: isExtremeStuffing ? 'critical' : 'warning',
        title: `Potensi Pengulangan Berlebih Kata Kunci (${kwAnalysis.count} kali, densitas ${kwAnalysis.density}%)`,
        message: `Kata kunci "${kw}" muncul ${kwAnalysis.count} kali (${kwAnalysis.density}%) dalam teks singkat (${mainWords} kata). Pola pengulangan yang dipaksakan dapat menurunkan kenyamanan membaca.`,
        recommendation: 'Kurangi pengulangan kata kunci yang dipaksakan; gunakan variasi kalimat atau sinonim alami.'
      })
    } else {
      passed.push({
        id: 'kw_natural_presence',
        category: 'content',
        title: `Penggunaan Kata Kunci Natural (${kwAnalysis.count} kali terdeteksi)`,
        message: `Keyword terdeteksi ${kwAnalysis.count} kali (${kwAnalysis.density}%). Distribusi kata kunci tampak wajar tanpa indikasi manipulasi berlebih.`
      })
    }
  }

  // ── 3. TEKNIS, AKSESIBILITAS & URL (Max 25) ──────────────────────────────────
  if (!urlCheck.isHttps) {
    scoreTechnical -= 10
    issues.push({
      id: 'url_not_https',
      category: 'technical',
      severity: 'critical',
      title: 'Protokol Tidak Menggunakan HTTPS',
      message: 'Halaman web tidak menggunakan protokol HTTPS terenkripsi. Sambungan aman adalah standar wajib keamanan situs.',
      recommendation: 'Aktifkan sertifikat SSL/TLS dan alihkan seluruh lalu lintas HTTP ke HTTPS.'
    })
  } else {
    passed.push({
      id: 'url_https_secure',
      category: 'technical',
      title: 'Koneksi Aman (HTTPS)',
      message: 'URL menggunakan protokol HTTPS terenkripsi.'
    })
  }

  if (urlCheck.hasUnderscore) {
    scoreTechnical -= 2
    issues.push({
      id: 'url_underscore',
      category: 'technical',
      severity: 'warning',
      title: 'URL Menggunakan Garis Bawah (_)',
      message: 'Penggunaan tanda hubung strip (-) lebih lazim sebagai pemisah kata di URL dibandingkan garis bawah (_).',
      recommendation: 'Gunakan tanda hubung strip (-) untuk memisahkan kata di slug URL.'
    })
  }

  if (urlCheck.hasUppercase) {
    scoreTechnical -= 2
    issues.push({
      id: 'url_uppercase',
      category: 'technical',
      severity: 'warning',
      title: 'URL Mengandung Huruf Kapital',
      message: 'Huruf kapital pada path URL dapat menyebabkan masalah duplikasi halaman pada server yang case-sensitive.',
      recommendation: 'Gunakan huruf kecil (lowercase) untuk seluruh path URL.'
    })
  }

  if (!metadata.viewport) {
    scoreTechnical -= 6
    issues.push({
      id: 'viewport_missing',
      category: 'technical',
      severity: 'critical',
      title: 'Tag Meta Viewport Tidak Ditemukan',
      message: 'Tag <meta name="viewport"> tidak terdeteksi. Halaman berisiko tidak proporsional saat dibuka di perangkat ponsel.',
      recommendation: 'Tambahkan `<meta name="viewport" content="width=device-width, initial-scale=1.0">` di dalam elemen <head>.'
    })
  } else {
    passed.push({
      id: 'viewport_good',
      category: 'technical',
      title: 'Mobile Viewport Terpasang',
      message: 'Meta viewport siap untuk perenderan peramban perangkat seluler.'
    })
  }

  // Canonical — Full validation (Section F)
  if (metadata.canonical) {
    const canonicalVal = metadata.canonical.trim()
    const isAbsoluteCanonical = /^https?:\/\//i.test(canonicalVal)

    if (!isAbsoluteCanonical) {
      // Relative canonical: warn, not critical
      scoreTechnical -= 1
      issues.push({
        id: 'canonical_relative',
        category: 'technical',
        severity: 'warning',
        title: 'Canonical Menggunakan URL Relatif',
        message: `Tag canonical menggunakan URL relatif ("${canonicalVal}"). URL relatif berisiko diinterpretasikan secara berbeda oleh berbagai crawler.`,
        recommendation: 'Gunakan URL absolut (dimulai dengan https://) sebagai nilai canonical.'
      })
    } else {
      // Check self-canonical vs final URL
      const effectiveHostClean = urlCheck.hostname.toLowerCase().replace(/^www\./, '')
      let canonicalParsedHost = ''
      try {
        canonicalParsedHost = new URL(canonicalVal).hostname.toLowerCase().replace(/^www\./, '')
      } catch { /* ignore */ }

      const canonicalRootDomain = getRootDomain(canonicalParsedHost)
      const effectiveRootDomain = getRootDomain(effectiveHostClean)

      if (canonicalRootDomain && effectiveRootDomain && canonicalRootDomain !== effectiveRootDomain) {
        // Cross-domain canonical: WARNING (not source mismatch — seo.md Section F)
        scoreTechnical -= 1
        issues.push({
          id: 'canonical_cross_domain',
          category: 'technical',
          severity: 'warning',
          title: 'Canonical Mengarah ke Domain Berbeda (Cross-Domain)',
          message: `Tag canonical mengarah ke domain berbeda ("${canonicalParsedHost}") dari URL halaman ini ("${effectiveHostClean}"). Cross-domain canonical adalah sinyal yang perlu ditinjau — bisa legitimate (sindikasi konten) namun perlu dipastikan disengaja.`,
          recommendation: 'Verifikasi apakah cross-domain canonical ini disengaja. Jika tidak, arahkan canonical ke URL definitif di domain yang sama.'
        })
      } else {
        passed.push({
          id: 'canonical_valid',
          category: 'technical',
          title: 'Tag Canonical Valid (Absolute URL)',
          message: `Tautan kanonikal terpasang sebagai URL absolut: ${canonicalVal}.`
        })
      }
    }
  } else {
    scoreTechnical -= 3
    issues.push({
      id: 'canonical_missing',
      category: 'technical',
      severity: 'warning',
      title: 'Tag Canonical Belum Ditentukan',
      message: 'Tag rel="canonical" belum ditentukan. Tag ini membantu crawler mengenali URL sumber utama bila terjadi duplikasi parameter.',
      recommendation: 'Sertakan tag `<link rel="canonical" href="..." />` yang mengarah ke URL definitif halaman.'
    })
  }

  // Robots / Indexability — Section G
  if (metadata.robots) {
    const robotsLower = metadata.robots.toLowerCase()
    const hasNoindex = robotsLower.includes('noindex')
    const hasNofollow = robotsLower.includes('nofollow')

    if (hasNoindex) {
      scoreTechnical -= 10
      issues.push({
        id: 'meta_robots_noindex',
        category: 'technical',
        severity: 'critical',
        title: 'Halaman Diblokir dari Pengindeksan (noindex)',
        message: `Tag meta robots mengandung directive "noindex": "${metadata.robots}". Mesin pencari tidak akan mengindeks halaman ini sehingga tidak dapat muncul di hasil pencarian.`,
        recommendation: 'Periksa apakah noindex disengaja. Jika halaman harus terindeks, ubah atau hapus directive noindex dari meta robots.'
      })
    } else if (hasNofollow) {
      scoreTechnical -= 2
      issues.push({
        id: 'meta_robots_nofollow',
        category: 'technical',
        severity: 'warning',
        title: 'Meta Robots Mengandung nofollow',
        message: `Tag meta robots mengandung directive "nofollow": "${metadata.robots}". Tautan di halaman ini tidak akan diikuti crawler.`,
        recommendation: 'Verifikasi apakah nofollow diperlukan. Jika tautan navigasi perlu diikuti crawler, pertimbangkan menghapus directive ini.'
      })
    } else {
      passed.push({
        id: 'meta_robots_indexable',
        category: 'technical',
        title: `Meta Robots: Halaman Dapat Diindeks (${metadata.robots})`,
        message: `Directive meta robots terdeteksi (${metadata.robots}) dan tidak mengandung noindex — halaman terindikasi dapat diindeks.`
      })
    }
  } else {
    // No meta robots = default indexable, but UNVERIFIED (robots.txt still unknown)
    unverified.push({
      id: 'meta_robots_not_set',
      category: 'technical',
      title: 'Meta Robots Tidak Dideklarasikan (Default Indexable)',
      message: 'Tag meta robots tidak ditemukan. Secara default mesin pencari akan mengindeks halaman, namun status robots.txt tetap belum diverifikasi.',
      recommendation: 'Jika halaman perlu kontrol indexability eksplisit, tambahkan meta robots yang sesuai.'
    })
  }

  if (metadata.lang) {
    passed.push({
      id: 'lang_present',
      category: 'technical',
      title: `Atribut Bahasa Dideklarasikan (lang="${metadata.lang}")`,
      message: 'Atribut bahasa pada tag <html> membantu mesin pencari dan screen-reader mengidentifikasi bahasa utama dokumen.'
    })
  } else {
    scoreTechnical -= 2
    issues.push({
      id: 'lang_missing',
      category: 'technical',
      severity: 'warning',
      title: 'Atribut Bahasa (lang) Belum Dideklarasikan',
      message: 'Tag <html> belum memiliki atribut lang (contoh: <html lang="id">).',
      recommendation: 'Tambahkan atribut lang="id" pada tag pembuka <html>.'
    })
  }

  // ── 4. MEDIA, TAUTAN & STRUCTURED DATA (Max 25) ──────────────────────────────
  const images = metadata.images
  const totalImages = images.length
  const missingAltCount = images.filter(img => !img.hasAlt).length
  const genericAltCount = images.filter(img => img.isGenericAlt).length
  const missingDimensionsCount = images.filter(img => !img.hasDimensions).length

  if (totalImages > 0) {
    if (missingAltCount > 0) {
      const deduction = Math.min(8, missingAltCount * 2)
      scoreMedia -= deduction
      issues.push({
        id: 'images_missing_alt',
        category: 'media',
        severity: missingAltCount >= 3 ? 'critical' : 'warning',
        title: `${missingAltCount} Gambar Tanpa Atribut Alt`,
        message: `Ditemukan ${missingAltCount} dari ${totalImages} gambar tanpa deskripsi alt text.`,
        recommendation: 'Tambahkan teks deskriptif pada atribut alt="" setiap gambar untuk aksesibilitas dan pencarian gambar.'
      })
    } else if (genericAltCount > 0) {
      scoreMedia -= 2
      issues.push({
        id: 'images_generic_alt',
        category: 'media',
        severity: 'warning',
        title: `${genericAltCount} Alt Text Kurang Deskriptif`,
        message: 'Beberapa gambar menggunakan teks alt generik (seperti nama file atau kata "gambar").',
        recommendation: 'Jelaskan subjek gambar secara spesifik pada atribut alt.'
      })
    } else {
      passed.push({
        id: 'images_alt_all_good',
        category: 'media',
        title: `Seluruh Gambar Memiliki Alt Text (${totalImages} gambar)`,
        message: 'Atribut alt text terpasang deskriptif pada seluruh gambar yang terdeteksi.'
      })
    }

    if (missingDimensionsCount > 0) {
      scoreMedia -= 2
      issues.push({
        id: 'images_missing_dimensions',
        category: 'media',
        severity: 'warning',
        title: `${missingDimensionsCount} Gambar Tanpa Atribut Ukuran (width/height)`,
        message: 'Gambar tanpa atribut width dan height eksplisit dapat memicu pergeseran tata letak (Cumulative Layout Shift / CLS).',
        recommendation: 'Tentukan atribut width dan height pada tag <img> atau gunakan rasio aspek CSS.'
      })
    }

    const lazyImagesCount = images.filter(img => img.isLazy).length
    if (totalImages > 1 && lazyImagesCount === 0) {
      scoreMedia -= 2
      issues.push({
        id: 'images_missing_lazy',
        category: 'media',
        severity: 'warning',
        title: 'Gambar Belum Menggunakan Lazy Loading',
        message: 'Semua gambar dimuat sekaligus di awal, yang dapat memperlambat waktu pemuatan halaman seluler.',
        recommendation: 'Tambahkan atribut loading="lazy" pada gambar di bawah paruh lipatan (below-the-fold).'
      })
    }

    const modernFormatCount = images.filter(img => img.isModernFormat).length
    if (totalImages > 0 && modernFormatCount === 0) {
      scoreMedia -= 1
      issues.push({
        id: 'images_legacy_format',
        category: 'media',
        severity: 'warning',
        title: 'Format Gambar Belum Menggunakan WebP / AVIF',
        message: 'Seluruh gambar masih menggunakan format kompresi lama (JPEG/PNG). Format modern seperti WebP menghemat ukuran file hingga 30–50%.',
        recommendation: 'Konversi gambar produk ke format .webp atau .avif untuk kecepatan muat yang lebih optimal.'
      })
    }
  } else {
    passed.push({
      id: 'images_none',
      category: 'media',
      title: 'Tidak Ada Elemen Gambar Terdeteksi',
      message: 'Halaman tidak memuat tag <img> atau dianalisis dalam format teks murni.'
    })
  }

  // Links analysis
  const totalLinks = metadata.links.length
  const internalLinks = metadata.links.filter(l => l.isInternal)
  const emptyLinks = metadata.links.filter(l => l.isPlaceholder || l.isEmptyAnchor)
  const genericAnchors = metadata.links.filter(l => l.isGenericAnchor)

  if (emptyLinks.length > 0) {
    scoreMedia -= 3
    issues.push({
      id: 'empty_links_found',
      category: 'media',
      severity: 'warning',
      title: `${emptyLinks.length} Tautan Kosong / Placeholder Terdeteksi`,
      message: 'Ditemukan tag <a> dengan href="#" atau teks jangkar kosong. Tautan kosong tidak memberi nilai navigasi bagi pengguna.',
      recommendation: 'Pastikan seluruh tautan mengarah ke tujuan URL yang valid atau gunakan elemen <button> untuk aksi interaktif.'
    })
  }

  if (genericAnchors.length > 0) {
    scoreMedia -= 2
    issues.push({
      id: 'generic_anchor_text',
      category: 'media',
      severity: 'warning',
      title: `${genericAnchors.length} Tautan Menggunakan Teks Jangkar Generik`,
      message: 'Tautan dengan teks seperti "klik di sini" atau "baca selengkapnya" kurang memberi konteks topik tujuan.',
      recommendation: 'Gunakan teks tautan deskriptif yang mencerminkan nama halaman atau produk tujuan.'
    })
  }

  if (totalLinks > 0 && totalLinks <= 2 && emptyLinks.length === 0) {
    scoreMedia -= 2
    issues.push({
      id: 'links_sparse',
      category: 'media',
      severity: 'warning',
      title: `Kedalaman Tautan Relatif Sedikit (${totalLinks} tautan)`,
      message: 'Halaman hanya memiliki 1–2 tautan. Struktur internal linking yang baik membantu mendistribusikan otoritas halaman dan mempermudah perayapan katalog.',
      recommendation: 'Sertakan tautan kontekstual ke kategori terkait, panduan produk, atau rekomendasi produk serupa.'
    })
  } else if (totalLinks > 2 && emptyLinks.length === 0) {
    passed.push({
      id: 'links_valid',
      category: 'media',
      title: `Struktur Tautan Terdistribusi (${internalLinks.length} internal, ${totalLinks - internalLinks.length} eksternal)`,
      message: 'Tautan navigasi terpasang dengan tujuan URL yang terdefinisi.'
    })
  }

  // Structured Data (Schema.org / JSON-LD) — Significant Signal
  const jsonLd = metadata.jsonLd
  if (jsonLd.detected && jsonLd.isValid && jsonLd.types.length > 0) {
    passed.push({
      id: 'schema_present',
      category: 'media',
      title: `Structured Data Terdeteksi (${jsonLd.types.join(', ')})`,
      message: 'Halaman telah dilengkapi format schema.org JSON-LD yang valid untuk mendukung cuplikan kaya (rich snippet).'
    })
  } else if (jsonLd.detected && !jsonLd.isValid) {
    scoreMedia -= 6
    issues.push({
      id: 'schema_invalid',
      category: 'media',
      severity: 'critical',
      title: 'Sintaks JSON-LD Rusak / Tidak Valid',
      message: 'Skrip structured data ditemukan namun gagal diuraikan karena kesalahan sintaks JSON.',
      recommendation: 'Periksa format kurung kurawal, tanda petik ganda, dan tanda koma pada blok <script type="application/ld+json">.'
    })
  } else {
    // Structured data not detected: NOT a critical failure, but an opportunity/gap that prevents awarding full marks
    scoreMedia -= 8
    unverified.push({
      id: 'schema_not_detected',
      category: 'media',
      title: 'Structured Data (Schema.org) Tidak Terdeteksi',
      message: 'Halaman ini belum memuat structured data JSON-LD. Menambahkan schema relevan (misalnya Product, Article, atau LocalBusiness) membantu mesin pencari memahami entitas konten secara terstruktur.',
      recommendation: pageTypeInfo.type === 'PRODUCT'
        ? 'Tambahkan schema.org/Product lengkap dengan properti nama, gambar, harga (Offer), dan ketersediaan stok.'
        : 'Pertimbangkan menambahkan schema JSON-LD yang sesuai dengan jenis konten halaman.'
    })
  }

  // ── UNVERIFIED ASPECTS (UNKNOWN != PASS) ─────────────────────────────────────
  unverified.push({
    id: 'robots_txt_unverified',
    category: 'technical',
    title: 'Aksesibilitas robots.txt Belum Diverifikasi',
    message: 'File /robots.txt tidak dapat diperiksa dari source code dokumen statis ini. Pastikan perayap diizinkan mengindeks path halaman ini.',
    recommendation: 'Cek https://domain-anda.com/robots.txt untuk memastikan tidak ada aturan Disallow yang tidak sengaja memblokir perayap.'
  })

  unverified.push({
    id: 'mobile_rendering_unverified',
    category: 'technical',
    title: 'Perenderan Visual Mobile Belum Diuji Nyata',
    message: 'Tag meta viewport telah terpasang, namun uji visual tata letak responsif aktual memerlukan pengujian peramban dinamis.',
    recommendation: 'Buka halaman di ponsel untuk memastikan elemen tidak saling bertumpuk dan ukuran tombol nyaman diklik.'
  })

  // Clamp subscores
  scoreMeta = Math.max(0, Math.min(25, scoreMeta))
  scoreContent = Math.max(0, Math.min(25, scoreContent))
  scoreTechnical = Math.max(0, Math.min(25, scoreTechnical))
  scoreMedia = Math.max(0, Math.min(25, scoreMedia))

  const totalScore = Math.max(0, Math.min(100, scoreMeta + scoreContent + scoreTechnical + scoreMedia))

  // Determine grade and summary status
  let grade = 'A'
  let gradeLabel = 'Sangat Baik'
  let gradeColor = 'text-profit-600'
  if (totalScore < 50) {
    grade = 'D'
    gradeLabel = 'Perlu Banyak Perbaikan'
    gradeColor = 'text-red-600'
  } else if (totalScore < 70) {
    grade = 'C'
    gradeLabel = 'Cukup'
    gradeColor = 'text-orange-500'
  } else if (totalScore < 85) {
    grade = 'B'
    gradeLabel = 'Baik'
    gradeColor = 'text-blue-600'
  }

  // Generate Evidence-Based Explanation: "Mengapa saya mendapat skor ini?"
  const scoreExplanation = {
    summary: `Skor ${totalScore}/100 mencerminkan evaluasi bukti nyata (evidence-based) dari 4 pilar audit: Meta & Judul (${scoreMeta}/25), Konten & Relevansi (${scoreContent}/25), Teknis & Aksesibilitas (${scoreTechnical}/25), serta Media & Schema (${scoreMedia}/25).`,
    keyStrengths: passed.slice(0, 4).map(p => p.title),
    topPriorities: issues.filter(i => i.severity === 'critical').concat(issues.filter(i => i.severity === 'warning')).slice(0, 3).map(i => i.title),
    unverifiedCount: unverified.length
  }

  return {
    id: auditId || `seo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    requestedUrl: url,
    url: urlCheck.normalizedUrl,
    finalUrl: finalUrl || urlCheck.normalizedUrl,
    isRedirected: Boolean(finalUrl && finalUrl !== url),
    hostname: urlCheck.hostname,
    hasSourceMismatch: identityCheck.hasMismatch,
    sourceMismatchReason: identityCheck.reason,
    targetKeyword: kw || null,
    analyzedAt: new Date().toISOString(),
    totalScore,
    grade,
    gradeLabel,
    gradeColor,
    confidence,
    pageType: pageTypeInfo.type,
    pageTypeLabel: pageTypeInfo.label,
    breakdown: {
      meta: {
        score: scoreMeta,
        max: 25,
        label: 'Meta & Judul',
        evidence: `Judul: ${title ? `${title.length} karakter` : 'Tidak ada'}, Deskripsi: ${desc ? `${desc.length} karakter` : 'Tidak ada'}, OpenGraph: ${hasOgTitle && hasOgImage ? 'Terpasang' : 'Belum lengkap'}`
      },
      content: {
        score: scoreContent,
        max: 25,
        label: 'Konten & Relevansi',
        evidence: `H1: ${h1Count}, Sub-heading: ${totalSubheadings}, Panjang teks utama: ${mainWords} kata (${pageTypeInfo.label})`
      },
      technical: {
        score: scoreTechnical,
        max: 25,
        label: 'Teknis & Aksesibilitas',
        evidence: `HTTPS: ${urlCheck.isHttps ? 'Ya' : 'Tidak'}, Viewport: ${metadata.viewport ? 'Ya' : 'Tidak'}, Canonical: ${metadata.canonical ? 'Ya' : 'Tidak'}, Lang: ${metadata.lang || 'Tidak ada'}`
      },
      media: {
        score: scoreMedia,
        max: 25,
        label: 'Media, Tautan & Schema',
        evidence: `Gambar: ${totalImages} (alt hilang: ${missingAltCount}), Tautan: ${totalLinks}, Schema JSON-LD: ${jsonLd.detected ? jsonLd.types.join(', ') : 'Tidak terdeteksi'}`
      }
    },
    metadata: {
      title: metadata.title,
      metaDescription: metadata.metaDescription,
      canonical: metadata.canonical,
      h1Count,
      h2Count: metadata.h2s.length,
      h3Count: metadata.h3s.length,
      wordCount: metadata.wordCount,
      mainWordCount: metadata.mainWordCount,
      totalImages,
      missingAltCount,
      totalLinks: metadata.links.length,
      internalLinksCount: internalLinks.length,
      externalLinksCount: totalLinks - internalLinks.length,
      jsonLdTypes: jsonLd.types,
      hasOpenGraph: Boolean(hasOgTitle && hasOgImage)
    },
    scoreExplanation,
    issues: issues.sort((a, b) => {
      if (a.severity === 'critical' && b.severity !== 'critical') return -1
      if (a.severity !== 'critical' && b.severity === 'critical') return 1
      return 0
    }),
    passed,
    unverified,
    counts: {
      critical: issues.filter(i => i.severity === 'critical').length,
      warning: issues.filter(i => i.severity === 'warning').length,
      passed: passed.length,
      unverified: unverified.length
    }
  }
}

/**
 * Client-Side Persistence with Strict Tenant Isolation
 */
export function getSeoStorageKey(businessId) {
  if (!businessId) return 'bisnissehat_seo_history_global'
  return `bisnissehat_seo_history_${businessId}`
}

export function saveSeoAuditHistory(businessId, auditResult) {
  if (!auditResult || !auditResult.id) return []
  const key = getSeoStorageKey(businessId)
  try {
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    const updated = [auditResult, ...existing.filter(item => item.id !== auditResult.id)].slice(0, 30)
    localStorage.setItem(key, JSON.stringify(updated))
    return updated
  } catch {
    return [auditResult]
  }
}

export function loadSeoAuditHistory(businessId) {
  const key = getSeoStorageKey(businessId)
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

export function deleteSeoAuditHistory(businessId, auditId) {
  const key = getSeoStorageKey(businessId)
  try {
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    const updated = existing.filter(item => item.id !== auditId)
    localStorage.setItem(key, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

export function clearSeoAuditHistory(businessId) {
  const key = getSeoStorageKey(businessId)
  try {
    localStorage.removeItem(key)
    return []
  } catch {
    return []
  }
}
