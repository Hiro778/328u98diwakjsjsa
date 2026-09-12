/**
 * Loan Simulation Calculation Engine
 *
 * Pure function — no side effects, no Supabase, no React.
 * Supports three repayment methods: Flat, Effective (Diminishing), Annuity.
 *
 * All outputs are finite numbers. No NaN, no Infinity.
 */

const MAX_MONETARY = 9_999_999_999_999.99
const round2 = (n) => Math.round(n * 100) / 100

export const LOAN_METHODS = {
  flat: 'Flat',
  effective: 'Efektif',
  annuity: 'Anuitas',
}

export const TENOR_UNITS = {
  months: 'Bulan',
  years: 'Tahun',
}

// ─── Validation ───────────────────────────────────────────────

function validateInput(input) {
  const {
    principal,
    annualInterestRate,
    tenorMonths,
    adminFee = 0,
    provisionRate = 0,
    otherFee = 0,
  } = input || {}

  const errors = []

  const p = Number(principal)
  if (!Number.isFinite(p) || p <= 0) errors.push('Jumlah pinjaman harus lebih dari 0')
  if (p > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')

  const rate = Number(annualInterestRate)
  if (!Number.isFinite(rate)) errors.push('Suku bunga tidak valid')
  if (Number.isFinite(rate) && rate < 0) errors.push('Suku bunga tidak boleh negatif')
  if (Number.isFinite(rate) && rate > 100) errors.push('Suku bunga maksimal 100%')

  const tenor = Number(tenorMonths)
  if (!Number.isFinite(tenor) || tenor <= 0) errors.push('Tenor harus lebih dari 0')
  if (Number.isFinite(tenor) && tenor !== Math.floor(tenor)) errors.push('Tenor harus bilangan bulat')

  const admin = Number(adminFee)
  if (!Number.isFinite(admin) || admin < 0) errors.push('Biaya administrasi tidak valid')

  const prov = Number(provisionRate)
  if (!Number.isFinite(prov) || prov < 0) errors.push('Biaya provisi tidak valid')
  if (Number.isFinite(prov) && prov > 100) errors.push('Biaya provisi maksimal 100%')

  const other = Number(otherFee)
  if (!Number.isFinite(other) || other < 0) errors.push('Biaya lain tidak valid')

  return errors
}

// ─── Flat Method ─────────────────────────────────────────────

function calculateFlat(principal, monthlyRate, tenorMonths) {
  // Flat: interest per month = principal * annualRate / 12 = principal * monthlyRate
  const interestPerMonth = principal * monthlyRate
  const principalPerMonth = principal / tenorMonths
  const paymentPerMonth = principalPerMonth + interestPerMonth

  const schedule = []
  let balance = principal

  for (let i = 1; i <= tenorMonths; i++) {
    const opening = balance
    const princPay = i === tenorMonths ? round2(balance) : round2(principalPerMonth)
    const intPay = round2(interestPerMonth)
    const pay = round2(princPay + intPay)
    balance = round2(balance - princPay)

    // Ensure final balance is exactly 0
    if (i === tenorMonths) balance = 0

    schedule.push({
      period: i,
      openingBalance: round2(opening),
      payment: pay,
      principalPayment: princPay,
      interestPayment: intPay,
      closingBalance: balance,
    })
  }

  const totalInterest = round2(interestPerMonth * tenorMonths)
  const totalInstallments = round2(paymentPerMonth * tenorMonths)

  return {
    schedule,
    monthlyPayment: round2(paymentPerMonth),
    firstPayment: round2(paymentPerMonth),
    lastPayment: round2(paymentPerMonth),
    totalInterest,
    totalInstallments,
  }
}

// ─── Effective (Diminishing) Method ──────────────────────────

function calculateEffective(principal, monthlyRate, tenorMonths) {
  const principalPerMonth = principal / tenorMonths
  const schedule = []
  let balance = principal
  let totalInterest = 0

  for (let i = 1; i <= tenorMonths; i++) {
    const opening = balance
    const princPay = i === tenorMonths ? round2(balance) : round2(principalPerMonth)
    const intPay = round2(opening * monthlyRate)
    const pay = round2(princPay + intPay)
    balance = round2(opening - princPay)

    if (i === tenorMonths) balance = 0

    totalInterest += intPay

    schedule.push({
      period: i,
      openingBalance: round2(opening),
      payment: pay,
      principalPayment: princPay,
      interestPayment: intPay,
      closingBalance: balance,
    })
  }

  totalInterest = round2(totalInterest)
  const totalInstallments = round2(schedule.reduce((s, r) => s + r.payment, 0))

  return {
    schedule,
    monthlyPayment: schedule[0]?.payment || 0,
    firstPayment: schedule[0]?.payment || 0,
    lastPayment: schedule[schedule.length - 1]?.payment || 0,
    totalInterest,
    totalInstallments,
  }
}

// ─── Annuity Method ──────────────────────────────────────────

function calculateAnnuity(principal, monthlyRate, tenorMonths) {
  let paymentPerMonth

  if (monthlyRate === 0) {
    paymentPerMonth = principal / tenorMonths
  } else {
    const factor = Math.pow(1 + monthlyRate, tenorMonths)
    paymentPerMonth = principal * monthlyRate * factor / (factor - 1)
  }

  const schedule = []
  let balance = principal
  let totalInterest = 0

  for (let i = 1; i <= tenorMonths; i++) {
    const opening = balance
    const intPay = round2(opening * monthlyRate)
    let princPay

    if (i === tenorMonths) {
      // Final period: pay off remaining balance
      princPay = round2(balance)
      balance = 0
    } else {
      princPay = round2(paymentPerMonth - intPay)
      balance = round2(opening - princPay)
    }

    const pay = i === tenorMonths ? round2(princPay + intPay) : round2(paymentPerMonth)

    totalInterest += intPay

    schedule.push({
      period: i,
      openingBalance: round2(opening),
      payment: pay,
      principalPayment: princPay,
      interestPayment: intPay,
      closingBalance: balance,
    })
  }

  totalInterest = round2(totalInterest)
  const totalInstallments = round2(schedule.reduce((s, r) => s + r.payment, 0))

  return {
    schedule,
    monthlyPayment: round2(paymentPerMonth),
    firstPayment: schedule[0]?.payment || 0,
    lastPayment: schedule[schedule.length - 1]?.payment || 0,
    totalInterest,
    totalInstallments,
  }
}

// ─── Main Calculation ────────────────────────────────────────

export function calculateLoanSimulation(input) {
  const {
    principal: rawPrincipal,
    annualInterestRate: rawRate,
    tenorMonths: rawTenor,
    method = 'annuity',
    adminFee: rawAdmin = 0,
    provisionRate: rawProvision = 0,
    otherFee: rawOther = 0,
  } = input || {}

  const errors = validateInput(input)

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      principal: 0,
      annualInterestRate: 0,
      monthlyInterestRate: 0,
      tenorMonths: 0,
      method,
      monthlyPayment: 0,
      firstPayment: 0,
      lastPayment: 0,
      totalPrincipal: 0,
      totalInterest: 0,
      totalFees: 0,
      totalPayment: 0,
      effectiveTotalCost: 0,
      amortizationSchedule: [],
    }
  }

  const principal = Number(rawPrincipal)
  const annualRate = Number(rawRate) / 100 // convert percentage to decimal
  const monthlyRate = annualRate / 12
  const tenor = Number(rawTenor)
  const adminFee = Number(rawAdmin)
  const provisionRate = Number(rawProvision) / 100
  const otherFee = Number(rawOther)

  // Fees (separate from interest)
  const provisionFee = round2(principal * provisionRate)
  const totalFees = round2(adminFee + provisionFee + otherFee)

  // Calculate by method
  let result
  const methodKey = method === 'effective' ? 'effective' : method === 'flat' ? 'flat' : 'annuity'

  if (methodKey === 'flat') {
    result = calculateFlat(principal, monthlyRate, tenor)
  } else if (methodKey === 'effective') {
    result = calculateEffective(principal, monthlyRate, tenor)
  } else {
    result = calculateAnnuity(principal, monthlyRate, tenor)
  }

  const totalPayment = round2(result.totalInstallments + totalFees)
  const effectiveTotalCost = round2(totalPayment - principal)

  return {
    isValid: true,
    errors: [],
    principal: round2(principal),
    annualInterestRate: round2(Number(rawRate)),
    monthlyInterestRate: round2(monthlyRate * 100), // as percentage for display
    tenorMonths: tenor,
    method: methodKey,

    monthlyPayment: result.monthlyPayment,
    firstPayment: result.firstPayment,
    lastPayment: result.lastPayment,

    totalPrincipal: round2(principal),
    totalInterest: result.totalInterest,
    totalInstallments: result.totalInstallments,
    totalFees,
    totalPayment,
    effectiveTotalCost,

    amortizationSchedule: result.schedule,
  }
}

/**
 * Compare all three methods for the same loan parameters.
 */
export function compareLoanMethods(input) {
  const methods = ['flat', 'effective', 'annuity']
  return methods.map(m => {
    const result = calculateLoanSimulation({ ...input, method: m })
    return {
      method: m,
      methodName: LOAN_METHODS[m],
      isValid: result.isValid,
      firstPayment: result.firstPayment,
      lastPayment: result.lastPayment,
      totalInterest: result.totalInterest,
      totalPayment: result.totalPayment,
      effectiveTotalCost: result.effectiveTotalCost,
    }
  })
}
