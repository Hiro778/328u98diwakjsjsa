/**
 * Legal & Compliance utility functions.
 *
 * Handles: check status normalization, category config, query normalization,
 * validation, registration checklists.
 *
 * IMPORTANT: BisnisSehat does NOT have API access to Indonesian government
 * portals (OSS, BPOM, BPJPH, DJKI). All checks are Guided Official Check —
 * the system records the search and directs users to the correct portal.
 * BisnisSehat NEVER claims government verification.
 */

// ── Check Status Constants ──

export const LEGAL_CHECK_STATUS = {
  CHECKING: 'CHECKING',
  FOUND: 'FOUND',
  NOT_FOUND: 'NOT_FOUND',
  ERROR: 'ERROR',
  NEEDS_OFFICIAL_VERIFICATION: 'NEEDS_OFFICIAL_VERIFICATION',
}

export const CHECK_STATUS_CONFIG = {
  [LEGAL_CHECK_STATUS.CHECKING]: {
    label: 'Sedang mengecek',
    color: 'electric',
    bgClass: 'bg-electric-50',
    textClass: 'text-electric-600',
    borderClass: 'border-electric-200',
  },
  [LEGAL_CHECK_STATUS.FOUND]: {
    label: 'Ditemukan',
    color: 'profit',
    bgClass: 'bg-profit-50',
    textClass: 'text-profit-600',
    borderClass: 'border-profit-200',
  },
  [LEGAL_CHECK_STATUS.NOT_FOUND]: {
    label: 'Belum ditemukan',
    color: 'warm',
    bgClass: 'bg-warm-50',
    textClass: 'text-warm-500',
    borderClass: 'border-warm-200',
  },
  [LEGAL_CHECK_STATUS.ERROR]: {
    label: 'Kesalahan',
    color: 'red',
    bgClass: 'bg-red-50',
    textClass: 'text-red-600',
    borderClass: 'border-red-200',
  },
  [LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION]: {
    label: 'Perlu pengecekan',
    color: 'navy',
    bgClass: 'bg-navy-50',
    textClass: 'text-navy-600',
    borderClass: 'border-navy-200',
  },
}

// ── Category Constants ──

export const LEGAL_CATEGORY = {
  NIB: 'nib',
  PIRT: 'pirt',
  HALAL: 'halal',
  TRADEMARK: 'trademark',
}

export const CATEGORY_CONFIG = {
  [LEGAL_CATEGORY.NIB]: {
    label: 'NIB (Nomor Induk Berusaha)',
    shortLabel: 'NIB',
    portalKey: 'oss',
    description: 'Identitas usaha yang diterbitkan melalui sistem OSS.',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  [LEGAL_CATEGORY.PIRT]: {
    label: 'PIRT (Pangan Industri Rumah Tangga)',
    shortLabel: 'PIRT',
    portalKey: 'pirt',
    description: 'Izin edar produk makanan/minuman industri rumah tangga dari BPOM.',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  [LEGAL_CATEGORY.HALAL]: {
    label: 'Sertifikasi Halal',
    shortLabel: 'Halal',
    portalKey: 'halal',
    description: 'Sertifikasi halal produk dari BPJPH.',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  [LEGAL_CATEGORY.TRADEMARK]: {
    label: 'Merek Dagang',
    shortLabel: 'Merek',
    portalKey: 'djki',
    description: 'Pendaftaran merek dagang di DJKI.',
    icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  },
}

export const CATEGORY_PORTAL_MAP = {
  [LEGAL_CATEGORY.NIB]: 'oss',
  [LEGAL_CATEGORY.PIRT]: 'pirt',
  [LEGAL_CATEGORY.HALAL]: 'halal',
  [LEGAL_CATEGORY.TRADEMARK]: 'djki',
}

// ── Status Helpers ──

/**
 * Normalize a raw status string to a valid LEGAL_CHECK_STATUS key.
 * Returns NEEDS_OFFICIAL_VERIFICATION for unknown/empty values.
 */
export function normalizeCheckStatus(raw) {
  if (!raw || typeof raw !== 'string') return LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION
  const upper = raw.trim().toUpperCase()
  if (upper in LEGAL_CHECK_STATUS) return upper
  return LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION
}

/**
 * Get display config for a check status.
 */
export function getStatusConfig(status) {
  const normalized = normalizeCheckStatus(status)
  return CHECK_STATUS_CONFIG[normalized]
}

/**
 * Get status label in Indonesian.
 */
export function getStatusLabel(status) {
  return getStatusConfig(status).label
}

/**
 * Check if a status means action is needed (not found or needs portal verification).
 */
export function needsAction(status) {
  const normalized = normalizeCheckStatus(status)
  return (
    normalized === LEGAL_CHECK_STATUS.NOT_FOUND ||
    normalized === LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION
  )
}

// ── Query Helpers ──

/**
 * Normalize a search query: trim, lowercase, collapse whitespace.
 * Returns empty string for null/undefined/empty input.
 */
export function normalizeQuery(query) {
  if (!query || typeof query !== 'string') return ''
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Get portal key for a category.
 */
export function getCategoryPortalKey(category) {
  return CATEGORY_PORTAL_MAP[category] || ''
}

// ── Validation ──

/**
 * Validate NIB number format (basic check).
 * NIB is typically 13 digits from OSS system.
 * This only checks format, NOT government database.
 */
export function validateNibNumber(value) {
  if (!value || typeof value !== 'string') return { valid: true, error: null }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { valid: true, error: null }

  // Basic format check: alphanumeric, 10-20 chars
  if (!/^[A-Za-z0-9]{10,20}$/.test(trimmed)) {
    return { valid: false, error: 'Format NIB tidak valid. NIB biasanya berupa 13 digit angka.' }
  }
  return { valid: true, error: null }
}

/**
 * Validate PIRT number format.
 * PIRT typically starts with specific prefix + numbers.
 */
export function validatePirtNumber(value) {
  if (!value || typeof value !== 'string') return { valid: true, error: null }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { valid: true, error: null }

  if (trimmed.length < 5 || trimmed.length > 30) {
    return { valid: false, error: 'Format nomor PIRT tidak valid.' }
  }
  return { valid: true, error: null }
}

/**
 * Validate halal certificate number.
 */
export function validateHalalNumber(value) {
  if (!value || typeof value !== 'string') return { valid: true, error: null }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { valid: true, error: null }

  if (trimmed.length < 3 || trimmed.length > 30) {
    return { valid: false, error: 'Format nomor sertifikat halal tidak valid.' }
  }
  return { valid: true, error: null }
}

/**
 * Validate trademark/brand name.
 */
export function validateBrandName(value) {
  if (!value || typeof value !== 'string') return { valid: true, error: null }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { valid: true, error: null }

  if (trimmed.length < 2) {
    return { valid: false, error: 'Nama merek minimal 2 karakter.' }
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Nama merek maksimal 100 karakter.' }
  }
  return { valid: true, error: null }
}

/**
 * Validate a date string (YYYY-MM-DD).
 */
export function validateDate(value) {
  if (!value || typeof value !== 'string') return { valid: true, error: null }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { valid: true, error: null }

  const date = new Date(trimmed)
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Format tanggal tidak valid.' }
  }
  return { valid: true, error: null }
}

/**
 * Validate notes (max 500 chars).
 */
export function validateNotes(value) {
  if (!value || typeof value !== 'string') return { valid: true, error: null }
  if (value.length > 500) {
    return { valid: false, error: 'Catatan maksimal 500 karakter.' }
  }
  return { valid: true, error: null }
}

// ── Checklist Helpers ──

/**
 * Generate a checklist for NIB registration.
 * Returns array of { id, label, completed } items.
 */
export function getNibChecklist() {
  return [
    { id: 'prep_data', label: 'Siapkan data usaha (KTP, NPWP, akta pendirian)', completed: false },
    { id: 'portal_oss', label: 'Buka portal resmi OSS', completed: false },
    { id: 'create_account', label: 'Buat atau login akun OSS', completed: false },
    { id: 'business_profile', label: 'Isi profil usaha', completed: false },
    { id: 'business_activity', label: 'Isi data kegiatan usaha', completed: false },
    { id: 'nib_process', label: 'Ikuti proses penerbitan NIB', completed: false },
    { id: 'download_nib', label: 'Simpan/download dokumen NIB', completed: false },
  ]
}

/**
 * Generate a checklist for PIRT registration.
 */
export function getPirtChecklist() {
  return [
    { id: 'prep_data', label: 'Siapkan data produk makanan/minuman', completed: false },
    { id: 'lab_test', label: 'Lakukan uji laboratorium jika diperlukan', completed: false },
    { id: 'prep_docs', label: 'Siapkan dokumen persyaratan', completed: false },
    { id: 'portal_pom', label: 'Akses portal BPOM atau dinas kesehatan', completed: false },
    { id: 'submit', label: 'Ajukan pendaftaran PIRT', completed: false },
    { id: 'download', label: 'Simpan dokumen PIRT', completed: false },
  ]
}

/**
 * Generate a checklist for halal certification.
 */
export function getHalalChecklist() {
  return [
    { id: 'prep_data', label: 'Siapkan data produk dan bahan baku', completed: false },
    { id: 'prep_docs', label: 'Siapkan dokumen persyaratan', completed: false },
    { id: 'choose_lph', label: 'Pilih Lembaga Pemeriksa Halal (LPH)', completed: false },
    { id: 'portal_bpjph', label: 'Daftar di portal BPJPH', completed: false },
    { id: 'pemeriksaan', label: 'Ikuti proses pemeriksaan halal', completed: false },
    { id: 'download', label: 'Simpan sertifikat halal', completed: false },
  ]
}

/**
 * Generate a checklist for trademark registration.
 */
export function getTrademarkChecklist() {
  return [
    { id: 'brand_name', label: 'Tentukan nama merek yang ingin didaftarkan', completed: false },
    { id: 'search', label: 'Cek ketersediaan merek di portal DJKI', completed: false },
    { id: 'class', label: 'Tentukan kelas merek (Nice Classification)', completed: false },
    { id: 'prep_docs', label: 'Siapkan dokumen (logo, KTP, NPWP)', completed: false },
    { id: 'portal_djki', label: 'Daftar di portal DJKI', completed: false },
    { id: 'submit', label: 'Ajukan pendaftaran merek', completed: false },
    { id: 'download', label: 'Simpan bukti pendaftaran', completed: false },
  ]
}

/**
 * Get checklist for a category.
 */
export function getChecklistForCategory(category) {
  const map = {
    nib: getNibChecklist,
    pirt: getPirtChecklist,
    halal: getHalalChecklist,
    trademark: getTrademarkChecklist,
  }
  const fn = map[category]
  return fn ? fn() : []
}

// ── Disclaimer Text ──

export const DISCLAIMER = {
  general:
    'BisnisSehat membantu melakukan pengecekan awal. Hasil ini bukan verifikasi atau keputusan resmi pemerintah.',
  checkResult:
    'Pengecekan ini bersifat panduan awal. Untuk verifikasi resmi, silakan periksa langsung di portal pemerintah terkait.',
  noVerification:
    'Data ini berdasarkan catatan Anda, bukan verifikasi dari instansi pemerintah.',
  externalVerify:
    'Untuk verifikasi resmi, silakan periksa langsung di portal pemerintah terkait.',
  sourceCheck:
    'Pengecekan ini mencoba memeriksa beberapa sumber pemerintah. Jika sumber tidak tersedia, hasil menunjukkan "Perlu Ditinjau" dengan link portal resmi.',
  logoCheck:
    'Pemeriksaan ini membantu menemukan gambar atau logo yang memiliki kemiripan visual dengan logo Anda di internet. Hasil bersifat indikatif dan bukan merupakan penilaian atau kepastian hukum.',
}

// ── No-Claim Disclaimers (CRITICAL — never claim legal/safe) ──

export const NO_CLAIM_DISCLAIMERS = {
  sourceResult:
    'Hasil ini bersifat panduan awal berdasarkan sumber yang diperiksa. Bukan keputusan resmi pemerintah.',
  logoClean:
    'Tidak ditemukan kecocokan pada sumber yang diperiksa. Bukan jaminan bahwa logo aman untuk didaftarkan.',
  logoSimilarity:
    'Kemiripan ditemukan. Perlu ditinjau lebih lanjut. Bukan keputusan resmi.',
  neverRegister:
    'BisnisSehat tidak dapat memastikan apakah logo bisa didaftarkan. Hubungi DJKI atau konsultan hukum untuk kepastian hukum.',
}

// ══════════════════════════════════════════════════════════
// NEW: Source Check System (Legal & Brand Checker v2)
// ══════════════════════════════════════════════════════════

// ── Source Status Constants ──

export const LEGAL_SOURCE_STATUS = {
  TERKONFIRMASI: 'TERKONFIRMASI',
  DITEMUKAN: 'DITEMUKAN',
  TIDAK_DITEMUKAN: 'TIDAK_DITEMUKAN',
  PERLU_DITINJAU: 'PERLU_DITINJAU',
  TIDAK_RELEVAN: 'TIDAK_RELEVAN',
  GAGAL_DIPERIKSA: 'GAGAL_DIPERIKSA',
}

export const SOURCE_STATUS_CONFIG = {
  [LEGAL_SOURCE_STATUS.TERKONFIRMASI]: {
    label: 'Terkonfirmasi',
    color: 'profit',
    bgClass: 'bg-profit-50',
    textClass: 'text-profit-600',
    borderClass: 'border-profit-200',
    iconPath: 'M5 13l4 4L19 7',
  },
  [LEGAL_SOURCE_STATUS.DITEMUKAN]: {
    label: 'Ditemukan',
    color: 'profit',
    bgClass: 'bg-profit-50',
    textClass: 'text-profit-600',
    borderClass: 'border-profit-200',
    iconPath: 'M5 13l4 4L19 7',
  },
  [LEGAL_SOURCE_STATUS.TIDAK_DITEMUKAN]: {
    label: 'Tidak Ditemukan',
    color: 'warm',
    bgClass: 'bg-warm-50',
    textClass: 'text-warm-500',
    borderClass: 'border-warm-200',
    iconPath: 'M20 12H4',
  },
  [LEGAL_SOURCE_STATUS.PERLU_DITINJAU]: {
    label: 'Perlu Ditinjau',
    color: 'navy',
    bgClass: 'bg-navy-50',
    textClass: 'text-navy-600',
    borderClass: 'border-navy-200',
    iconPath: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  },
  [LEGAL_SOURCE_STATUS.TIDAK_RELEVAN]: {
    label: 'Tidak Relevan',
    color: 'gray',
    bgClass: 'bg-gray-50',
    textClass: 'text-gray-500',
    borderClass: 'border-gray-200',
    iconPath: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  },
  [LEGAL_SOURCE_STATUS.GAGAL_DIPERIKSA]: {
    label: 'Gagal Diperiksa',
    color: 'red',
    bgClass: 'bg-red-50',
    textClass: 'text-red-600',
    borderClass: 'border-red-200',
    iconPath: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
  },
}

// ── Source Constants ──

export const LEGAL_SOURCE = {
  OSS: 'oss',
  AHU: 'ahu',
  DJKI: 'djki',
  BPOM: 'bpom',
  BPJPH: 'bpjph',
}

export const SOURCE_CONFIG = {
  [LEGAL_SOURCE.OSS]: {
    label: 'OSS (Online Single Submission)',
    shortLabel: 'OSS',
    portalKey: 'oss',
    description: 'Penyediaan NIB dan perizinan berusaha',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    detailLabels: {
      nib: 'NIB',
      nama_usaha: 'Nama Usaha',
      status_usaha: 'Status Usaha',
    },
  },
  [LEGAL_SOURCE.AHU]: {
    label: 'AHU (Administrasi Hukum Umum)',
    shortLabel: 'AHU',
    portalKey: 'ahu',
    description: 'Pengecekan badan usaha dan nama perusahaan',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    detailLabels: {
      nama_badan_usaha: 'Nama Badan Usaha',
      jenis_badan_usaha: 'Jenis Badan Usaha',
      status: 'Status',
    },
  },
  [LEGAL_SOURCE.DJKI]: {
    label: 'DJKI (Direktorat Jenderal Kekayaan Intelektual)',
    shortLabel: 'Merek',
    portalKey: 'djki',
    description: 'Pengecekan pendaftaran merek dagang',
    icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
    detailLabels: {
      nama_merek: 'Nama Merek',
      status: 'Status',
      kelas: 'Kelas',
      nomor: 'Nomor',
      pemilik: 'Pemilik',
      jumlah_hasil: 'Jumlah Hasil',
    },
  },
  [LEGAL_SOURCE.BPOM]: {
    label: 'BPOM (Badan Pengawas Obat dan Makanan)',
    shortLabel: 'BPOM',
    portalKey: 'pirt',
    description: 'Pengecekan produk makanan, obat, dan kosmetik',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    detailLabels: {
      nama_produk: 'Nama Produk',
      nomor_registrasi: 'Nomor Registrasi',
      pendaftar: 'Pendaftar',
      jumlah_hasil: 'Jumlah Hasil',
    },
  },
  [LEGAL_SOURCE.BPJPH]: {
    label: 'BPJPH (Badan Penyelenggara Jaminan Produk Halal)',
    shortLabel: 'Halal',
    portalKey: 'halal',
    description: 'Pengecekan sertifikasi halal',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    detailLabels: {
      status_sertifikasi: 'Status Sertifikasi',
      produk: 'Produk',
      pelaku_usaha: 'Pelaku Usaha',
      nomor_sertifikat: 'Nomor Sertifikat',
    },
  },
}

// All sources list
export const ALL_SOURCES = ['oss', 'ahu', 'djki', 'bpom', 'bpjph']

// ── Logo Check Constants ──

export const LOGO_MATCH_TYPE = {
  EXACT_MATCH: 'exact_match',
  PARTIAL_MATCH: 'partial_match',
  VISUALLY_SIMILAR: 'visually_similar',
  WEB_PAGE_MATCH: 'web_page_match',
}

export const LOGO_MATCH_CONFIG = {
  [LOGO_MATCH_TYPE.EXACT_MATCH]: {
    label: 'Cocok Penuh',
    description: 'Gambar identik atau hampir identik ditemukan',
    color: 'red',
    bgClass: 'bg-red-50',
    textClass: 'text-red-600',
    borderClass: 'border-red-200',
  },
  [LOGO_MATCH_TYPE.PARTIAL_MATCH]: {
    label: 'Cocok Sebagian',
    description: 'Elemen logo yang mirip ditemukan',
    color: 'warm',
    bgClass: 'bg-warm-50',
    textClass: 'text-warm-500',
    borderClass: 'border-warm-200',
  },
  [LOGO_MATCH_TYPE.VISUALLY_SIMILAR]: {
    label: 'Mirip Secara Visual',
    description: 'Gambar dengan kemiripan visual ditemukan',
    color: 'electric',
    bgClass: 'bg-electric-50',
    textClass: 'text-electric-600',
    borderClass: 'border-electric-200',
  },
  [LOGO_MATCH_TYPE.WEB_PAGE_MATCH]: {
    label: 'Cocok di Halaman Web',
    description: 'Gambar muncul di halaman web tertentu',
    color: 'navy',
    bgClass: 'bg-navy-50',
    textClass: 'text-navy-600',
    borderClass: 'border-navy-200',
  },
}

export const LOGO_CHECK_STATUS = {
  CHECKING: 'CHECKING',
  CLEAN: 'CLEAN',
  HAS_SIMILARITY: 'HAS_SIMILARITY',
  ERROR: 'ERROR',
}

export const LOGO_CHECK_STATUS_CONFIG = {
  [LOGO_CHECK_STATUS.CLEAN]: {
    label: 'Tidak ditemukan kecocokan kuat',
    description: 'Tidak ditemukan kecocokan pada sumber yang diperiksa.',
    color: 'profit',
    bgClass: 'bg-profit-50',
    textClass: 'text-profit-600',
    borderClass: 'border-profit-200',
    iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  [LOGO_CHECK_STATUS.HAS_SIMILARITY]: {
    label: 'Ditemukan kemiripan',
    description: 'Ditemukan hasil yang memiliki kemiripan dan perlu ditinjau.',
    color: 'warm',
    bgClass: 'bg-warm-50',
    textClass: 'text-warm-500',
    borderClass: 'border-warm-200',
    iconPath: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  },
  [LOGO_CHECK_STATUS.ERROR]: {
    label: 'Gagal memeriksa',
    description: 'Terjadi kesalahan saat analisis logo.',
    color: 'red',
    bgClass: 'bg-red-50',
    textClass: 'text-red-600',
    borderClass: 'border-red-200',
    iconPath: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  },
  [LOGO_CHECK_STATUS.CHECKING]: {
    label: 'Sedang menganalisis',
    description: '',
    color: 'electric',
    bgClass: 'bg-electric-50',
    textClass: 'text-electric-600',
    borderClass: 'border-electric-200',
    iconPath: '',
  },
}

// ── Source Helpers ──

/**
 * Get source results map from results array (keyed by category/source).
 */
export function getSourceResultsMap(results) {
  const map = {}
  for (const r of results) {
    map[r.category] = r
  }
  return map
}

/**
 * Count results by status.
 */
export function countByStatus(results, status) {
  return results.filter((r) => r.status === status).length
}

/**
 * Check if product category triggers BPOM check.
 */
export function isBPOMRelevant(category) {
  if (!category) return false
  const relevant = ['makanan', 'minuman', 'obat', 'kosmetik', 'suplemen', 'pangan', 'produk']
  return relevant.some((r) => category.toLowerCase().includes(r))
}

/**
 * Get source status config by status string.
 */
export function getSourceStatusConfig(status) {
  return SOURCE_STATUS_CONFIG[status] || SOURCE_STATUS_CONFIG[LEGAL_SOURCE_STATUS.PERLU_DITINJAU]
}

/**
 * Get logo match config by match type.
 */
export function getLogoMatchConfig(type) {
  return LOGO_MATCH_CONFIG[type] || null
}

/**
 * Get logo check status config.
 */
export function getLogoCheckStatusConfig(status) {
  return LOGO_CHECK_STATUS_CONFIG[status] || LOGO_CHECK_STATUS_CONFIG[LOGO_CHECK_STATUS.CHECKING]
}
