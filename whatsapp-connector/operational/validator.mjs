// Validation layer for normalized operational commands in BisnisSehat

import { OPERATIONAL_INTENTS } from './intents.mjs';

/**
 * Validate a normalized command object.
 * Returns:
 * {
 *   valid: boolean,
 *   errors: string[],
 *   prompt: string | null // friendly Indonesian guidance if underspecified
 * }
 */
export function validateOperationalCommand(command) {
  if (!command || !command.intent) {
    return {
      valid: false,
      errors: ['Command intent tidak valid'],
      prompt: 'Perintah tidak dikenali. Ketik *menu* untuk melihat daftar tindakan operasional.'
    };
  }

  const { intent, data = {} } = command;
  const errors = [];

  switch (intent) {
    case OPERATIONAL_INTENTS.SHOW_MENU:
    case OPERATIONAL_INTENTS.SHOW_HELP:
    case OPERATIONAL_INTENTS.SHOW_GREETING:
    case OPERATIONAL_INTENTS.SELECT_AI_MODE:
    case OPERATIONAL_INTENTS.SELECT_FORM_MODE:
      return { valid: true, errors: [], prompt: null };

    case OPERATIONAL_INTENTS.UPDATE_PRODUCT:
    case OPERATIONAL_INTENTS.DELETE_PRODUCT:
    case OPERATIONAL_INTENTS.UPDATE_SUPPLIER:
    case OPERATIONAL_INTENTS.DELETE_SUPPLIER:
    case OPERATIONAL_INTENTS.UPDATE_CUSTOMER:
    case OPERATIONAL_INTENTS.DELETE_CUSTOMER:
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        return { valid: false, errors: ['Nama target wajib diisi'], prompt: 'Sebutkan nama data yang ingin diubah atau dihapus.' };
      }
      return { valid: true, errors: [], prompt: null };

    case OPERATIONAL_INTENTS.CREATE_PRODUCT: {
      if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
        return {
          valid: false,
          errors: ['Nama produk wajib diisi (minimal 2 karakter)'],
          prompt: 'Siap. Saya butuh beberapa data:\n- Nama produk?\n- Harga beli?\n- Harga jual?\n- Stok awal?\n- Gudang?'
        };
      }

      // Check if price is missing or invalid
      const hasPurchase = typeof data.purchase_price === 'number' && !isNaN(data.purchase_price);
      const hasSelling = typeof data.selling_price === 'number' && !isNaN(data.selling_price) && data.selling_price > 0;

      if (!hasPurchase || !hasSelling) {
        return {
          valid: false,
          errors: ['Harga beli dan harga jual harus berupa angka valid'],
          prompt: `Siap mencatat produk *${data.name}*. Mohon lengkapi:\n- Harga beli?\n- Harga jual?\n- Stok awal?\n- Gudang penyimpanan?`
        };
      }

      if (data.initial_stock !== undefined && (isNaN(data.initial_stock) || data.initial_stock < 0)) {
        errors.push('Stok awal harus berupa angka 0 atau lebih');
      }
      break;
    }

    case OPERATIONAL_INTENTS.ADD_STOCK: {
      if (!data.product_name && !data.product_id) {
        return {
          valid: false,
          errors: ['Nama produk atau ID produk wajib diisi'],
          prompt: 'Produk apa yang ingin ditambah stoknya? Contoh: *Tambah stok Kopi Susu 50 di Gudang Utama*'
        };
      }

      if (data.quantity === null || data.quantity === undefined || isNaN(data.quantity) || data.quantity <= 0) {
        return {
          valid: false,
          errors: ['Jumlah stok harus lebih besar dari 0'],
          prompt: `Berapa jumlah stok *${data.product_name || 'produk'}* yang masuk? Contoh: *50 pcs*`
        };
      }
      break;
    }

    case OPERATIONAL_INTENTS.REDUCE_STOCK: {
      if (!data.product_name && !data.product_id) {
        return {
          valid: false,
          errors: ['Nama produk atau ID produk wajib diisi'],
          prompt: 'Produk apa yang ingin dikurangi stoknya? Contoh: *Kurangi stok Kopi Susu 10 karena rusak*'
        };
      }

      if (data.quantity === null || data.quantity === undefined || isNaN(data.quantity) || data.quantity <= 0) {
        return {
          valid: false,
          errors: ['Jumlah stok harus lebih besar dari 0'],
          prompt: `Berapa jumlah stok *${data.product_name || 'produk'}* yang keluar?`
        };
      }
      break;
    }

    case OPERATIONAL_INTENTS.STOCK_TRANSFER: {
      if (!data.product_name && !data.product_id) {
        return {
          valid: false,
          errors: ['Nama produk atau ID produk wajib diisi'],
          prompt: 'Produk apa yang ingin dipindahkan lokasinya? Contoh: *Transfer stok Kopi Susu ke Gudang Bandung*'
        };
      }

      if (!data.to_location || typeof data.to_location !== 'string' || data.to_location.trim().length < 2) {
        return {
          valid: false,
          errors: ['Lokasi tujuan transfer wajib diisi'],
          prompt: `Ke mana stok *${data.product_name || 'produk'}* akan dipindahkan? Contoh: *ke Gudang Bandung*`
        };
      }
      break;
    }

    case OPERATIONAL_INTENTS.CREATE_SUPPLIER: {
      if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
        return {
          valid: false,
          errors: ['Nama supplier wajib diisi'],
          prompt: 'Siap. Siapa nama supplier yang ingin ditambahkan? Contoh: *Tambah supplier PT Maju Jaya nomor 08123456789*'
        };
      }

      if (data.email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(data.email)) {
        errors.push('Format email tidak valid');
      }
      break;
    }

    case OPERATIONAL_INTENTS.CREATE_CUSTOMER: {
      if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
        return {
          valid: false,
          errors: ['Nama pelanggan wajib diisi'],
          prompt: 'Siap. Siapa nama pelanggan yang ingin dicatat? Contoh: *Tambah pelanggan Budi nomor 0812999888*'
        };
      }

      if (data.email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(data.email)) {
        errors.push('Format email tidak valid');
      }
      break;
    }

    case OPERATIONAL_INTENTS.CREATE_EXPENSE: {
      if (data.amount === null || data.amount === undefined || isNaN(data.amount) || data.amount <= 0) {
        return {
          valid: false,
          errors: ['Nominal pengeluaran harus lebih besar dari 0'],
          prompt: 'Berapa nominal pengeluaran yang ingin dicatat? Contoh: *Catat pengeluaran 500000 untuk beli bahan baku*'
        };
      }
      break;
    }

    case OPERATIONAL_INTENTS.CREATE_INCOME: {
      if (data.amount === null || data.amount === undefined || isNaN(data.amount) || data.amount <= 0) {
        return {
          valid: false,
          errors: ['Nominal pemasukan harus lebih besar dari 0'],
          prompt: 'Berapa nominal pemasukan yang ingin dicatat? Contoh: *Catat pemasukan 1000000 penjualan*'
        };
      }
      break;
    }

    case OPERATIONAL_INTENTS.CREATE_SALE: {
      if (!data.product_name && !data.product_id) {
        return {
          valid: false,
          errors: ['Produk yang dijual wajib ditentukan'],
          prompt: 'Produk apa yang terjual? Contoh: *Catat penjualan Kopi Susu 2 harga 10000*'
        };
      }

      const totalVal = (data.total && !isNaN(data.total)) ? data.total : (data.unit_price * (data.quantity || 1));
      if (!totalVal || totalVal <= 0) {
        return {
          valid: false,
          errors: ['Total atau harga satuan harus lebih besar dari 0'],
          prompt: `Berapa harga jual untuk *${data.product_name}*?`
        };
      }
      break;
    }

    case OPERATIONAL_INTENTS.CREATE_PURCHASE: {
      if (!data.product_name && !data.product_id) {
        return {
          valid: false,
          errors: ['Barang/produk yang dibeli wajib ditentukan'],
          prompt: 'Barang apa yang dibeli? Contoh: *Catat pembelian Susu UHT 10 harga 15000*'
        };
      }

      const totalVal = (data.total && !isNaN(data.total)) ? data.total : (data.unit_price * (data.quantity || 1));
      if (!totalVal || totalVal <= 0) {
        return {
          valid: false,
          errors: ['Total atau harga beli harus lebih besar dari 0'],
          prompt: `Berapa total atau harga beli untuk *${data.product_name}*?`
        };
      }
      break;
    }

    case OPERATIONAL_INTENTS.CREATE_INVOICE: {
      if (!data.invoice_number) {
        return {
          valid: false,
          errors: ['Nomor invoice wajib diisi'],
          prompt: 'Mohon sertakan nomor invoice. Contoh: *Buat invoice INV-001 pelanggan Budi total 500000*'
        };
      }

      if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
        return {
          valid: false,
          errors: ['Nominal tagihan invoice harus lebih besar dari 0'],
          prompt: `Berapa total tagihan untuk invoice *${data.invoice_number}*?`
        };
      }
      break;
    }

    case OPERATIONAL_INTENTS.RECORD_PAYMENT: {
      if (!data.invoice_number && !data.invoice_id) {
        return {
          valid: false,
          errors: ['Nomor invoice atau ID invoice wajib disertakan'],
          prompt: 'Nomor invoice mana yang dibayar? Contoh: *Bayar invoice INV-001 500000*'
        };
      }

      if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
        return {
          valid: false,
          errors: ['Nominal pembayaran harus lebih besar dari 0'],
          prompt: `Berapa nominal pembayaran untuk invoice *${data.invoice_number}*?`
        };
      }
      break;
    }

    case OPERATIONAL_INTENTS.CREATE_WAREHOUSE: {
      if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
        return {
          valid: false,
          errors: ['Nama gudang wajib diisi'],
          prompt: 'Apa nama gudang yang ingin ditambahkan? Contoh: *Tambah gudang baru Gudang Bandung*'
        };
      }
      break;
    }

    default:
      return {
        valid: false,
        errors: [`Intent ${intent} belum didukung`],
        prompt: 'Perintah belum didukung. Ketik *menu* untuk melihat opsi operasional.'
      };
  }

  return {
    valid: errors.length === 0,
    errors,
    prompt: errors.length > 0 ? `Terdapat data belum sesuai:\n- ${errors.join('\n- ')}` : null
  };
}
