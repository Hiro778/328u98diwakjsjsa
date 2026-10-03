// Deterministic Indonesian Rule-Based Parser for BisnisSehat
// Translates natural Indonesian WhatsApp text into normalized operational commands.

import { OPERATIONAL_INTENTS } from './intents.mjs';

/**
 * Parse Indonesian currency / numbers
 * Examples:
 * '50000', '50.000', 'Rp 50.000', 'Rp. 50.000', '50k', '50rb', '50 ribu', '1.5jt', '2 juta'
 */
export function parseIndonesianNumber(str) {
  if (typeof str === 'number') return str;
  if (!str || typeof str !== 'string') return NaN;

  let s = str.toLowerCase().trim();
  s = s.replace(/^rp\.?\s*/i, '').replace(/^idr\s*/i, '').trim();

  // Check suffix multipliers: juta / jt, ribu / rb / k
  const jutaMatch = s.match(/^([\d.,]+)\s*(?:jt|juta)$/);
  if (jutaMatch) {
    let raw = jutaMatch[1];
    if (/^\d+[.,]\d{1,2}$/.test(raw)) {
      raw = raw.replace(',', '.');
    } else {
      raw = raw.replace(/\./g, '').replace(',', '.');
    }
    const base = parseFloat(raw);
    return isNaN(base) ? NaN : Math.round(base * 1000000);
  }

  const ribuMatch = s.match(/^([\d.,]+)\s*(?:rb|k|ribu)$/);
  if (ribuMatch) {
    let raw = ribuMatch[1];
    if (/^\d+[.,]\d{1,2}$/.test(raw)) {
      raw = raw.replace(',', '.');
    } else {
      raw = raw.replace(/\./g, '').replace(',', '.');
    }
    const base = parseFloat(raw);
    return isNaN(base) ? NaN : Math.round(base * 1000);
  }

  // Indonesian thousands separator: 50.000 -> 50000
  // If dot is used as thousands separator (e.g. 50.000 or 1.500.000)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(,\d+)?$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/[^\d.]/g, '');
  }

  const val = parseFloat(s);
  return isNaN(val) ? NaN : val;
}

/**
 * Extract email address from string
 */
export function extractEmail(text) {
  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i);
  return match ? match[0] : null;
}

/**
 * Extract phone number from string
 */
export function extractPhone(text) {
  const match = text.match(/(?:nomor|hp|wa|telepon|telp|no)?\s*[:=]?\s*(\+?62[0-9]{8,13}|08[0-9]{8,12})\b/i);
  return match ? match[1] : null;
}

/**
 * Clean text tokens
 */
function cleanText(text) {
  return (text || '').trim().replace(/\s+/g, ' ');
}

const OPERATION_WORDS = {
  delete: /\b(?:hapus|delete|hilangkan|remove)\b/i,
  update: /\b(?:edit|ubah|update|perbarui)\b/i,
  create: /\b(?:tambah|buat|catat)\b/i
};

function explicitOperation(lower) {
  if (OPERATION_WORDS.delete.test(lower)) return 'DELETE';
  if (OPERATION_WORDS.update.test(lower)) return 'UPDATE';
  if (OPERATION_WORDS.create.test(lower)) return 'CREATE';
  return null;
}

function operationEntity(lower) {
  if (/\b(?:produk|barang)\b/i.test(lower)) return 'PRODUCT';
  if (/\b(?:supplier|pemasok)\b/i.test(lower)) return 'SUPPLIER';
  if (/\b(?:pelanggan|customer)\b/i.test(lower)) return 'CUSTOMER';
  if (/\b(?:invoice|faktur)\b/i.test(lower)) return 'INVOICE';
  if (/\b(?:penjualan|sale)\b/i.test(lower)) return 'SALE';
  if (/\b(?:pembelian|purchase)\b/i.test(lower)) return 'PURCHASE';
  if (/\b(?:pengeluaran|expense|biaya)\b/i.test(lower)) return 'EXPENSE';
  if (/\b(?:pemasukan|income)\b/i.test(lower)) return 'INCOME';
  if (/\b(?:pembayaran|payment)\b/i.test(lower)) return 'PAYMENT';
  return null;
}

function nameAfterOperation(text, entity) {
  const withoutOperation = text
    .replace(/\b(?:hapus|delete|hilangkan|remove|edit|ubah|update|perbarui)\b/ig, '')
    .replace(new RegExp(`\\b(?:${entity === 'PRODUCT' ? 'produk|barang' : entity === 'SUPPLIER' ? 'supplier|pemasok' : entity === 'CUSTOMER' ? 'pelanggan|customer' : entity === 'INVOICE' ? 'invoice|faktur' : entity.toLowerCase()})\\b`, 'ig'), '')
    .replace(/\b(?:email|nomor|hp|wa|telepon|telp|alamat|harga\s+jual|harga\s+beli|harga|stok|total|sebesar)\b[\s:=]*.*$/i, '')
    .trim();
  return withoutOperation.replace(/^[:\-\s]+|[:\-\s]+$/g, '').trim();
}

function parseExplicitMutation(text, lower) {
  const operation = explicitOperation(lower);
  if (!operation || operation === 'CREATE') return null;
  // A bare "hapus Yanto" is intentionally treated as customer deletion. This
  // preserves the existing operational shorthand while still requiring a scoped resolver.
  const entity = operationEntity(lower) || (operation === 'DELETE' ? 'CUSTOMER' : null);
  if (!entity) return null;
  const intent = OPERATIONAL_INTENTS[`${operation}_${entity}`];
  if (!intent) return null;
  const name = nameAfterOperation(text, entity);
  const data = { name, [`${entity.toLowerCase()}_name`]: name };
  const email = extractEmail(text);
  const phone = extractPhone(text);
  if (email) data.email = email;
  if (phone) data.phone = phone;
  const sellingMatch = text.match(/(?:harga\s+)?jual\s*[:=]?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
  if (sellingMatch) data.selling_price = parseIndonesianNumber(sellingMatch[1]);
  return { intent, source: 'rule_based', data, rawText: text };
}

/**
 * Main parser entry point.
 * Given raw Indonesian text, deterministically returns a normalized command object:
 * {
 *   intent: string,
 *   source: 'rule_based',
 *   data: object,
 *   rawText: string
 * }
 */
export function parseOperationalText(rawText) {
  const text = cleanText(rawText);
  if (!text) {
    return {
      intent: OPERATIONAL_INTENTS.UNKNOWN,
      source: 'rule_based',
      data: {},
      rawText
    };
  }

  const lower = text.toLowerCase();

  // ── 1. MENU & HELP ──
  if (/^\/(?:hai|help|menu)$/i.test(lower)) {
    return { intent: OPERATIONAL_INTENTS.SHOW_GREETING, source: 'rule_based', data: {}, rawText };
  }
  if (/^(?:(?:\/)?ai|gunakan\s+ai|ai\s+bisnissehat|1|🤖\s*ai\s*bisnissehat|🤖\s*gunakan\s+ai)$/i.test(lower)) {
    return { intent: OPERATIONAL_INTENTS.SELECT_AI_MODE, source: 'rule_based', data: {}, rawText };
  }
  if (/^(?:(?:\/)?form|gunakan\s+formulir|2|📋\s*formulir\s*operasional|📋\s*gunakan\s+formulir)$/i.test(lower)) {
    return { intent: OPERATIONAL_INTENTS.SELECT_FORM_MODE, source: 'rule_based', data: {}, rawText };
  }
  const mutation = parseExplicitMutation(text, lower);
  if (mutation) return mutation;
  if (/^(menu|bantuan|help|catat|bisnis\s*sehat|bisnissehat|mulai|ops|operasional)$/i.test(lower)) {
    return {
      intent: OPERATIONAL_INTENTS.SHOW_MENU,
      source: 'rule_based',
      data: {},
      rawText
    };
  }

  // ── 2. SUPPLIER ──
  // Examples:
  // "Tambah supplier Yanto email yanto@gmail.com nomor 08123456789"
  // "Yanto supplier email yanto@gmail.com"
  // "Supplier baru PT Sumber Rejeki alamat Jl Mangga No 5 telp 0811223344"
  if (
    /^(?:tambah\s+supplier|supplier\s+baru|catat\s+supplier|buat\s+supplier)\b/i.test(lower) ||
    /\bsupplier\b/i.test(lower)
  ) {
    const email = extractEmail(text);
    const phone = extractPhone(text);

    // Extract address if available
    let address = '';
    const addressMatch = text.match(/(?:alamat|lokasi)\s*[:=]?\s*([^,\n]+?)(?=(?:\s+(?:email|nomor|no|telp|hp|kontak)|$))/i);
    if (addressMatch) {
      address = addressMatch[1].trim();
    }

    // Extract name
    let name = text
      .replace(/^(?:tambah\s+supplier|supplier\s+baru|catat\s+supplier|buat\s+supplier)\s*/i, '')
      .replace(/\bsupplier\b/i, '')
      .replace(/(?:email)\s*[:=]?\s*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '')
      .replace(/(?:nomor|hp|wa|telepon|telp|no)\s*[:=]?\s*\+?[0-9]{9,15}/gi, '')
      .replace(/(?:alamat|lokasi)\s*[:=]?\s*[^,\n]+/gi, '')
      .replace(/(?:kontak|pic)\s*[:=]?\s*\w+/gi, '')
      .trim();

    // Clean leading/trailing punctuation
    name = name.replace(/^[:\-\s]+|[:\-\s]+$/g, '').trim();

    if (name) {
      return {
        intent: OPERATIONAL_INTENTS.CREATE_SUPPLIER,
        source: 'rule_based',
        data: {
          name,
          email: email || '',
          phone: phone || '',
          address: address || '',
          contact_person: name
        },
        rawText
      };
    }
  }

  // ── 3. CUSTOMER / PELANGGAN ──
  // Examples:
  // "Tambah pelanggan Budi nomor 0812999888 email budi@gmail.com"
  // "Pelanggan baru Siti alamat Jl Sudirman No 1"
  if (
    /^(?:tambah\s+pelanggan|pelanggan\s+baru|catat\s+pelanggan|tambah\s+customer|customer\s+baru|catat\s+customer)\b/i.test(lower) ||
    /\b(?:pelanggan|customer)\b/i.test(lower)
  ) {
    const email = extractEmail(text);
    const phone = extractPhone(text);

    let address = '';
    const addressMatch = text.match(/(?:alamat|lokasi)\s*[:=]?\s*([^,\n]+?)(?=(?:\s+(?:email|nomor|no|telp|hp)|$))/i);
    if (addressMatch) {
      address = addressMatch[1].trim();
    }

    let name = text
      .replace(/^(?:tambah\s+pelanggan|pelanggan\s+baru|catat\s+pelanggan|tambah\s+customer|customer\s+baru|catat\s+customer)\s*/i, '')
      .replace(/\b(?:pelanggan|customer)\b/i, '')
      .replace(/(?:email)\s*[:=]?\s*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '')
      .replace(/(?:nomor|hp|wa|telepon|telp|no)\s*[:=]?\s*\+?[0-9]{9,15}/gi, '')
      .replace(/(?:alamat|lokasi)\s*[:=]?\s*[^,\n]+/gi, '')
      .trim();

    name = name.replace(/^[:\-\s]+|[:\-\s]+$/g, '').trim();

    if (name) {
      return {
        intent: OPERATIONAL_INTENTS.CREATE_CUSTOMER,
        source: 'rule_based',
        data: {
          name,
          email: email || '',
          phone: phone || '',
          address: address || ''
        },
        rawText
      };
    }
  }

  // ── 4. PRODUCT (CREATE PRODUCT) ──
  // Examples:
  // "Tambah produk Kopi Susu harga beli 5000 harga jual 10000 stok 100 masuk Gudang Utama"
  // "Produk baru Teh Tarik beli 3000 jual 6000 stok 50"
  if (/^(?:tambah\s+produk|buat\s+produk|produk\s+baru|catat\s+produk|tambah\s+barang|barang\s+baru)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:tambah\s+produk|buat\s+produk|produk\s+baru|catat\s+produk|tambah\s+barang|barang\s+baru)\s*/i, '').trim();

    // Extract warehouse / location: "masuk Gudang Utama" or "di Gudang Utama" or "gudang Gudang Utama"
    let warehouse = '';
    const warehouseMatch = stripped.match(/(?:masuk|di|gudang|lokasi)\s+(?:gudang\s+)?([A-Za-z0-9\s]+?)(?=(?:\s+(?:harga|beli|jual|stok)|$))/i);
    if (warehouseMatch) {
      warehouse = warehouseMatch[1].trim();
      // Ensure 'gudang' prefix is retained if matched gracefully
      if (!warehouse.toLowerCase().startsWith('gudang') && warehouseMatch[0].toLowerCase().includes('gudang')) {
        warehouse = `Gudang ${warehouse}`;
      }
    }

    // Extract purchase price (harga beli)
    let purchasePrice = NaN;
    const purchaseMatch = stripped.match(/(?:harga\s+)?beli\s*[:=]?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (purchaseMatch) {
      purchasePrice = parseIndonesianNumber(purchaseMatch[1]);
    }

    // Extract selling price (harga jual)
    let sellingPrice = NaN;
    const sellingMatch = stripped.match(/(?:harga\s+)?jual\s*[:=]?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (sellingMatch) {
      sellingPrice = parseIndonesianNumber(sellingMatch[1]);
    }

    // Extract stock (stok 100 or stok awal 100)
    let initialStock = 0;
    const stockMatch = stripped.match(/(?:stok|stock)(?:\s+awal)?\s*[:=]?\s*([\d.,]+(?:\s*(?:rb|k|ribu))?)/i);
    if (stockMatch) {
      initialStock = parseIndonesianNumber(stockMatch[1]) || 0;
    }

    // Extract product name
    let name = stripped
      .replace(/(?:harga\s+)?beli\s*[:=]?\s*(?:rp\.?\s*)?[\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?/gi, '')
      .replace(/(?:harga\s+)?jual\s*[:=]?\s*(?:rp\.?\s*)?[\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?/gi, '')
      .replace(/(?:stok|stock)(?:\s+awal)?\s*[:=]?\s*[\d.,]+(?:\s*(?:rb|k|ribu))?/gi, '')
      .replace(/(?:masuk|di|gudang|lokasi)\s+(?:gudang\s+)?[A-Za-z0-9\s]+/gi, '')
      .trim();

    name = name.replace(/^[:\-\s]+|[:\-\s]+$/g, '').trim();

    return {
      intent: OPERATIONAL_INTENTS.CREATE_PRODUCT,
      source: 'rule_based',
      data: {
        name,
        purchase_price: isNaN(purchasePrice) ? 0 : purchasePrice,
        selling_price: isNaN(sellingPrice) ? 0 : sellingPrice,
        initial_stock: initialStock,
        warehouse: warehouse || 'Gudang Utama',
        unit: 'pcs'
      },
      rawText
    };
  }

  // ── 5. STOCK ADJUSTMENT (ADD / REDUCE STOCK) ──
  // Examples:
  // "Tambah stok kecap 100 di Gudang Utama"
  // "Tambah stok Kopi Susu 50"
  // "Stok masuk Indomie Goreng 200 dus"
  if (/^(?:tambah\s+stok|stok\s+masuk|restock|masuk\s+stok|catat\s+stok)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:tambah\s+stok|stok\s+masuk|restock|masuk\s+stok|catat\s+stok)\s*/i, '').trim();

    // Extract warehouse / location
    let warehouse = '';
    const locMatch = stripped.match(/(?:di|ke|masuk|lokasi)\s+([A-Za-z0-9\s]+)$/i);
    if (locMatch) {
      warehouse = locMatch[1].trim();
      stripped = stripped.slice(0, locMatch.index).trim();
    }

    // Extract quantity and possible unit (e.g. "100 dus" or "100")
    let quantity = NaN;
    let unit = 'pcs';
    const qtyMatch = stripped.match(/(\d+(?:\.\d+)?)\s*(pcs|dus|box|kg|liter|botol|sachet|pack|biji|butir|cup)?$/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      if (qtyMatch[2]) unit = qtyMatch[2].toLowerCase();
      stripped = stripped.replace(/(\d+(?:\.\d+)?)\s*(pcs|dus|box|kg|liter|botol|sachet|pack|biji|butir|cup)?$/i, '').trim();
    }

    const productName = stripped.trim();

    return {
      intent: OPERATIONAL_INTENTS.ADD_STOCK,
      source: 'rule_based',
      data: {
        product_name: productName,
        quantity: isNaN(quantity) ? null : quantity,
        warehouse: warehouse || '',
        unit,
        reason: 'Restock WhatsApp'
      },
      rawText
    };
  }

  // Reduce stock:
  // "Kurangi stok Kopi Susu 10 karena rusak"
  // "Stok keluar kecap 5"
  if (/^(?:kurangi\s+stok|kurang\s+stok|stok\s+keluar|keluar\s+stok)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:kurangi\s+stok|kurang\s+stok|stok\s+keluar|keluar\s+stok)\s*/i, '').trim();

    let reason = 'Penyesuaian stok keluar';
    const reasonMatch = stripped.match(/(?:karena|alasan)\s+([^,\n]+)$/i);
    if (reasonMatch) {
      reason = reasonMatch[1].trim();
      stripped = stripped.replace(/(?:karena|alasan)\s+[^,\n]+$/i, '').trim();
    }

    let quantity = NaN;
    const qtyMatch = stripped.match(/(\d+(?:\.\d+)?)\s*(pcs|dus|box|kg|liter|botol|pack)?$/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      stripped = stripped.replace(/(\d+(?:\.\d+)?)\s*(pcs|dus|box|kg|liter|botol|pack)?$/i, '').trim();
    }

    const productName = stripped.trim();

    return {
      intent: OPERATIONAL_INTENTS.REDUCE_STOCK,
      source: 'rule_based',
      data: {
        product_name: productName,
        quantity: isNaN(quantity) ? null : quantity,
        reason
      },
      rawText
    };
  }

  // Stock transfer / move location:
  // "Transfer stok Kopi Susu ke Gudang Bandung"
  // "Pindah stok Kopi Susu dari Gudang Utama ke Gudang Bandung"
  // "Pindah lokasi Kopi Susu ke Gudang Bandung"
  if (/^(?:transfer\s+stok|pindah\s+stok|pindah\s+lokasi|transfer\s+lokasi)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:transfer\s+stok|pindah\s+stok|pindah\s+lokasi|transfer\s+lokasi)\s*/i, '').trim();

    let toLocation = '';
    const toMatch = stripped.match(/(?:ke|tujuan)\s+([A-Za-z0-9\s]+)$/i);
    if (toMatch) {
      toLocation = toMatch[1].trim();
      stripped = stripped.slice(0, toMatch.index).trim();
    }

    let fromLocation = '';
    const fromMatch = stripped.match(/(?:dari|asal)\s+([A-Za-z0-9\s]+)$/i);
    if (fromMatch) {
      fromLocation = fromMatch[1].trim();
      stripped = stripped.slice(0, fromMatch.index).trim();
    }

    let quantity = NaN;
    const qtyMatch = stripped.match(/(\d+(?:\.\d+)?)\s*(pcs|dus|box|kg|liter|botol|pack)?$/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      stripped = stripped.slice(0, qtyMatch.index).trim();
    }

    const productName = stripped.trim();

    return {
      intent: OPERATIONAL_INTENTS.STOCK_TRANSFER,
      source: 'rule_based',
      data: {
        product_name: productName,
        quantity: isNaN(quantity) ? null : quantity,
        from_location: fromLocation,
        to_location: toLocation
      },
      rawText
    };
  }

  // ── 6. EXPENSE (PENGELUARAN) ──
  // Examples:
  // "Catat pengeluaran 500000 untuk beli bahan baku"
  // "Pengeluaran 150000 listrik dan air"
  // "Biaya sewa toko 1500000"
  if (/^(?:catat\s+pengeluaran|pengeluaran\s+baru|pengeluaran|biaya|catat\s+biaya|keluar\s+uang)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:catat\s+pengeluaran|pengeluaran\s+baru|pengeluaran|biaya|catat\s+biaya|keluar\s+uang)\s*/i, '').trim();

    // Extract amount: e.g. "500000" or "Rp 500.000"
    let amount = NaN;
    const amountMatch = stripped.match(/(?:sebesar\s+)?(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (amountMatch) {
      amount = parseIndonesianNumber(amountMatch[1]);
      stripped = stripped.replace(amountMatch[0], '').trim();
    }

    let description = stripped
      .replace(/^(?:untuk|buat|karena)\s+/i, '')
      .trim();

    // Guess category from description
    let category = 'Operasional';
    const dLower = description.toLowerCase();
    if (/bahan|baku|stok|kulakan/i.test(dLower)) category = 'Bahan Baku';
    else if (/listrik|air|wifi|internet|telepon|pln/i.test(dLower)) category = 'Utilitas';
    else if (/sewa|tempat|ruko/i.test(dLower)) category = 'Sewa';
    else if (/gaji|upah|karyawan|bonus/i.test(dLower)) category = 'Gaji';
    else if (/iklan|promosi|marketing/i.test(dLower)) category = 'Pemasaran';

    return {
      intent: OPERATIONAL_INTENTS.CREATE_EXPENSE,
      source: 'rule_based',
      data: {
        amount: isNaN(amount) ? null : amount,
        category,
        description: description || 'Pengeluaran operasional',
        expense_date: new Date().toISOString().split('T')[0]
      },
      rawText
    };
  }

  // ── 7. INCOME (PEMASUKAN) ──
  // Examples:
  // "Catat pemasukan 1000000 penjualan"
  // "Pemasukan 250000 catering"
  if (/^(?:catat\s+pemasukan|pemasukan\s+baru|pemasukan|uang\s+masuk|catat\s+uang\s+masuk)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:catat\s+pemasukan|pemasukan\s+baru|pemasukan|uang\s+masuk|catat\s+uang\s+masuk)\s*/i, '').trim();

    let amount = NaN;
    const amountMatch = stripped.match(/(?:sebesar\s+)?(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (amountMatch) {
      amount = parseIndonesianNumber(amountMatch[1]);
      stripped = stripped.replace(amountMatch[0], '').trim();
    }

    let description = stripped
      .replace(/^(?:dari|untuk)\s+/i, '')
      .trim();

    return {
      intent: OPERATIONAL_INTENTS.CREATE_INCOME,
      source: 'rule_based',
      data: {
        amount: isNaN(amount) ? null : amount,
        description: description || 'Pemasukan operasional',
        sale_date: new Date().toISOString().split('T')[0]
      },
      rawText
    };
  }

  // ── 8. SALE (PENJUALAN) ──
  // Examples:
  // "Catat penjualan Kopi Susu 2 harga 10000"
  // "Jual Kopi Susu 2 harga 10000"
  // "Penjualan Roti Bakar 3 total 45000"
  if (/^(?:catat\s+penjualan|penjualan\s+baru|penjualan|jual)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:catat\s+penjualan|penjualan\s+baru|penjualan|jual)\s*/i, '').trim();

    // Extract unit price or total
    let unitPrice = NaN;
    let total = NaN;

    const priceMatch = stripped.match(/(?:harga|satuan)\s*[:=]?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (priceMatch) {
      unitPrice = parseIndonesianNumber(priceMatch[1]);
      stripped = stripped.replace(priceMatch[0], '').trim();
    }

    const totalMatch = stripped.match(/total\s*[:=]?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (totalMatch) {
      total = parseIndonesianNumber(totalMatch[1]);
      stripped = stripped.replace(totalMatch[0], '').trim();
    }

    // Extract quantity
    let quantity = 1;
    const qtyMatch = stripped.match(/(\d+(?:\.\d+)?)\s*(pcs|dus|box|cup|porsi|pack)?$/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      stripped = stripped.replace(/(\d+(?:\.\d+)?)\s*(pcs|dus|box|cup|porsi|pack)?$/i, '').trim();
    }

    const productName = stripped.trim();

    if (!isNaN(unitPrice) && isNaN(total)) {
      total = unitPrice * quantity;
    } else if (isNaN(unitPrice) && !isNaN(total)) {
      unitPrice = total / quantity;
    }

    return {
      intent: OPERATIONAL_INTENTS.CREATE_SALE,
      source: 'rule_based',
      data: {
        product_name: productName,
        quantity,
        unit_price: isNaN(unitPrice) ? 0 : unitPrice,
        total: isNaN(total) ? 0 : total,
        sale_date: new Date().toISOString().split('T')[0]
      },
      rawText
    };
  }

  // ── 9. PURCHASE (PEMBELIAN) ──
  // Examples:
  // "Catat pembelian Susu UHT 10 harga 15000 dari Supplier Indomilk"
  // "Beli Kopi Arabika 5 harga 120000"
  if (/^(?:catat\s+pembelian|pembelian\s+baru|pembelian|beli)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:catat\s+pembelian|pembelian\s+baru|pembelian|beli)\s*/i, '').trim();

    let supplierName = '';
    const suppMatch = stripped.match(/(?:dari|supplier)\s+([A-Za-z0-9\s]+?)(?=(?:\s+(?:harga|total|jumlah)|$))/i);
    if (suppMatch) {
      supplierName = suppMatch[1].trim();
      stripped = stripped.replace(suppMatch[0], '').trim();
    }

    let unitPrice = NaN;
    const priceMatch = stripped.match(/(?:harga|satuan)\s*[:=]?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (priceMatch) {
      unitPrice = parseIndonesianNumber(priceMatch[1]);
      stripped = stripped.replace(priceMatch[0], '').trim();
    }

    let total = NaN;
    const totalMatch = stripped.match(/total\s*[:=]?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (totalMatch) {
      total = parseIndonesianNumber(totalMatch[1]);
      stripped = stripped.replace(totalMatch[0], '').trim();
    }

    let quantity = 1;
    const qtyMatch = stripped.match(/(\d+(?:\.\d+)?)\s*(pcs|dus|box|kg|liter|pack)?$/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      stripped = stripped.replace(/(\d+(?:\.\d+)?)\s*(pcs|dus|box|kg|liter|pack)?$/i, '').trim();
    }

    const productName = stripped.trim();

    if (!isNaN(unitPrice) && isNaN(total)) {
      total = unitPrice * quantity;
    } else if (isNaN(unitPrice) && !isNaN(total)) {
      unitPrice = total / quantity;
    }

    return {
      intent: OPERATIONAL_INTENTS.CREATE_PURCHASE,
      source: 'rule_based',
      data: {
        product_name: productName,
        quantity,
        unit_price: isNaN(unitPrice) ? 0 : unitPrice,
        total: isNaN(total) ? 0 : total,
        supplier_name: supplierName,
        purchase_date: new Date().toISOString().split('T')[0]
      },
      rawText
    };
  }

  // ── 10. INVOICE (CREATE INVOICE) ──
  // Examples:
  // "Buat invoice INV-001 pelanggan Budi total 500000"
  // "Catat invoice INV-2026-01 Siti 750000"
  if (/^(?:buat\s+invoice|catat\s+invoice|invoice\s+baru|invoice)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:buat\s+invoice|catat\s+invoice|invoice\s+baru|invoice)\s*/i, '').trim();

    // Extract invoice number
    let invoiceNumber = '';
    const invNumMatch = stripped.match(/(?:no|nomor)?\s*([A-Za-z0-9\-_/]+)/i);
    if (invNumMatch && /[A-Za-z]/.test(invNumMatch[1])) {
      invoiceNumber = invNumMatch[1].trim();
      stripped = stripped.replace(invNumMatch[0], '').trim();
    }

    // Extract amount
    let amount = NaN;
    const amountMatch = stripped.match(/(?:sebesar|total|nominal)?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (amountMatch) {
      amount = parseIndonesianNumber(amountMatch[1]);
      stripped = stripped.replace(amountMatch[0], '').trim();
    }

    // Extract customer name
    let customerName = stripped
      .replace(/(?:pelanggan|customer|kepada|ke|untuk)\s*/i, '')
      .trim();

    return {
      intent: OPERATIONAL_INTENTS.CREATE_INVOICE,
      source: 'rule_based',
      data: {
        invoice_number: invoiceNumber,
        customer_name: customerName,
        amount: isNaN(amount) ? 0 : amount,
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0] // default 14 days
      },
      rawText
    };
  }

  // ── 11. PAYMENT (RECORD PAYMENT) ──
  // Examples:
  // "Bayar invoice INV-001 500000"
  // "Catat pembayaran INV-100 250000 transfer"
  if (/^(?:bayar\s+invoice|catat\s+pembayaran|pembayaran\s+invoice|bayar|pembayaran)\b/i.test(lower)) {
    let stripped = text.replace(/^(?:bayar\s+invoice|catat\s+pembayaran|pembayaran\s+invoice|bayar|pembayaran)\s*/i, '').trim();

    // Strip optional "invoice / inv / no / nomor" prefix separated by space
    stripped = stripped.replace(/^(?:invoice|inv|tagihan|no|nomor)\s+/i, '').trim();

    // Extract invoice number
    let invoiceNumber = '';
    const invMatch = stripped.match(/^([A-Za-z0-9\-_/]+)/);
    if (invMatch) {
      invoiceNumber = invMatch[1].trim();
      stripped = stripped.slice(invMatch[0].length).trim();
    }

    // Extract amount
    let amount = NaN;
    const amountMatch = stripped.match(/(?:sebesar|nominal)?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|k|ribu|jt|juta))?)/i);
    if (amountMatch) {
      amount = parseIndonesianNumber(amountMatch[1]);
      stripped = stripped.replace(amountMatch[0], '').trim();
    }

    // Extract method
    let method = 'Cash';
    if (/transfer|bca|mandiri|bni|bri|qris/i.test(stripped)) {
      method = 'Transfer Bank';
    }

    return {
      intent: OPERATIONAL_INTENTS.RECORD_PAYMENT,
      source: 'rule_based',
      data: {
        invoice_number: invoiceNumber,
        amount: isNaN(amount) ? 0 : amount,
        method,
        payment_date: new Date().toISOString().split('T')[0]
      },
      rawText
    };
  }

  // ── 12. WAREHOUSE (CREATE WAREHOUSE) ──
  // Examples:
  // "Tambah gudang baru Gudang Bandung"
  // "Gudang baru Gudang Barat"
  if (/^(?:tambah\s+gudang|gudang\s+baru|catat\s+gudang)\b/i.test(lower)) {
    let name = text
      .replace(/^(?:tambah\s+gudang|gudang\s+baru|catat\s+gudang)\s*(?:baru\s*)?/i, '')
      .trim();

    return {
      intent: OPERATIONAL_INTENTS.CREATE_WAREHOUSE,
      source: 'rule_based',
      data: {
        name
      },
      rawText
    };
  }

  // Fallback: Unknown
  return {
    intent: OPERATIONAL_INTENTS.UNKNOWN,
    source: 'rule_based',
    data: {},
    rawText
  };
}
