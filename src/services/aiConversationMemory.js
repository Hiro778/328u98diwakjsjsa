// src/services/aiConversationMemory.js
// In-memory Short-Term Conversation Memory & Context Follow-Up Resolver for AI Business Analyst
// Strictly scoped per businessId + userId + sessionId.
// Governed by TTL and sliding window size; ZERO persistent DB schema required.
// Completely sanitized: CANNOT store credentials, keys, tokens, or raw secrets.

export const DEFAULT_MEMORY_TTL_MS = 15 * 60 * 1000 // 15 minutes
export const DEFAULT_METRIC_TTL_MS = 60 * 1000 // 60 seconds
export const MAX_MEMORY_TURNS = 20
export const MAX_RECENT_ENTITIES = 10

// In-memory stores
const conversationMemoryStore = new Map()
const shortTermMetricCache = new Map()

// Credential and canary patterns that MUST NEVER be stored in memory
const SENSITIVE_PATTERNS = [
  /CANARY_[A-Z0-9_]+/gi,
  /TOKENKODING_[A-Z0-9_]+/gi,
  /service[_\s-]?role/gi,
  /eyJhbGciOi[A-Za-z0-9-_.]+/g, // JWT signature
  /p@ssw0rd/gi,
  /Bearer\s+[A-Za-z0-9-_.]+/gi,
]

/**
 * Sanitize strings or objects to prevent secrets or canary tokens from being stored in memory.
 */
export function sanitizeMemoryValue(val) {
  if (!val) return val
  if (typeof val === 'string') {
    let clean = val
    for (const pat of SENSITIVE_PATTERNS) {
      clean = clean.replace(pat, '[REDACTED]')
    }
    return clean
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeMemoryValue(item))
  }
  if (typeof val === 'object') {
    const res = {}
    for (const [k, v] of Object.entries(val)) {
      if (/key|secret|token|password|auth|bearer|jwt/i.test(k)) {
        continue // drop sensitive keys completely
      }
      res[k] = sanitizeMemoryValue(v)
    }
    return res
  }
  return val
}

/**
 * Build composite storage key strictly isolating tenant, user, and session.
 */
export function buildMemoryKey(businessId, userId, sessionId = 'default') {
  if (!businessId || !userId) return null
  return `${businessId}:${userId}:${sessionId || 'default'}`
}

/**
 * Retrieve memory object for a session.
 */
export function getConversationMemory({ businessId, userId, sessionId = 'default' }) {
  const key = buildMemoryKey(businessId, userId, sessionId)
  if (!key) return null
  const entry = conversationMemoryStore.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    conversationMemoryStore.delete(key)
    return null
  }
  return entry
}

/**
 * Initialize or update conversation memory object.
 */
export function updateConversationMemory({
  businessId,
  userId,
  sessionId = 'default',
  language = 'id',
  recentTopic = null,
  lastIntent = null,
  recentEntities = null,
  recentToolSummary = null,
  ttlMs = DEFAULT_MEMORY_TTL_MS,
}) {
  const key = buildMemoryKey(businessId, userId, sessionId)
  if (!key) return null
  const now = Date.now()

  let entry = conversationMemoryStore.get(key)
  if (!entry || now > entry.expiresAt) {
    entry = {
      conversationId: sessionId || 'default',
      userId,
      businessId,
      language: language || 'id',
      recentTopic: null,
      lastIntent: null,
      recentEntities: {
        supplier: null,
        product: null,
      },
      recentToolSummary: null,
      recentTurns: [],
      expiresAt: now + ttlMs,
    }
  } else {
    entry.expiresAt = now + ttlMs
  }

  if (language) entry.language = language
  if (recentTopic) entry.recentTopic = sanitizeMemoryValue(recentTopic)
  if (lastIntent) entry.lastIntent = sanitizeMemoryValue(lastIntent)
  if (recentEntities) {
    entry.recentEntities = {
      ...entry.recentEntities,
      ...sanitizeMemoryValue(recentEntities),
    }
  }
  if (recentToolSummary) {
    entry.recentToolSummary = sanitizeMemoryValue(recentToolSummary)
  }

  conversationMemoryStore.set(key, entry)
  return entry
}

/**
 * Record a conversational turn (user message & assistant reply) into memory.
 */
export function recordConversationTurn({
  businessId,
  userId,
  sessionId = 'default',
  userMessage,
  assistantReply,
  ttlMs = DEFAULT_MEMORY_TTL_MS,
}) {
  const key = buildMemoryKey(businessId, userId, sessionId)
  if (!key) return []
  const now = Date.now()

  let entry = conversationMemoryStore.get(key)
  if (!entry || now > entry.expiresAt) {
    entry = {
      conversationId: sessionId || 'default',
      userId,
      businessId,
      language: 'id',
      recentTopic: null,
      lastIntent: null,
      recentEntities: { supplier: null, product: null },
      recentToolSummary: null,
      recentTurns: [],
      expiresAt: now + ttlMs,
    }
  } else {
    entry.expiresAt = now + ttlMs
  }

  if (userMessage && typeof userMessage === 'string' && userMessage.trim()) {
    entry.recentTurns.push({
      role: 'user',
      content: sanitizeMemoryValue(userMessage.trim().slice(0, 1000)),
      timestamp: now,
    })
  }

  if (assistantReply && typeof assistantReply === 'string' && assistantReply.trim()) {
    entry.recentTurns.push({
      role: 'assistant',
      content: sanitizeMemoryValue(assistantReply.trim().slice(0, 2000)),
      timestamp: now,
    })
  }

  // Sliding window bounds
  if (entry.recentTurns.length > MAX_MEMORY_TURNS) {
    entry.recentTurns = entry.recentTurns.slice(-MAX_MEMORY_TURNS)
  }

  conversationMemoryStore.set(key, entry)
  return [...entry.recentTurns]
}

/**
 * Get recent turns for session history.
 */
export function getConversationHistory({ businessId, userId, sessionId = 'default' }) {
  const memory = getConversationMemory({ businessId, userId, sessionId })
  if (!memory || !Array.isArray(memory.recentTurns)) return []
  return [...memory.recentTurns]
}

/**
 * Clear conversation memory for a session.
 */
export function clearConversationHistory({ businessId, userId, sessionId = 'default' }) {
  const key = buildMemoryKey(businessId, userId, sessionId)
  if (key) {
    conversationMemoryStore.delete(key)
  }
}

/**
 * Clear all memory stores (for test isolation).
 */
export function clearAllConversationMemory() {
  conversationMemoryStore.clear()
  shortTermMetricCache.clear()
}

// ── SHORT-TERM METRICS CACHE ──

export function getCachedMetric(businessId, metricType) {
  if (!businessId || !metricType) return null
  const key = `${businessId}:${metricType}`
  const entry = shortTermMetricCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    shortTermMetricCache.delete(key)
    return null
  }
  return entry.data
}

export function setCachedMetric(businessId, metricType, data, ttlMs = DEFAULT_METRIC_TTL_MS) {
  if (!businessId || !metricType || data === undefined) return
  const key = `${businessId}:${metricType}`
  shortTermMetricCache.set(key, {
    data: sanitizeMemoryValue(data),
    expiresAt: Date.now() + ttlMs,
  })
}

export function invalidateBusinessCache(businessId) {
  if (!businessId) return
  const prefix = `${businessId}:`
  for (const key of shortTermMetricCache.keys()) {
    if (key.startsWith(prefix)) {
      shortTermMetricCache.delete(key)
    }
  }
}

// ── TYPO & NATURAL LANGUAGE NORMALIZATION ──

const TYPO_MAP = {
  sipaa: 'siapa',
  sipa: 'siapa',
  sp: 'siapa',
  namnay: 'namanya',
  namny: 'namanya',
  namanyaa: 'namanya',
  nma: 'nama',
  mneurut: 'menurut',
  mnurut: 'menurut',
  bsia: 'bisa',
  suplier: 'supplier',
  suplayer: 'supplier',
  suplaier: 'supplier',
  omset: 'omzet',
  plg: 'paling',
}

/**
 * Normalize common Indonesian typos without altering security words.
 */
export function normalizeCasualInput(raw = '') {
  if (!raw || typeof raw !== 'string') return ''
  const words = raw.trim().split(/\s+/)
  const normalized = words.map((w) => {
    const cleanWord = w.toLowerCase().replace(/[?!.,;:]+$/g, '')
    const punct = w.slice(cleanWord.length)
    if (Object.prototype.hasOwnProperty.call(TYPO_MAP, cleanWord)) {
      return TYPO_MAP[cleanWord] + punct
    }
    return w
  })
  return normalized.join(' ')
}

// ── CONTEXT FOLLOW-UP RESOLVER ──

/**
 * Resolves contextual follow-up questions from recent conversation memory.
 * Runs BEFORE final intent fallback so that short references ("siapa namanya?", "yang tadi?")
 * resolve to their appropriate preceding entity rather than generic fallbacks.
 */
export function resolveContextualFollowUp({
  message = '',
  memory = null,
  userId,
  businessId,
  setPendingConfirmation,
}) {
  if (!message || !memory) return { resolved: false }

  const norm = normalizeCasualInput(message).toLowerCase().replace(/[?!.,;:]+$/g, '').trim()

  // 1. Supplier Name Follow-up: "siapa namanya?", "sipaa namnay", "siapa namanya", "siapa aja"
  if (
    /^(?:siapa\s+namanya|namanya\s+siapa|siapa\s+nama\s+supplier(?:nya)?|siapa\s+aja|siapa\s+saja|siapa\s+supplier(?:nya)?|nama\s+supplier(?:nya)?\s+apa|siapa)$/i.test(
      norm
    )
  ) {
    if (memory.recentTopic === 'supplier' || memory.recentToolSummary?.type === 'supplier_list') {
      const summary = memory.recentToolSummary
      const names = summary?.names || []
      const single = memory.recentEntities?.supplier?.name

      if (names.length === 1 || (names.length === 0 && single)) {
        const name = names[0] || single
        return {
          resolved: true,
          text: `Namanya ${name}.`,
          suggestions: [`Lihat detail ${name}`, 'Tambah supplier baru', 'Produk paling laku bulan ini'],
        }
      }

      if (names.length > 1) {
        return {
          resolved: true,
          text: `Supplier yang terdaftar antara lain: ${names.join(', ')}.`,
          suggestions: ['Lihat supplier', 'Tambah supplier baru'],
        }
      }

      if (summary?.count === 0) {
        return {
          resolved: true,
          text: 'Belum ada supplier yang terdaftar di database bisnis Anda.',
          suggestions: ['Tambah supplier baru', 'Katalog produk'],
        }
      }
    }
  }

  // 2. Product Margin Follow-up: "berapa marginnya?", "marginnya berapa?", "margin produk itu?"
  if (
    /^(?:berapa\s+margin(?:nya)?|margin(?:nya)?\s+berapa|berapa\s+profit(?:nya)?|margin\s+produk\s+(?:itu|tadi))$/i.test(
      norm
    )
  ) {
    if (memory.recentTopic === 'product' || memory.recentEntities?.product?.name) {
      const prod = memory.recentEntities?.product
      if (prod && prod.marginPct !== undefined) {
        return {
          resolved: true,
          text: `Margin keuntungan untuk produk "${prod.name}" adalah ${prod.marginPct}%.`,
          suggestions: ['Produk paling laku bulan ini', 'Berapa omzet saya?'],
        }
      }
      if (prod) {
        return {
          resolved: true,
          text: `Produk "${prod.name}" memiliki performa margin yang tercatat dalam katalog produk.`,
          suggestions: ['Berapa margin saya?', 'Katalog produk'],
        }
      }
    }
  }

  // 3. Product Sales Follow-up: "berapa terjual?", "terjual berapa?", "berapa yang laku?"
  if (/^(?:berapa\s+terjual|terjual\s+berapa|berapa\s+yang\s+laku|laku\s+berapa)$/i.test(norm)) {
    if (memory.recentTopic === 'product' || memory.recentEntities?.product?.name) {
      const prod = memory.recentEntities?.product
      if (prod) {
        const sold = prod.sold || prod.orderCount || memory.recentToolSummary?.orderCount
        if (sold !== undefined) {
          return {
            resolved: true,
            text: `Produk "${prod.name}" tercatat terjual sebanyak ${sold} kali.`,
            suggestions: ['Berapa margin saya?', 'Katalog produk'],
          }
        }
        return {
          resolved: true,
          text: `Produk "${prod.name}" aktif terjual pada transaksi kasir POS Anda.`,
          suggestions: ['Berapa omzet saya bulan ini?', 'Produk paling laku bulan ini'],
        }
      }
    }
  }

  // 4. Reference Follow-up: "yang tadi?", "maksudnya yang tadi?", "yang barusan?"
  if (/^(?:yang\s+tadi|yang\s+barusan|maksudnya\s+yang\s+tadi)$/i.test(norm)) {
    if (memory.recentEntities?.supplier?.name) {
      return {
        resolved: true,
        text: `Yang tadi kita bahas adalah supplier "${memory.recentEntities.supplier.name}". Ada yang ingin Anda lakukan terkait supplier ini?`,
        suggestions: ['Lihat supplier', `Hapus supplier ${memory.recentEntities.supplier.name}`],
      }
    }
    if (memory.recentEntities?.product?.name) {
      return {
        resolved: true,
        text: `Yang tadi kita bahas adalah produk "${memory.recentEntities.product.name}".`,
        suggestions: ['Berapa margin saya?', 'Katalog produk'],
      }
    }
    if (memory.recentTopic) {
      return {
        resolved: true,
        text: `Yang tadi kita bahas adalah seputar topik ${memory.recentTopic}. Ada yang ingin dicek lebih lanjut?`,
        suggestions: ['Berapa omzet saya bulan ini?', 'Kapan harus restock?'],
      }
    }
  }

  // 5. Destructive Follow-up Safety: "hapus yang tadi", "hapus supplier yang tadi", "hapus produk yang tadi"
  // MUST NEVER execute immediately — must resolve target entity and mandate confirmation!
  if (/^(?:hapus\s+(?:yang\s+tadi|yang\s+barusan|supplier\s+yang\s+tadi|produk\s+yang\s+tadi))$/i.test(norm)) {
    // 5a. Supplier destructive resolution
    if (
      (memory.recentTopic === 'supplier' || memory.recentEntities?.supplier) &&
      memory.recentEntities?.supplier?.name
    ) {
      const target = memory.recentEntities.supplier
      const newConfId = `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      if (typeof setPendingConfirmation === 'function') {
        setPendingConfirmation({
          confirmationId: newConfId,
          userId,
          businessId,
          action: 'delete_supplier',
          targetId: target.id || target.name,
          targetName: target.name,
        })
      }
      return {
        resolved: true,
        confirmationRequired: true,
        confirmationId: newConfId,
        action: 'delete_supplier',
        target: { id: target.id, name: target.name },
        text: `Kalau maksud kamu supplier "${target.name}", saya bisa menghapusnya. Apakah kamu yakin ingin menghapus supplier "${target.name}"?`,
      }
    }

    // 5b. Product destructive resolution
    if (
      (memory.recentTopic === 'product' || memory.recentEntities?.product) &&
      memory.recentEntities?.product?.name
    ) {
      const target = memory.recentEntities.product
      const newConfId = `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      if (typeof setPendingConfirmation === 'function') {
        setPendingConfirmation({
          confirmationId: newConfId,
          userId,
          businessId,
          action: 'delete_product',
          targetId: target.id || target.name,
          targetName: target.name,
        })
      }
      return {
        resolved: true,
        confirmationRequired: true,
        confirmationId: newConfId,
        action: 'delete_product',
        target: { id: target.id, name: target.name },
        text: `Kalau maksud kamu produk "${target.name}", saya bisa menghapusnya. Apakah kamu yakin ingin menghapus produk "${target.name}"?`,
      }
    }

    return {
      resolved: true,
      text: 'Tidak ada entitas supplier atau produk dari percakapan sebelumnya yang dapat dihapus. Silakan sebutkan nama entitas yang ingin dihapus.',
      suggestions: ['Lihat supplier', 'Katalog produk'],
    }
  }

  return { resolved: false }
}
