// ============================================================
// loyaltyUtils.js
// Loyalty Program utility functions: point calc, validation, search, filter, sort
// ============================================================

// --- Safe Number Helpers ---

export function safeNumber(val) {
  if (val === null || val === undefined) return 0
  const n = Number(val)
  if (!Number.isFinite(n)) return 0
  return n
}

export function safeInt(val) {
  return Math.floor(safeNumber(val))
}

// --- Date Helpers ---

export function getToday() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- Point Calculation ---

/**
 * Calculate earned points from a transaction amount and program config.
 * Formula: floor(eligibleAmount / rule_amount) × points_per_rule
 * Returns 0 for invalid/negative/zero amounts.
 */
export function calculateEarnedPoints(amount, program) {
  const eligibleAmount = safeNumber(amount)
  const minTx = safeNumber(program?.min_transaction_amount)
  const ruleAmount = safeNumber(program?.rule_amount)
  const pointsPerRule = safeInt(program?.points_per_rule)

  if (eligibleAmount <= 0) return 0
  if (eligibleAmount < minTx) return 0
  if (ruleAmount <= 0) return 0
  if (pointsPerRule <= 0) return 0

  const rules = Math.floor(eligibleAmount / ruleAmount)
  return rules * pointsPerRule
}

/**
 * Check if a sale reference already exists in ledger (duplicate prevention).
 */
export function isDuplicateEarning(ledger, saleId) {
  if (!saleId) return false
  return ledger.some(entry =>
    entry.reference_type === 'sale' && entry.reference_id === saleId
  )
}

// --- Program Validation ---

export function validateProgram(form) {
  const errors = {}

  const name = (form.name || '').trim()
  if (!name) errors.name = 'Nama program wajib diisi'

  const ruleAmount = safeNumber(form.rule_amount)
  if (ruleAmount <= 0) errors.rule_amount = 'Jumlah rule harus lebih dari 0'

  const pointsPerRule = safeInt(form.points_per_rule)
  if (pointsPerRule <= 0) errors.points_per_rule = 'Poin per rule harus lebih dari 0'

  const minRedeem = safeInt(form.min_points_redeem)
  if (minRedeem < 0) errors.min_points_redeem = 'Minimum redeem tidak boleh negatif'

  if (form.points_expiry_days !== null && form.points_expiry_days !== undefined && form.points_expiry_days !== '') {
    const days = safeInt(form.points_expiry_days)
    if (days <= 0) errors.points_expiry_days = 'Masa berlaku harus lebih dari 0 hari'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// --- Reward Validation ---

export function validateReward(form) {
  const errors = {}

  const name = (form.name || '').trim()
  if (!name) errors.name = 'Nama reward wajib diisi'

  const points = safeInt(form.points_required)
  if (points <= 0) errors.points_required = 'Poin yang diperlukan harus lebih dari 0'

  if (form.stock !== null && form.stock !== undefined && form.stock !== '') {
    const stock = safeInt(form.stock)
    if (stock < 0) errors.stock = 'Stock tidak boleh negatif'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// --- Reward Active Check ---

/**
 * Check if a reward can be redeemed.
 */
export function isRewardAvailable(reward) {
  if (!reward) return false
  if (!reward.is_active) return false
  if (reward.stock !== null && reward.stock !== undefined && reward.stock <= 0) return false
  if (reward.expiry_date && reward.expiry_date < getToday()) return false
  return true
}

// --- Redemption Validation ---

export function validateRedemption(customer, reward, program) {
  const errors = {}

  if (!customer) {
    errors.customer = 'Customer tidak ditemukan'
    return { valid: false, errors }
  }

  if (!reward) {
    errors.reward = 'Reward tidak ditemukan'
    return { valid: false, errors }
  }

  if (!isRewardAvailable(reward)) {
    errors.reward = 'Reward tidak tersedia'
    return { valid: false, errors }
  }

  const balance = safeInt(customer.loyalty_points_balance)
  const required = safeInt(reward.points_required)
  const minRedeem = safeInt(program?.min_points_redeem)

  if (balance < required) {
    errors.points = `Poin tidak cukup. Dibutuhkan ${required}, tersedia ${balance}`
  }

  if (balance < minRedeem) {
    errors.points = `Minimum redeem adalah ${minRedeem} poin`
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// --- Point Adjustment Validation ---

export function validatePointAdjustment(amount, reason, currentBalance) {
  const errors = {}
  const pts = safeInt(amount)

  if (pts === 0) {
    errors.amount = 'Jumlah poin tidak boleh 0'
  }

  if (!reason || !reason.trim()) {
    errors.reason = 'Alasan wajib diisi'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export function canSubtractPoints(amount, currentBalance) {
  const pts = safeInt(amount)
  const bal = safeInt(currentBalance)
  return pts <= bal
}

// --- Normalize ---

export function normalizeProgram(row) {
  if (!row) return null
  return {
    ...row,
    min_transaction_amount: safeNumber(row.min_transaction_amount),
    points_per_rule: safeInt(row.points_per_rule),
    rule_amount: safeNumber(row.rule_amount),
    min_points_redeem: safeInt(row.min_points_redeem),
    points_expiry_days: row.points_expiry_days != null ? safeInt(row.points_expiry_days) : null,
  }
}

export function normalizeReward(row) {
  if (!row) return null
  return {
    ...row,
    points_required: safeInt(row.points_required),
    stock: row.stock != null ? safeInt(row.stock) : null,
    is_available: isRewardAvailable(row),
  }
}

// --- Ledger Type Constants ---

export const LEDGER_TYPES = {
  EARN: 'EARN',
  REDEEM: 'REDEEM',
  ADJUSTMENT_ADD: 'ADJUSTMENT_ADD',
  ADJUSTMENT_SUBTRACT: 'ADJUSTMENT_SUBTRACT',
  EXPIRE: 'EXPIRE',
}

export const LEDGER_TYPE_LABELS = {
  [LEDGER_TYPES.EARN]: 'Perolehan',
  [LEDGER_TYPES.REDEEM]: 'Penukaran',
  [LEDGER_TYPES.ADJUSTMENT_ADD]: 'Penambahan Manual',
  [LEDGER_TYPES.ADJUSTMENT_SUBTRACT]: 'Pengurangan Manual',
  [LEDGER_TYPES.EXPIRE]: 'Kedaluwarsa',
}

export const LEDGER_TYPE_COLORS = {
  [LEDGER_TYPES.EARN]: 'text-profit-600',
  [LEDGER_TYPES.REDEEM]: 'text-red-500',
  [LEDGER_TYPES.ADJUSTMENT_ADD]: 'text-blue-600',
  [LEDGER_TYPES.ADJUSTMENT_SUBTRACT]: 'text-yellow-600',
  [LEDGER_TYPES.EXPIRE]: 'text-text-muted',
}

// --- Search Members ---

export function searchMembers(members, query) {
  if (!query || !query.trim()) return members
  const q = query.trim().toLowerCase()
  return members.filter(m =>
    (m.name || '').toLowerCase().includes(q) ||
    (m.phone || '').toLowerCase().includes(q) ||
    (m.email || '').toLowerCase().includes(q)
  )
}

// --- Filter Members ---

export const MEMBER_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'inactive', label: 'Tidak Aktif' },
  { key: 'has_points', label: 'Poin > 0' },
  { key: 'never_redeemed', label: 'Belum Redeem' },
]

export function filterMembers(members, filterKey) {
  if (filterKey === 'all') return members
  return members.filter(m => {
    switch (filterKey) {
      case 'active':
        return m.loyalty_is_member && (m.total_transactions || 0) > 0
      case 'inactive':
        return !m.loyalty_is_member || (m.total_transactions || 0) === 0
      case 'has_points':
        return (m.loyalty_points_balance || 0) > 0
      case 'never_redeemed':
        return (m.loyalty_total_redeemed || 0) === 0
      default:
        return true
    }
  })
}

// --- Sort Members ---

export const MEMBER_SORT_OPTIONS = [
  { key: 'points_desc', label: 'Poin Terbesar' },
  { key: 'spending_desc', label: 'Spending Terbesar' },
  { key: 'transactions_desc', label: 'Transaksi Terbanyak' },
  { key: 'newest', label: 'Terbaru' },
  { key: 'name_asc', label: 'Nama A-Z' },
]

export function sortMembers(members, sortKey) {
  const arr = [...members]
  switch (sortKey) {
    case 'points_desc':
      arr.sort((a, b) => (b.loyalty_points_balance || 0) - (a.loyalty_points_balance || 0))
      break
    case 'spending_desc':
      arr.sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
      break
    case 'transactions_desc':
      arr.sort((a, b) => (b.total_transactions || 0) - (a.total_transactions || 0))
      break
    case 'newest':
      arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      break
    case 'name_asc':
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'))
      break
    default:
      break
  }
  return arr
}

// --- Sort Rewards ---

export const REWARD_SORT_OPTIONS = [
  { key: 'points_asc', label: 'Poin Terendah' },
  { key: 'points_desc', label: 'Poin Tertinggi' },
  { key: 'newest', label: 'Terbaru' },
  { key: 'name_asc', label: 'Nama A-Z' },
]

export function sortRewards(rewards, sortKey) {
  const arr = [...rewards]
  switch (sortKey) {
    case 'points_asc':
      arr.sort((a, b) => (a.points_required || 0) - (b.points_required || 0))
      break
    case 'points_desc':
      arr.sort((a, b) => (b.points_required || 0) - (a.points_required || 0))
      break
    case 'newest':
      arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      break
    case 'name_asc':
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'))
      break
    default:
      break
  }
  return arr
}

// --- Search Rewards ---

export function searchRewards(rewards, query) {
  if (!query || !query.trim()) return rewards
  const q = query.trim().toLowerCase()
  return rewards.filter(r =>
    (r.name || '').toLowerCase().includes(q) ||
    (r.description || '').toLowerCase().includes(q)
  )
}

// --- Summary ---

export function calculateSummary(members, rewards, ledger) {
  let totalMembers = 0
  let activeMembers = 0
  let totalPoints = 0
  let totalRedeemed = 0
  let availableRewards = 0

  for (const m of members) {
    if (m.loyalty_is_member) totalMembers++
    if (m.loyalty_is_member && (m.total_transactions || 0) > 0) activeMembers++
    totalPoints += safeInt(m.loyalty_points_balance)
    totalRedeemed += safeInt(m.loyalty_total_redeemed)
  }

  for (const r of rewards) {
    if (isRewardAvailable(r)) availableRewards++
  }

  return {
    totalMembers,
    activeMembers,
    totalPoints,
    totalRedeemed,
    availableRewards,
  }
}

// --- Top Members ---

export function getTopMembers(members, limit = 5) {
  return [...members]
    .filter(m => m.loyalty_is_member && (m.loyalty_points_balance || 0) > 0)
    .sort((a, b) => (b.loyalty_points_balance || 0) - (a.loyalty_points_balance || 0))
    .slice(0, limit)
}

// --- Recent Activity ---

export function getRecentActivity(ledger, limit = 10) {
  return [...ledger]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, limit)
}

// --- Pagination ---

export const PAGE_SIZE = 20

export function paginate(items, page = 1, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.max(1, Math.min(page, totalPages))
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize
  return {
    items: items.slice(start, end),
    totalPages,
    currentPage,
    total: items.length,
  }
}

// --- Formatting ---

export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeNumber(amount))
}

export function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date + (date.includes('T') ? '' : 'T00:00:00'))
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatPoints(pts) {
  return `${safeInt(pts)} poin`
}
