/**
 * Centralized official government portal links for Legal & Compliance tools.
 *
 * All URLs are verified official government portals.
 * Update here instead of across multiple components.
 *
 * IMPORTANT: BisnisSehat is NOT a government portal and has NO official API
 * integrations with these systems. These links are for user guidance only.
 */

export const LEGAL_LINKS = {
  // OSS (Online Single Submission) - NIB registration
  oss: {
    url: 'https://oss.go.id',
    label: 'Portal OSS (Online Single Submission)',
    description: 'Portal resmi untuk pendaftaran NIB (Nomor Induk Berusaha)',
  },

  // AHU (Administrasi Hukum Umum) - Business name check
  ahu: {
    url: 'https://ahu.go.id',
    label: 'Portal AHU (Administrasi Hukum Umum)',
    description: 'Portal resmi untuk pengecekan nama badan hukum',
  },

  // PIRT (Pendaftaran Industri Rumah Tangga)
  pirt: {
    url: 'https://pom.go.id',
    label: 'Portal BPOM (Badan Pengawas Obat dan Makanan)',
    description: 'Portal resmi untuk informasi PIRT dan pangan',
  },

  // Halal certification
  halal: {
    url: 'https://halal.go.id',
    label: 'Portal BPJPH (Badan Penyelenggara Jaminan Produk Halal)',
    description: 'Portal resmi untuk sertifikasi halal',
  },

  // Trademark registration - DJKI
  djki: {
    url: 'https://djki.go.id',
    label: 'Portal DJKI (Direktorat Jenderal Kekayaan Intelektual)',
    description: 'Portal resmi untuk pendaftaran merek dagang',
  },

  // PDKI (Pencarian Merek Dagang) - trademark search
  pdki: {
    url: 'https://pdki.djki.go.id',
    label: 'Portal PDKI (Pencarian Merek Dagang)',
    description: 'Portal resmi untuk pencarian merek dagang di DJKI',
  },

  // General business licensing info
  ossHelp: {
    url: 'https://oss.go.id/halaman/panduan',
    label: 'Panduan OSS',
    description: 'Panduan penggunaan portal OSS',
  },
}

/**
 * Get a link by key. Returns null if not found.
 */
export function getLegalLink(key) {
  return LEGAL_LINKS[key] || null
}

/**
 * Get the URL for a specific link key. Returns empty string if not found.
 */
export function getLegalUrl(key) {
  const link = LEGAL_LINKS[key]
  return link ? link.url : ''
}
