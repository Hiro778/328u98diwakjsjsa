// Unified Operational Execution Engine for BisnisSehat
// Mutates production Supabase database tables with strict tenant (business_id) isolation.
// Used identically by Mode 1 (Rule-Based WhatsApp text) and Mode 2 (Guided Form in Web UI).

import { OPERATIONAL_INTENTS } from './intents.mjs';
import { resolveProduct, resolveSupplier, resolveCustomer, resolveInvoice } from './entityResolver.mjs';

/**
 * Indonesian Rupiah formatter
 */
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return 'Rp 0';
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

/**
 * Central Operational Command Executor
 *
 * @param {object} command - { intent, source, data }
 * @param {object} context - { supabase, businessId, whatsappMessageId }
 * @returns {Promise<{ success: boolean, message: string, data?: any, error?: string }>}
 */
export async function executeOperationalCommand(command, { supabase, businessId, whatsappMessageId = null }) {
  if (!supabase) {
    return { success: false, message: 'Database client tidak terhubung' };
  }
  if (!businessId) {
    return { success: false, message: 'business_id wajib disertakan untuk isolasi data UMKM' };
  }

  const { intent, data = {} } = command;

  // Log execution start without leaking secrets
  console.log(`[Operational] businessId=${businessId} messageId=${whatsappMessageId || 'direct'} intent=${intent} source=${command.source || 'unknown'}`);

  try {
    switch (intent) {
      // ════════════════════════════════════════════════════════
      // 1. MENU / HELP
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.SHOW_MENU:
      case OPERATIONAL_INTENTS.SHOW_HELP: {
        const menuText = [
          '🤖 *BisnisSehat Operasional UMKM*',
          '',
          'Mau mencatat apa? Silakan ketik perintah langsung:',
          '',
          '📦 *Produk*: _Tambah produk Kopi Susu beli 5000 jual 10000 stok 100 masuk Gudang Utama_',
          '📈 *Stok Masuk*: _Tambah stok Kopi Susu 50 di Gudang Utama_',
          '📉 *Stok Keluar*: _Kurangi stok Kopi Susu 5 karena rusak_',
          '🚚 *Supplier*: _Tambah supplier Yanto email yanto@gmail.com nomor 08123456789_',
          '👥 *Pelanggan*: _Tambah pelanggan Budi nomor 0812999888_',
          '💰 *Penjualan*: _Catat penjualan Kopi Susu 2 harga 10000_',
          '🛒 *Pembelian*: _Catat pembelian Susu UHT 10 harga 15000 dari Supplier Indomilk_',
          '💸 *Pengeluaran*: _Catat pengeluaran 500000 untuk beli bahan baku_',
          '💵 *Pemasukan*: _Catat pemasukan 1000000 penjualan_',
          '🧾 *Invoice*: _Buat invoice INV-001 pelanggan Budi total 500000_',
          '💳 *Pembayaran*: _Bayar invoice INV-001 500000_',
          '',
          'Ketik perintah di atas secara langsung untuk pencatatan instan!'
        ].join('\n');

        return { success: true, message: menuText, data: { isMenu: true } };
      }

      case OPERATIONAL_INTENTS.SHOW_GREETING:
        return {
          success: true,
          message: 'Halo! 👋\nBisnisSehat siap membantu operasional bisnis Anda.\n\nPilih cara yang ingin digunakan:\n\n1️⃣ Gunakan AI\n2️⃣ Gunakan Formulir',
          data: { isGreeting: true, choices: ['AI', 'FORM'] }
        };

      case OPERATIONAL_INTENTS.SELECT_AI_MODE:
        return {
          success: true,
          message: process.env.GEMINI_API_KEY ? 'Mode AI aktif. Silakan kirimkan perintah operasional Anda.' : 'Untuk menggunakan mode AI, diperlukan Gemini API Key melalui pengaturan aman BisnisSehat.',
          data: { mode: 'ai', requiresApiKey: !process.env.GEMINI_API_KEY }
        };

      case OPERATIONAL_INTENTS.SELECT_FORM_MODE:
        return {
          success: true,
          message: 'Mode Formulir aktif. Pilih operasional:\n\n1️⃣ Produk\n2️⃣ Stok\n3️⃣ Supplier\n4️⃣ Pelanggan\n5️⃣ Penjualan\n6️⃣ Pembelian\n7️⃣ Pengeluaran\n8️⃣ Pemasukan\n9️⃣ Invoice\n🔟 Pembayaran',
          data: { mode: 'form' }
        };

      case OPERATIONAL_INTENTS.UPDATE_PRODUCT:
      case OPERATIONAL_INTENTS.DELETE_PRODUCT:
      case OPERATIONAL_INTENTS.UPDATE_SUPPLIER:
      case OPERATIONAL_INTENTS.DELETE_SUPPLIER:
      case OPERATIONAL_INTENTS.UPDATE_CUSTOMER:
      case OPERATIONAL_INTENTS.DELETE_CUSTOMER: {
        const entityConfig = intent.includes('PRODUCT')
          ? { table: 'products', resolver: resolveProduct, key: 'product', name: data.product_name || data.name }
          : intent.includes('SUPPLIER')
            ? { table: 'suppliers', resolver: resolveSupplier, key: 'supplier', name: data.supplier_name || data.name }
            : { table: 'customers', resolver: resolveCustomer, key: 'customer', name: data.customer_name || data.name };
        const resolution = await entityConfig.resolver({ supabase, businessId, [`${entityConfig.key}Name`]: entityConfig.name });
        if (resolution.notFound) return { success: false, message: `❌ ${entityConfig.key === 'customer' ? 'Pelanggan' : entityConfig.key === 'product' ? 'Produk' : 'Supplier'} "${entityConfig.name}" tidak ditemukan. Tidak ada data yang diubah.` };
        if (resolution.ambiguous) return { success: false, ambiguous: true, message: `Data mana yang dimaksud?\n\n${resolution.options.map((option, index) => `[${index + 1}] ${option}`).join('\n')}\n\nTidak ada data yang diubah.` };
        const record = resolution[entityConfig.key];
        if (intent.startsWith('DELETE_')) {
          const { error } = await supabase.from(entityConfig.table).delete().eq('id', record.id).eq('business_id', businessId);
          if (error) return { success: false, message: `❌ Gagal menghapus ${entityConfig.key}: ${error.message}` };
          return { success: true, message: `✅ ${entityConfig.key === 'customer' ? 'Pelanggan' : entityConfig.key === 'product' ? 'Produk' : 'Supplier'} *${record.name}* berhasil dihapus.`, data: record };
        }
        const changes = {};
        if (data.email) changes.email = data.email;
        if (data.phone) changes.phone = data.phone;
        if (data.selling_price !== undefined && entityConfig.table === 'products') changes.unit_price = data.selling_price;
        if (!Object.keys(changes).length) return { success: false, message: `❌ Belum ada perubahan yang dapat diterapkan pada ${record.name}.` };
        const { error } = await supabase.from(entityConfig.table).update(changes).eq('id', record.id).eq('business_id', businessId);
        if (error) return { success: false, message: `❌ Gagal memperbarui ${entityConfig.key}: ${error.message}` };
        return { success: true, message: `✅ ${entityConfig.key === 'customer' ? 'Pelanggan' : entityConfig.key === 'product' ? 'Produk' : 'Supplier'} *${record.name}* berhasil diperbarui.`, data: { ...record, ...changes } };
      }

      // ════════════════════════════════════════════════════════
      // 2. CREATE PRODUCT
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.CREATE_PRODUCT: {
        const productName = (data.name || '').trim();
        const purchasePrice = Number(data.purchase_price) || 0;
        const sellingPrice = Number(data.selling_price) || 0;
        const initialStock = Number(data.initial_stock) || 0;
        const warehouse = (data.warehouse || 'Gudang Utama').trim();
        const unit = (data.unit || 'pcs').trim();
        const category = (data.category || '').trim();

        // 1. Insert into products
        const { data: newProd, error: prodErr } = await supabase
          .from('products')
          .insert({
            business_id: businessId,
            name: productName,
            unit_price: sellingPrice,
            cost_price: purchasePrice,
            unit,
            category,
            is_active: true
          })
          .select('id, name, unit_price, cost_price')
          .single();

        if (prodErr || !newProd) {
          console.error('[Operational] Failed to insert product:', prodErr?.message);
          return {
            success: false,
            message: `❌ Belum berhasil dicatat\n\nAlasan: Gagal menyimpan data produk (${prodErr?.message || 'Database error'})`
          };
        }

        // 2. Insert into inventory
        const { error: invErr } = await supabase
          .from('inventory')
          .insert({
            product_id: newProd.id,
            quantity: initialStock,
            min_stock: Number(data.min_stock) || 0,
            location: warehouse,
            updated_at: new Date().toISOString()
          });

        if (invErr) {
          console.error('[Operational] Failed to insert inventory:', invErr.message);
        }

        // 3. Record stock movement if initial stock > 0
        if (initialStock > 0) {
          await supabase
            .from('stock_movements')
            .insert({
              product_id: newProd.id,
              business_id: businessId,
              movement_type: 'stock_in',
              quantity: initialStock,
              stock_before: 0,
              stock_after: initialStock,
              reason: 'Stok awal',
              reference_type: 'manual'
            });
        }

        const reply = [
          '✅ *Berhasil dicatat*',
          '',
          `Produk: *${newProd.name}*`,
          `Harga beli: ${formatCurrency(purchasePrice)}`,
          `Harga jual: ${formatCurrency(sellingPrice)}`,
          `Stok awal: ${initialStock} ${unit}`,
          `Gudang: ${warehouse}`,
          '',
          'Data sudah diperbarui di BisnisSehat.'
        ].join('\n');

        return {
          success: true,
          message: reply,
          data: { productId: newProd.id, name: newProd.name, initialStock, warehouse }
        };
      }

      // ════════════════════════════════════════════════════════
      // 3. ADD STOCK
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.ADD_STOCK: {
        const resolution = await resolveProduct({
          supabase,
          businessId,
          productName: data.product_name,
          productId: data.product_id
        });

        if (resolution.notFound) {
          return {
            success: false,
            message: `❌ Belum berhasil dicatat\n\nAlasan: Produk "${data.product_name}" tidak ditemukan di database BisnisSehat.`
          };
        }

        if (resolution.ambiguous) {
          const list = resolution.options.map((opt, i) => `[${i + 1}] ${opt}`).join('\n');
          return {
            success: false,
            ambiguous: true,
            message: `Produk mana yang dimaksud?\n\n${list}\n\nSilakan ketik nama produk yang lebih spesifik.`
          };
        }

        const product = resolution.product;
        const addQty = Number(data.quantity);
        const warehouse = (data.warehouse || '').trim();
        const reason = data.reason || 'Restock WhatsApp';

        // Check existing inventory
        const { data: invRows } = await supabase
          .from('inventory')
          .select('id, quantity, location')
          .eq('product_id', product.id);

        let inv = invRows && invRows.length > 0 ? invRows[0] : null;
        const currentStock = inv ? Number(inv.quantity || 0) : 0;
        const newStock = currentStock + addQty;
        const targetLocation = warehouse || (inv?.location) || 'Gudang Utama';

        if (inv) {
          await supabase
            .from('inventory')
            .update({
              quantity: newStock,
              location: targetLocation,
              updated_at: new Date().toISOString()
            })
            .eq('id', inv.id);
        } else {
          await supabase
            .from('inventory')
            .insert({
              product_id: product.id,
              quantity: newStock,
              min_stock: 0,
              location: targetLocation,
              updated_at: new Date().toISOString()
            });
        }

        // Record stock movement
        await supabase
          .from('stock_movements')
          .insert({
            product_id: product.id,
            business_id: businessId,
            movement_type: 'stock_in',
            quantity: addQty,
            stock_before: currentStock,
            stock_after: newStock,
            reason,
            reference_type: 'manual'
          });

        const reply = [
          '✅ *Berhasil dicatat*',
          '',
          `Produk: *${product.name}*`,
          `Stok bertambah: +${addQty} ${data.unit || product.unit || 'pcs'}`,
          `Stok sekarang: *${newStock}* ${data.unit || product.unit || 'pcs'}`,
          `Gudang: ${targetLocation}`,
          '',
          'Data sudah diperbarui di BisnisSehat.'
        ].join('\n');

        return {
          success: true,
          message: reply,
          data: { productId: product.id, name: product.name, currentStock: newStock }
        };
      }

      // ════════════════════════════════════════════════════════
      // 4. REDUCE STOCK
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.REDUCE_STOCK: {
        const resolution = await resolveProduct({
          supabase,
          businessId,
          productName: data.product_name,
          productId: data.product_id
        });

        if (resolution.notFound) {
          return {
            success: false,
            message: `❌ Belum berhasil dicatat\n\nAlasan: Produk "${data.product_name}" tidak ditemukan di database BisnisSehat.`
          };
        }

        if (resolution.ambiguous) {
          const list = resolution.options.map((opt, i) => `[${i + 1}] ${opt}`).join('\n');
          return {
            success: false,
            ambiguous: true,
            message: `Produk mana yang dimaksud?\n\n${list}`
          };
        }

        const product = resolution.product;
        const reduceQty = Number(data.quantity);
        const reason = data.reason || 'Penyesuaian stok keluar';

        const { data: invRows } = await supabase
          .from('inventory')
          .select('id, quantity, location')
          .eq('product_id', product.id);

        const inv = invRows && invRows.length > 0 ? invRows[0] : null;
        const currentStock = inv ? Number(inv.quantity || 0) : 0;

        if (currentStock < reduceQty) {
          return {
            success: false,
            message: `❌ *Belum berhasil dicatat*\n\nAlasan: Stok tidak mencukupi. Stok saat ini: ${currentStock}, diminta: ${reduceQty}.`
          };
        }

        const newStock = currentStock - reduceQty;
        await supabase
          .from('inventory')
          .update({
            quantity: newStock,
            updated_at: new Date().toISOString()
          })
          .eq('id', inv.id);

        await supabase
          .from('stock_movements')
          .insert({
            product_id: product.id,
            business_id: businessId,
            movement_type: 'stock_out',
            quantity: reduceQty,
            stock_before: currentStock,
            stock_after: newStock,
            reason,
            reference_type: 'manual'
          });

        const reply = [
          '✅ *Berhasil dicatat*',
          '',
          `Produk: *${product.name}*`,
          `Stok berkurang: -${reduceQty} ${product.unit || 'pcs'}`,
          `Stok sekarang: *${newStock}* ${product.unit || 'pcs'}`,
          `Alasan: ${reason}`,
          '',
          'Data sudah diperbarui di BisnisSehat.'
        ].join('\n');

        return {
          success: true,
          message: reply,
          data: { productId: product.id, name: product.name, currentStock: newStock }
        };
      }

      // ════════════════════════════════════════════════════════
      // 4b. STOCK TRANSFER (MOVE STORAGE LOCATION)
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.STOCK_TRANSFER: {
        const resolution = await resolveProduct({
          supabase,
          businessId,
          productName: data.product_name,
          productId: data.product_id
        });

        if (resolution.notFound) {
          return {
            success: false,
            message: `❌ Belum berhasil dicatat\n\nAlasan: Produk "${data.product_name}" tidak ditemukan di database BisnisSehat.`
          };
        }

        if (resolution.ambiguous) {
          const list = resolution.options.map((opt, i) => `[${i + 1}] ${opt}`).join('\n');
          return {
            success: false,
            ambiguous: true,
            message: `Produk mana yang dimaksud?\n\n${list}`
          };
        }

        const product = resolution.product;
        const toLocation = (data.to_location || '').trim();
        const fromLocation = (data.from_location || '').trim();
        const transferQty = Number(data.quantity) || null;

        const { data: invRows } = await supabase
          .from('inventory')
          .select('id, quantity, location')
          .eq('product_id', product.id);

        let inv = invRows && invRows.length > 0 ? invRows[0] : null;
        const currentStock = inv ? Number(inv.quantity || 0) : 0;
        const currentLoc = inv?.location || fromLocation || 'Gudang Utama';

        if (transferQty !== null && transferQty > currentStock) {
          return {
            success: false,
            message: `❌ Belum berhasil dicatat\n\nAlasan: Jumlah transfer (${transferQty}) melebihi stok yang tersedia (${currentStock}).`
          };
        }

        if (inv) {
          await supabase
            .from('inventory')
            .update({
              location: toLocation,
              updated_at: new Date().toISOString()
            })
            .eq('id', inv.id);
        } else {
          await supabase
            .from('inventory')
            .insert({
              product_id: product.id,
              quantity: 0,
              min_stock: 0,
              location: toLocation,
              updated_at: new Date().toISOString()
            });
        }

        const qtyDisplay = transferQty ? `${transferQty} ${product.unit || 'pcs'}` : `Semua (${currentStock} ${product.unit || 'pcs'})`;

        const reply = [
          '✅ *Transfer stok berhasil dicatat.*',
          '',
          `Produk: *${product.name}*`,
          `Dari: ${currentLoc}`,
          `Ke: *${toLocation}*`,
          `Jumlah: ${qtyDisplay}`,
          '',
          'Lokasi penyimpanan di BisnisSehat sudah diperbarui.'
        ].join('\n');

        return {
          success: true,
          message: reply,
          data: {
            productId: product.id,
            name: product.name,
            fromLocation: currentLoc,
            toLocation,
            quantity: transferQty || currentStock
          }
        };
      }

      // ════════════════════════════════════════════════════════
      // 5. CREATE SUPPLIER
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.CREATE_SUPPLIER: {
        const name = (data.name || '').trim();
        const email = (data.email || '').trim();
        const phone = (data.phone || '').trim();
        const address = (data.address || '').trim();
        const contactPerson = (data.contact_person || name).trim();
        const notes = (data.notes || '').trim();

        const { data: newSupp, error: suppErr } = await supabase
          .from('suppliers')
          .insert({
            business_id: businessId,
            name,
            email,
            phone,
            address,
            contact: contactPerson,
            contact_person: contactPerson,
            notes,
            is_active: true
          })
          .select('id, name, email, phone, address')
          .single();

        if (suppErr || !newSupp) {
          console.error('[Operational] Supplier insert failed:', suppErr?.message);
          return {
            success: false,
            message: `❌ Gagal menambahkan supplier: ${suppErr?.message || 'Database error'}`
          };
        }

        const reply = [
          '✅ *Supplier berhasil ditambahkan.*',
          '',
          `Nama: *${newSupp.name}*`,
          newSupp.email ? `Email: ${newSupp.email}` : '',
          newSupp.phone ? `Nomor: ${newSupp.phone}` : '',
          newSupp.address ? `Alamat: ${newSupp.address}` : '',
          '',
          'Data sudah tersimpan di BisnisSehat.'
        ].filter(Boolean).join('\n');

        return { success: true, message: reply, data: newSupp };
      }

      // ════════════════════════════════════════════════════════
      // 6. CREATE CUSTOMER
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.CREATE_CUSTOMER: {
        const name = (data.name || '').trim();
        const email = (data.email || '').trim();
        const phone = (data.phone || '').trim();
        const address = (data.address || '').trim();
        const notes = (data.notes || '').trim();

        const { data: newCust, error: custErr } = await supabase
          .from('customers')
          .insert({
            business_id: businessId,
            name,
            email,
            phone,
            address,
            notes
          })
          .select('id, name, email, phone, address')
          .single();

        if (custErr || !newCust) {
          console.error('[Operational] Customer insert failed:', custErr?.message);
          return {
            success: false,
            message: `❌ Gagal menambahkan pelanggan: ${custErr?.message || 'Database error'}`
          };
        }

        const reply = [
          '✅ *Pelanggan berhasil ditambahkan.*',
          '',
          `Nama: *${newCust.name}*`,
          newCust.phone ? `Nomor: ${newCust.phone}` : '',
          newCust.email ? `Email: ${newCust.email}` : '',
          newCust.address ? `Alamat: ${newCust.address}` : '',
          '',
          'Data sudah tersimpan di BisnisSehat.'
        ].filter(Boolean).join('\n');

        return { success: true, message: reply, data: newCust };
      }

      // ════════════════════════════════════════════════════════
      // 7. CREATE EXPENSE
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.CREATE_EXPENSE: {
        const amount = Number(data.amount) || 0;
        const category = (data.category || 'Operasional').trim();
        const description = (data.description || 'Pengeluaran operasional').trim();
        const expenseDate = data.expense_date || new Date().toISOString().split('T')[0];

        const { data: newExp, error: expErr } = await supabase
          .from('expenses')
          .insert({
            business_id: businessId,
            amount,
            category,
            description,
            expense_date: expenseDate,
            notes: data.notes || ''
          })
          .select('id, amount, category, description, expense_date')
          .single();

        if (expErr || !newExp) {
          console.error('[Operational] Expense insert failed:', expErr?.message);
          return {
            success: false,
            message: `❌ Gagal mencatat pengeluaran: ${expErr?.message || 'Database error'}`
          };
        }

        const reply = [
          '✅ *Pengeluaran berhasil dicatat.*',
          '',
          `Nominal: *${formatCurrency(newExp.amount)}*`,
          `Kategori: ${newExp.category}`,
          `Keterangan: ${newExp.description}`,
          `Tanggal: ${newExp.expense_date}`,
          '',
          'Data sudah masuk ke Laporan Keuangan BisnisSehat.'
        ].join('\n');

        return { success: true, message: reply, data: newExp };
      }

      // ════════════════════════════════════════════════════════
      // 8. CREATE INCOME
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.CREATE_INCOME: {
        const amount = Number(data.amount) || 0;
        const description = (data.description || 'Pemasukan operasional').trim();
        const saleDate = data.sale_date || new Date().toISOString().split('T')[0];

        const { data: newIncome, error: incErr } = await supabase
          .from('sales')
          .insert({
            business_id: businessId,
            product_id: null,
            quantity: 1,
            unit_price: amount,
            total: amount,
            notes: description,
            sale_date: saleDate
          })
          .select('id, total, notes, sale_date')
          .single();

        if (incErr || !newIncome) {
          console.error('[Operational] Income insert failed:', incErr?.message);
          return {
            success: false,
            message: `❌ Gagal mencatat pemasukan: ${incErr?.message || 'Database error'}`
          };
        }

        const reply = [
          '✅ *Pemasukan berhasil dicatat.*',
          '',
          `Nominal: *${formatCurrency(newIncome.total)}*`,
          `Keterangan: ${newIncome.notes}`,
          `Tanggal: ${newIncome.sale_date}`,
          '',
          'Data sudah masuk ke Laporan Keuangan BisnisSehat.'
        ].join('\n');

        return { success: true, message: reply, data: newIncome };
      }

      // ════════════════════════════════════════════════════════
      // 9. CREATE SALE
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.CREATE_SALE: {
        let product = null;
        if (data.product_name || data.product_id) {
          const resolution = await resolveProduct({
            supabase,
            businessId,
            productName: data.product_name,
            productId: data.product_id
          });
          if (resolution.product) {
            product = resolution.product;
          }
        }

        const quantity = Number(data.quantity) || 1;
        const unitPrice = Number(data.unit_price) || (product ? Number(product.unit_price) : 0);
        const total = Number(data.total) || (unitPrice * quantity);
        const saleDate = data.sale_date || new Date().toISOString().split('T')[0];
        const notes = data.notes || (product ? `Penjualan ${product.name}` : data.product_name);

        const { data: newSale, error: saleErr } = await supabase
          .from('sales')
          .insert({
            business_id: businessId,
            product_id: product ? product.id : null,
            quantity,
            unit_price: unitPrice,
            total,
            notes,
            sale_date: saleDate
          })
          .select('id, total, quantity, notes, sale_date')
          .single();

        if (saleErr || !newSale) {
          return {
            success: false,
            message: `❌ Gagal mencatat penjualan: ${saleErr?.message || 'Database error'}`
          };
        }

        // Deduct inventory if product exists
        if (product) {
          const { data: invRows } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', product.id);

          if (invRows && invRows.length > 0) {
            const inv = invRows[0];
            const currentStock = Number(inv.quantity || 0);
            const newStock = Math.max(0, currentStock - quantity);

            await supabase
              .from('inventory')
              .update({ quantity: newStock, updated_at: new Date().toISOString() })
              .eq('id', inv.id);

            await supabase
              .from('stock_movements')
              .insert({
                product_id: product.id,
                business_id: businessId,
                movement_type: 'stock_out',
                quantity,
                stock_before: currentStock,
                stock_after: newStock,
                reason: `Penjualan #${newSale.id.slice(0, 8)}`,
                reference_type: 'sale',
                reference_id: newSale.id
              });
          }
        }

        const reply = [
          '✅ *Penjualan berhasil dicatat.*',
          '',
          `Barang/Keterangan: *${product ? product.name : data.product_name}*`,
          `Jumlah: ${quantity} ${product?.unit || 'pcs'}`,
          `Total: *${formatCurrency(total)}*`,
          `Tanggal: ${saleDate}`,
          product ? 'Stok produk otomatis dikurangi.' : '',
          '',
          'Data sudah tersimpan di BisnisSehat.'
        ].filter(Boolean).join('\n');

        return { success: true, message: reply, data: newSale };
      }

      // ════════════════════════════════════════════════════════
      // 10. CREATE PURCHASE
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.CREATE_PURCHASE: {
        let product = null;
        if (data.product_name || data.product_id) {
          const resolution = await resolveProduct({
            supabase,
            businessId,
            productName: data.product_name,
            productId: data.product_id
          });
          if (resolution.product) {
            product = resolution.product;
          }
        }

        const quantity = Number(data.quantity) || 1;
        const unitPrice = Number(data.unit_price) || (product ? Number(product.cost_price) : 0);
        const total = Number(data.total) || (unitPrice * quantity);
        const purchaseDate = data.purchase_date || new Date().toISOString().split('T')[0];
        const supplierText = data.supplier_name ? ` dari ${data.supplier_name}` : '';
        const description = data.notes || `Pembelian ${product ? product.name : data.product_name} (${quantity} unit)${supplierText}`;

        // Insert into expenses
        const { data: newExp, error: expErr } = await supabase
          .from('expenses')
          .insert({
            business_id: businessId,
            category: 'Bahan Baku',
            description,
            amount: total,
            expense_date: purchaseDate
          })
          .select('id, amount, description, expense_date')
          .single();

        if (expErr || !newExp) {
          return {
            success: false,
            message: `❌ Gagal mencatat pembelian: ${expErr?.message || 'Database error'}`
          };
        }

        // Add inventory if product exists
        if (product) {
          const { data: invRows } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', product.id);

          if (invRows && invRows.length > 0) {
            const inv = invRows[0];
            const currentStock = Number(inv.quantity || 0);
            const newStock = currentStock + quantity;

            await supabase
              .from('inventory')
              .update({ quantity: newStock, updated_at: new Date().toISOString() })
              .eq('id', inv.id);

            await supabase
              .from('stock_movements')
              .insert({
                product_id: product.id,
                business_id: businessId,
                movement_type: 'stock_in',
                quantity,
                stock_before: currentStock,
                stock_after: newStock,
                reason: `Pembelian stok #${newExp.id.slice(0, 8)}`,
                reference_type: 'purchase',
                reference_id: newExp.id
              });
          }
        }

        const reply = [
          '✅ *Pembelian berhasil dicatat.*',
          '',
          `Barang: *${product ? product.name : data.product_name}*`,
          `Jumlah: ${quantity} ${product?.unit || 'pcs'}`,
          `Total: *${formatCurrency(total)}*`,
          data.supplier_name ? `Supplier: ${data.supplier_name}` : '',
          product ? 'Stok produk otomatis bertambah.' : '',
          '',
          'Biaya pembelian telah tercatat di Laporan Keuangan.'
        ].filter(Boolean).join('\n');

        return { success: true, message: reply, data: newExp };
      }

      // ════════════════════════════════════════════════════════
      // 11. CREATE INVOICE
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.CREATE_INVOICE: {
        let customer = null;
        if (data.customer_name || data.customer_id) {
          const custRes = await resolveCustomer({
            supabase,
            businessId,
            customerName: data.customer_name,
            customerId: data.customer_id
          });
          if (custRes.customer) customer = custRes.customer;
        }

        const invoiceNumber = (data.invoice_number || `INV-${Date.now().toString().slice(-6)}`).trim();
        const amount = Number(data.amount) || 0;
        const dueDate = data.due_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

        const { data: newInv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            business_id: businessId,
            customer_id: customer ? customer.id : null,
            invoice_number: invoiceNumber,
            amount,
            paid_amount: 0,
            status: 'pending',
            issue_date: new Date().toISOString().split('T')[0],
            due_date: dueDate,
            notes: data.notes || ''
          })
          .select('id, invoice_number, amount, status, due_date')
          .single();

        if (invErr || !newInv) {
          return {
            success: false,
            message: `❌ Gagal membuat invoice: ${invErr?.message || 'Database error'}`
          };
        }

        const reply = [
          '✅ *Invoice berhasil dibuat.*',
          '',
          `Nomor Invoice: *${newInv.invoice_number}*`,
          customer ? `Pelanggan: ${customer.name}` : '',
          `Total Tagihan: *${formatCurrency(newInv.amount)}*`,
          `Jatuh Tempo: ${newInv.due_date}`,
          'Status: Belum Dibayar (Pending)',
          '',
          'Data tersimpan di modul Invoice BisnisSehat.'
        ].filter(Boolean).join('\n');

        return { success: true, message: reply, data: newInv };
      }

      // ════════════════════════════════════════════════════════
      // 12. RECORD PAYMENT
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.RECORD_PAYMENT: {
        const resolution = await resolveInvoice({
          supabase,
          businessId,
          invoiceNumber: data.invoice_number,
          invoiceId: data.invoice_id
        });

        if (resolution.notFound) {
          return {
            success: false,
            message: `❌ *Belum berhasil dicatat*\n\nAlasan: Invoice "${data.invoice_number}" tidak ditemukan.`
          };
        }

        if (resolution.ambiguous) {
          const list = resolution.options.map((opt, i) => `[${i + 1}] ${opt}`).join('\n');
          return {
            success: false,
            ambiguous: true,
            message: `Invoice mana yang dimaksud?\n\n${list}`
          };
        }

        const invoice = resolution.invoice;
        const payAmount = Number(data.amount);
        const paymentDate = data.payment_date || new Date().toISOString().split('T')[0];
        const method = data.method || 'Cash';

        // 1. Insert invoice payment
        const { error: payErr } = await supabase
          .from('invoice_payments')
          .insert({
            business_id: businessId,
            invoice_id: invoice.id,
            amount: payAmount,
            payment_date: paymentDate,
            method,
            notes: data.notes || 'Pembayaran via WhatsApp'
          });

        if (payErr) {
          return {
            success: false,
            message: `❌ Gagal mencatat pembayaran invoice: ${payErr.message}`
          };
        }

        // 2. Update invoice paid amount and status
        const newPaid = Number(invoice.paid_amount || 0) + payAmount;
        const invoiceTotal = Number(invoice.amount || 0);
        const newStatus = newPaid >= invoiceTotal ? 'paid' : 'partially_paid';

        await supabase
          .from('invoices')
          .update({
            paid_amount: newPaid,
            status: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', invoice.id);

        const reply = [
          '✅ *Pembayaran invoice berhasil dicatat.*',
          '',
          `Invoice: *${invoice.invoice_number}*`,
          `Nominal Dibayar: *${formatCurrency(payAmount)}*`,
          `Total Terbayar: ${formatCurrency(newPaid)} / ${formatCurrency(invoiceTotal)}`,
          `Metode: ${method}`,
          `Status Tagihan: ${newStatus === 'paid' ? 'LUNAS ✅' : 'SEBAGIAN DIBAYAR ⏳'}`,
          '',
          'Data sudah diperbarui di BisnisSehat.'
        ].join('\n');

        return {
          success: true,
          message: reply,
          data: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, paidAmount: newPaid, status: newStatus }
        };
      }

      // ════════════════════════════════════════════════════════
      // 13. WAREHOUSE (HONEST NOTIFICATION)
      // ════════════════════════════════════════════════════════
      case OPERATIONAL_INTENTS.CREATE_WAREHOUSE:
      case OPERATIONAL_INTENTS.UPDATE_WAREHOUSE:
      case OPERATIONAL_INTENTS.DELETE_WAREHOUSE: {
        return {
          success: true,
          message: [
            'ℹ️ *Manajemen Gudang Mandiri*',
            '',
            'Tabel database khusus untuk multi-gudang mandiri belum tersedia di database BisnisSehat saat ini.',
            '',
            '💡 *Solusi saat ini:*',
            `Nama gudang seperti "${data.name || 'Gudang Utama'}" langsung disimpan sebagai lokasi penyimpanan pada setiap produk dan persediaan stok.`
          ].join('\n'),
          data: { warehouseName: data.name, locationMode: 'inventory_location' }
        };
      }

      default:
        return {
          success: false,
          message: 'Perintah belum dikenali. Ketik *menu* untuk melihat opsi operasional.'
        };
    }
  } catch (error) {
    console.error('[Operational] Execution error:', error.message);
    return {
      success: false,
      message: `❌ Terjadi kesalahan saat memproses operasional: ${error.message}`
    };
  }
}
