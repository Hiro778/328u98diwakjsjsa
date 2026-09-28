/**
 * adsCalculatorEngine.js
 * Centralized Deterministic Calculation Engine for BisnisSehat Ads
 * 
 * Rules:
 * - 100% Pure calculation & deterministic
 * - Zero LLM / AI / API / Database / Network calls
 * - No premature rounding in calculation chain (rounding only for display)
 * - Missing data is NOT zero (returns null / unavailable flag)
 * - Separates Budget from Actual Ad Spend strictly
 */

export const UNAVAILABLE_LABEL = 'Data tidak tersedia';

/**
 * Threshold for revenue consistency warning (calc.md Requirement 3).
 * A 25% relative difference accounts for realistic variance such as bulk discounts,
 * bundling, multi-item carts (AOV variation), or minor shipping adjustments.
 */
export const REVENUE_CONSISTENCY_THRESHOLD = 0.25;

/**
 * Validates numeric input
 * @param {*} val
 * @param {string} fieldName
 * @param {boolean} allowZero
 * @param {boolean} allowNegative
 */
function validateNumber(val, fieldName, allowZero = true, allowNegative = false) {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  if (Number.isNaN(num)) {
    throw new Error(`Input ${fieldName} harus berupa angka valid.`);
  }
  if (!allowNegative && num < 0) {
    throw new Error(`Input ${fieldName} tidak boleh negatif (${num}).`);
  }
  if (!allowZero && num === 0) {
    throw new Error(`Input ${fieldName} harus lebih besar dari nol.`);
  }
  return num;
}

/**
 * Main calculation engine
 * @param {Object} input
 * @returns {Object} Deterministic calculation result
 */
export function calculateAdsEconomics(input = {}) {
  const errors = [];

  // ==========================================
  // STAGE 1: Pre-Campaign Unit Economics
  // ==========================================
  let sellingPrice = null;
  let cogs = null;
  let variableFee = null;
  let targetMargin = null;

  try {
    sellingPrice = validateNumber(input.sellingPrice, 'Harga Jual', false, false);
    if (sellingPrice === null) {
      errors.push('Harga Jual wajib diisi dan harus lebih dari 0.');
    }
  } catch (err) {
    errors.push(err.message);
  }

  try {
    cogs = validateNumber(input.cogs, 'HPP', true, false);
    if (cogs === null) {
      errors.push('HPP wajib diisi.');
    }
  } catch (err) {
    errors.push(err.message);
  }

  try {
    variableFee = validateNumber(input.variableFee, 'Biaya Variabel', true, false);
    if (variableFee === null) {
      errors.push('Biaya Variabel wajib diisi.');
    }
  } catch (err) {
    errors.push(err.message);
  }

  // Target margin validation (optional)
  if (input.targetMargin !== undefined && input.targetMargin !== null && input.targetMargin !== '') {
    try {
      const tm = validateNumber(input.targetMargin, 'Target Margin', true, false);
      // If targetMargin passed as percent > 1 (e.g., 20 for 20%), convert to 0.20
      // If passed as 0.20, keep 0.20
      const decimal = tm > 1 ? tm / 100 : tm;
      if (decimal >= 1.0) {
        errors.push('Target margin harus kurang dari 100% (1.0).');
      } else {
        targetMargin = decimal;
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  // If critical stage 1 errors exist, return early error state
  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings: [],
      stage1: null,
      stage2: null,
      status: null,
      conclusion: 'Data belum cukup untuk menarik kesimpulan.',
    };
  }

  // 1. Contribution per order
  const contribution = sellingPrice - cogs - variableFee;

  // 2. Break-even CPA
  const breakEvenCpa = contribution;

  // 3. Break-even ROAS (only if breakEvenCpa > 0)
  const breakEvenRoas = breakEvenCpa > 0 ? sellingPrice / breakEvenCpa : null;

  // 4. Target Profit, Target CPA, Target ROAS
  let targetProfit = null;
  let targetCpa = null;
  let targetRoas = null;
  let targetCpaValid = true;
  let targetCpaWarning = null;

  if (targetMargin !== null) {
    targetProfit = sellingPrice * targetMargin;
    targetCpa = contribution - targetProfit;

    if (targetCpa <= 0) {
      targetCpaValid = false;
      targetCpaWarning = 'Target margin terlalu tinggi untuk struktur biaya ini';
      targetCpa = null;
      targetRoas = null;
    } else {
      targetRoas = sellingPrice / targetCpa;
    }
  }

  const stage1 = {
    sellingPrice,
    cogs,
    variableFee,
    targetMargin,
    contribution,
    breakEvenCpa,
    breakEvenRoas,
    targetProfit,
    targetCpa,
    targetRoas,
    targetCpaValid,
    targetCpaWarning,
  };

  // ==========================================
  // STAGE 2: Campaign Actual Data
  // ==========================================
  let budget = null;
  let actualAdSpend = null;
  let impressions = null;
  let clicks = null;
  let conversions = null;
  let revenue = null;

  try {
    budget = validateNumber(input.budget, 'Budget Iklan', true, false);
  } catch (err) {
    errors.push(err.message);
  }

  try {
    actualAdSpend = validateNumber(input.actualAdSpend, 'Actual Ad Spend', true, false);
  } catch (err) {
    errors.push(err.message);
  }

  try {
    impressions = validateNumber(input.impressions, 'Impressions', true, false);
  } catch (err) {
    errors.push(err.message);
  }

  try {
    clicks = validateNumber(input.clicks, 'Clicks', true, false);
  } catch (err) {
    errors.push(err.message);
  }

  try {
    conversions = validateNumber(input.conversions !== undefined ? input.conversions : input.orders, 'Conversions', true, false);
  } catch (err) {
    errors.push(err.message);
  }

  try {
    revenue = validateNumber(input.actualRevenue !== undefined ? input.actualRevenue : input.revenue, 'Revenue', true, false);
  } catch (err) {
    errors.push(err.message);
  }

  let totalStoreRevenue = null;
  try {
    totalStoreRevenue = validateNumber(input.totalStoreRevenue !== undefined ? input.totalStoreRevenue : input.storeRevenue, 'Total Store Revenue', true, false);
  } catch (err) {
    errors.push(err.message);
  }

  // Cross field validations for Stage 2
  if (clicks !== null && conversions !== null && conversions > clicks) {
    errors.push(`Jumlah konversi (${conversions}) tidak boleh melebihi jumlah klik (${clicks}).`);
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings: [],
      stage1,
      stage2: null,
      status: null,
      conclusion: 'Data belum cukup untuk menarik kesimpulan.',
    };
  }

  // ==========================================
  // INPUT CONSISTENCY WARNING (calc.md Requirement 3)
  // Check if actualRevenue differs materially from expectedRevenue = sellingPrice * conversions
  // ==========================================
  const warnings = [];

  if (sellingPrice !== null && conversions !== null && revenue !== null) {
    const expectedRevenue = sellingPrice * conversions;
    let isMateriallyDifferent = false;

    if (expectedRevenue === 0 && revenue > 0) {
      isMateriallyDifferent = true;
    } else if (expectedRevenue > 0 && revenue === 0) {
      isMateriallyDifferent = true;
    } else if (expectedRevenue > 0) {
      const relativeDiff = Math.abs(revenue - expectedRevenue) / expectedRevenue;
      if (relativeDiff > REVENUE_CONSISTENCY_THRESHOLD) {
        isMateriallyDifferent = true;
      }
    }

    if (isMateriallyDifferent) {
      warnings.push(
        'Revenue Aktual berbeda cukup jauh dari estimasi Harga Jual × Conversion. Periksa kembali input Anda.'
      );
    }
  }

  // Calculations for Stage 2 (Missing data is strictly null, not zero)
  // Actual CPC (requires actualAdSpend > 0 & clicks > 0)
  const actualCpc = (actualAdSpend !== null && actualAdSpend > 0 && clicks !== null && clicks > 0)
    ? actualAdSpend / clicks
    : null;

  // Actual CVR (requires clicks > 0 & conversions >= 0)
  const actualCvr = (clicks !== null && clicks > 0 && conversions !== null)
    ? conversions / clicks
    : null;

  // Actual CPA (requires actualAdSpend > 0 & conversions > 0)
  // CRITICAL: Budget must NOT be used for Actual CPA!
  const actualCpa = (actualAdSpend !== null && actualAdSpend > 0 && conversions !== null && conversions > 0)
    ? actualAdSpend / conversions
    : null;

  // Actual ROAS (requires actualAdSpend > 0 & revenue !== null)
  // CRITICAL: Budget must NOT be used for Actual ROAS!
  const actualRoas = (actualAdSpend !== null && actualAdSpend > 0 && revenue !== null)
    ? revenue / actualAdSpend
    : null;

  // ACOS = Actual Ad Spend / Attributed Revenue (calc.md Requirement 2)
  const acos = (actualAdSpend !== null && revenue !== null && revenue > 0)
    ? actualAdSpend / revenue
    : null;

  // TACOS = Total Ad Spend / Total Store Revenue (only when Total Store Revenue is provided)
  const tacos = (actualAdSpend !== null && totalStoreRevenue !== null && totalStoreRevenue > 0)
    ? actualAdSpend / totalStoreRevenue
    : null;

  // CPA Headroom
  const cpaHeadroom = (actualCpa !== null && breakEvenCpa !== null)
    ? breakEvenCpa - actualCpa
    : null;

  const targetCpaHeadroom = (actualCpa !== null && targetCpa !== null && targetCpaValid)
    ? targetCpa - actualCpa
    : null;

  // Estimated Profit After Ads: (contribution * conversions) - actualAdSpend
  const estimatedProfitAfterAds = (conversions !== null && actualAdSpend !== null)
    ? (contribution * conversions) - actualAdSpend
    : null;

  // Maximum CPC: CPA threshold * CVR (Only if CVR is available and > 0)
  // CPA threshold can be Break-even CPA or Target CPA
  const maxCpcBreakEven = (breakEvenCpa > 0 && actualCvr !== null)
    ? breakEvenCpa * actualCvr
    : null;

  const maxCpcTarget = (targetCpaValid && targetCpa !== null && targetCpa > 0 && actualCvr !== null)
    ? targetCpa * actualCvr
    : null;

  // Minimum CVR: actualCPC / CPA threshold (only when both exist)
  const minCvrBreakEven = (actualCpc !== null && breakEvenCpa > 0)
    ? actualCpc / breakEvenCpa
    : null;

  const minCvrTarget = (actualCpc !== null && targetCpaValid && targetCpa !== null && targetCpa > 0)
    ? actualCpc / targetCpa
    : null;

  const stage2 = {
    budget,
    actualAdSpend,
    impressions,
    clicks,
    conversions,
    revenue,
    totalStoreRevenue,
    actualCpc,
    actualCvr,
    actualCpa,
    actualRoas,
    acos,
    tacos,
    cpaHeadroom,
    targetCpaHeadroom,
    estimatedProfitAfterAds,
    maxCpcBreakEven,
    maxCpcTarget,
    minCvrBreakEven,
    minCvrTarget,
  };

  // ==========================================
  // DETERMINISTIC STATUS & CONCLUSION
  // ==========================================
  let cpaStatus = null;
  let roasStatus = null;

  if (actualCpa !== null && breakEvenCpa !== null) {
    if (actualCpa > breakEvenCpa) {
      cpaStatus = 'Di atas Break-even';
    } else if (targetCpaValid && targetCpa !== null && actualCpa > targetCpa) {
      cpaStatus = 'Di atas Target, masih di bawah Break-even';
    } else if (targetCpaValid && targetCpa !== null && actualCpa <= targetCpa) {
      cpaStatus = 'Di bawah Target CPA';
    } else {
      cpaStatus = 'Di bawah Break-even';
    }
  }

  if (actualRoas !== null && breakEvenRoas !== null) {
    if (actualRoas < breakEvenRoas) {
      roasStatus = 'Di bawah Break-even ROAS';
    } else if (targetRoas !== null && actualRoas >= targetRoas) {
      roasStatus = 'Di atas Target ROAS';
    } else {
      roasStatus = 'Di atas Break-even ROAS';
    }
  }

  // Deterministic beginner conclusion
  const conclusion = generateConclusion({
    stage1,
    stage2,
    cpaStatus,
    roasStatus,
  });

  return {
    isValid: true,
    errors: [],
    warnings,
    stage1,
    stage2,
    status: {
      cpaStatus,
      roasStatus,
    },
    conclusion,
  };
}

/**
 * Generates deterministic beginner conclusion
 * Zero LLM / Zero hallucination
 */
function generateConclusion({ stage1, stage2, cpaStatus, roasStatus }) {
  if (!stage2 || stage2.actualAdSpend === null || stage2.conversions === null || stage2.conversions === 0) {
    return 'Data belum cukup untuk menarik kesimpulan. Masukkan Actual Ad Spend dan Konversi untuk melihat analisis performa.';
  }

  const parts = [];

  // CPA analysis
  if (cpaStatus === 'Di atas Break-even') {
    parts.push(
      'Biaya iklan per order sudah melewati batas impas berdasarkan biaya yang kamu masukkan. Dengan struktur harga dan biaya saat ini, setiap tambahan order dari biaya iklan tersebut tidak lagi menutup contribution margin.'
    );
  } else if (cpaStatus === 'Di atas Target, masih di bawah Break-even') {
    parts.push(
      'Biaya iklan per order sudah melewati target profitmu, tetapi masih berada di bawah batas impas. Artinya campaign belum melewati batas biaya iklan yang menghabiskan contribution margin, tetapi profit per order lebih rendah dari target.'
    );
  } else if (cpaStatus === 'Di bawah Target CPA') {
    const formattedCpa = formatCurrencyIdr(stage2.actualCpa);
    const formattedTargetCpa = formatCurrencyIdr(stage1.targetCpa);
    parts.push(
      `Setiap order saat ini membutuhkan sekitar ${formattedCpa} biaya iklan. Batas CPA yang kamu tetapkan adalah ${formattedTargetCpa}, jadi biaya iklan per order masih berada pada targetmu.`
    );
  } else if (cpaStatus === 'Di bawah Break-even') {
    parts.push(
      'Biaya iklan per order saat ini masih berada di bawah batas impas. Campaign kamu menghasilkan margin kontribusi positif untuk setiap penjualan.'
    );
  }

  // ROAS analysis
  if (roasStatus === 'Di bawah Break-even ROAS') {
    parts.push(
      'Berdasarkan harga jual, HPP, dan fee yang kamu masukkan, ROAS campaign saat ini berada di bawah titik impas yang dihitung tool.'
    );
  } else if (roasStatus === 'Di atas Target ROAS') {
    parts.push(
      'ROAS campaign sudah mencapai atau melewati target yang kamu tetapkan berdasarkan input bisnis ini.'
    );
  } else if (roasStatus === 'Di atas Break-even ROAS') {
    parts.push(
      'Campaign sudah melewati titik impas berdasarkan input biaya yang kamu masukkan, tetapi belum mencapai target profit yang kamu tetapkan.'
    );
  }

  if (parts.length === 0) {
    return 'Data belum cukup untuk menarik kesimpulan.';
  }

  return parts.join(' ');
}

/**
 * Format helper for UI display (Presentation layer only)
 */
export function formatCurrencyIdr(val) {
  if (val === null || val === undefined) return UNAVAILABLE_LABEL;
  const num = Math.round(Number(val));
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num).replace(/\s+/g, '');
}

export function formatPercent(val, decimals = 2) {
  if (val === null || val === undefined) return UNAVAILABLE_LABEL;
  const num = Number(val) * 100;
  return `${num.toFixed(decimals).replace('.', ',')}%`;
}

export function formatRatio(val, decimals = 2) {
  if (val === null || val === undefined) return UNAVAILABLE_LABEL;
  const num = Number(val);
  return `${num.toFixed(decimals).replace('.', ',')}x`;
}
