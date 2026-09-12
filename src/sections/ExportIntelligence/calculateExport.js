const DEST_MULTIPLIERS = { SG: 1.18, MY: 1.15, JP: 1.23, DE: 1.31, US: 1.27 }
const INCOTERM_COST = { FOB: 0.12, CIF: 0.16, EXW: 0.08, DDP: 0.22 }
const SHIPPING_COST = { sea: 0.04, air: 0.12, land: 0.06 }

const HS_CODES = {
  kopi: '0901.11.00',
  cokelat: '1801.00.00',
  rempah: '0910.99.00',
  tekstil: '6204.62.00',
  kerajinan: '4602.19.00',
  lainnya: '9999.00.00',
}

const DUTY_RATES = {
  SG: { kopi: 0, cokelat: 0, rempah: 0, tekstil: 5, kerajinan: 0 },
  MY: { kopi: 0, cokelat: 0, rempah: 5, tekstil: 10, kerajinan: 5 },
  JP: { kopi: 0, cokelat: 10, rempah: 5, tekstil: 8, kerajinan: 0 },
  DE: { kopi: 7.5, cokelat: 8, rempah: 10, tekstil: 12, kerajinan: 4.7 },
  US: { kopi: 0, cokelat: 5, rempah: 5, tekstil: 16, kerajinan: 0 },
}

const LEAD_TIMES = { sea: '14-30 hari', air: '3-7 hari', land: '7-14 hari' }

const RISK_NOTES = {
  SG: 'Pasar kompetitif. Pastikan sertifikasi halal aktif.',
  MY: 'Proses bea masuk relatif mudah. Cek regulasi MESTI.',
  JP: 'Kualitas sangat diutamakan. Siapkan sertifikasi JAS.',
  DE: 'Regulasi EU ketat. Pastikan compliance CE dan traceability.',
  US: 'FDA registration mungkin diperlukan. Periksa FSVP.',
}

export function calculateExport(product, config) {
  const { quantity, destination, incoterm, shipping } = config
  const productionTotal = product.hpp * quantity
  const destMult = DEST_MULTIPLIERS[destination] || 1.2
  const revenue = productionTotal * destMult
  const exportCost = productionTotal * (INCOTERM_COST[incoterm] + SHIPPING_COST[shipping])
  const totalCost = productionTotal + exportCost
  const profit = revenue - totalCost
  const margin = (profit / revenue) * 100

  const category = product.category || 'lainnya'

  return {
    revenue: Math.round(revenue),
    exportCost: Math.round(exportCost),
    totalCost: Math.round(totalCost),
    profit: Math.round(profit),
    margin: Math.round(margin * 10) / 10,
    hsCode: HS_CODES[category] || '9999.00.00',
    dutyRate: DUTY_RATES[destination]?.[category] ?? 5,
    leadTime: LEAD_TIMES[shipping] || '14-30 hari',
    riskNotes: RISK_NOTES[destination] || 'Periksa regulasi importir tujuan.',
  }
}
