/**
 * Format an order number with BS prefix.
 * @param {number} orderNumber - The serial order number from the database
 * @returns {string} e.g. "BS-10291"
 */
export function formatOrderNumber(orderNumber) {
  return `BS-${orderNumber}`
}

/**
 * Format currency in Indonesian Rupiah.
 * @param {number} amount
 * @returns {string} e.g. "Rp130.000"
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format a date to Indonesian locale.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format a date+time to Indonesian locale.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
