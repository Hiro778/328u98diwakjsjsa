// src/config/supportConfig.js
// BisnisSehat Customer Support & Help Center Configuration
// Fully conforming to bug.md specification (Email-first Bug Reporting & Rules)

export const OFFICIAL_SUPPORT_EMAIL = 'support@bisnissehat.id'

export const BUG_REPORT_TEMPLATE = {
  subject: '[BisnisSehat Bug Report]',
  createBody(feature = '') {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Perangkat / Browser'
    return `Halo Tim BisnisSehat,

Saya ingin melaporkan bug.

Fitur:
${feature ? feature : '[isi fitur]'}

Masalah:
[jelaskan masalah]

Langkah reproduksi:
1. 
2. 
3. 

Hasil yang diharapkan:
...

Hasil yang terjadi:
...

Browser/device:
${ua}

Terima kasih.`
  },
  createMailtoUrl(feature = '', emailOverride = null, platformOverride = null) {
    const targetEmail = emailOverride || OFFICIAL_SUPPORT_EMAIL
    const subject = platformOverride ? `[${platformOverride} Bug Report]` : this.subject
    const subjectParam = encodeURIComponent(subject)
    const bodyParam = encodeURIComponent(this.createBody(feature))
    return `mailto:${targetEmail}?subject=${subjectParam}&body=${bodyParam}`
  },
}

export const SUPPORT_CONFIG = {
  // Official Authoritative Support Email
  email: {
    address: OFFICIAL_SUPPORT_EMAIL,
    label: OFFICIAL_SUPPORT_EMAIL,
    subject: BUG_REPORT_TEMPLATE.subject,
    getBugReportUrl(feature) {
      return BUG_REPORT_TEMPLATE.createMailtoUrl(feature)
    },
  },

  // FAQ & Help Center metadata
  faq: {
    label: 'Pusat Bantuan & FAQ',
    url: '/dashboard/bantuan',
    description: 'Panduan penggunaan tools, akun, subscription, dan troubleshooting.',
  },

  // Bug report metadata
  bugReport: {
    label: 'Lapor Bug via Email',
    description: 'Laporkan kendala teknis atau anomali sistem langsung ke tim pengembang.',
    getMailtoUrl: (feature) => BUG_REPORT_TEMPLATE.createMailtoUrl(feature),
  },
}
