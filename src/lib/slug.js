/**
 * Generate a URL-friendly slug from a business name.
 * Appends a short random suffix to ensure uniqueness.
 */
export function generateSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const suffix = Math.random().toString(36).substring(2, 6)
  return `${base}-${suffix}`
}

/**
 * Validate that a slug is properly formatted.
 */
export function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
}
