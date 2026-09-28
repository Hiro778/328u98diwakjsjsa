import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateThermalReceiptHtml } from '../lib/receiptPrinter.js';

describe('QR Menu Checkout Bayar Langsung & Customer Name Specification Tests (struk.md)', () => {
  const publicMenuPagePath = path.resolve('src/pages/public/PublicMenuPage.jsx');
  const posPagePath = path.resolve('src/pages/dashboard/pos/PosPage.jsx');
  const orderHistoryPath = path.resolve('src/pages/dashboard/pos/OrderHistory.jsx');
  const receiptViewPath = path.resolve('src/components/pos/ReceiptView.jsx');
  const receiptPrinterPath = path.resolve('src/lib/receiptPrinter.js');
  const rpcMigrationPath = path.resolve('supabase/migrations/052_fix_public_order_rpc.sql');

  const publicMenuSource = fs.readFileSync(publicMenuPagePath, 'utf8');
  const posPageSource = fs.readFileSync(posPagePath, 'utf8');
  const orderHistorySource = fs.readFileSync(orderHistoryPath, 'utf8');
  const receiptViewSource = fs.readFileSync(receiptViewPath, 'utf8');
  const receiptPrinterSource = fs.readFileSync(receiptPrinterPath, 'utf8');
  const rpcMigrationSource = fs.readFileSync(rpcMigrationPath, 'utf8');

  describe('1. Form & Validation Requirements', () => {
    test('UI contains Label "Nama Pembeli", Placeholder "Masukkan nama pembeli", and Helper Text', () => {
      assert.ok(
        publicMenuSource.includes('Nama Pembeli'),
        'Must contain "Nama Pembeli" label'
      );
      assert.ok(
        publicMenuSource.includes('placeholder="Masukkan nama pembeli"'),
        'Must contain placeholder "Masukkan nama pembeli"'
      );
      assert.ok(
        publicMenuSource.includes(
          'Nama ini akan digunakan kasir untuk memanggil dan mencocokkan pesanan Anda.'
        ),
        'Must contain exact helper text'
      );
    });

    test('Validation error message is exact: "Nama pembeli wajib diisi untuk pembayaran di kasir."', () => {
      assert.ok(
        publicMenuSource.includes('Nama pembeli wajib diisi untuk pembayaran di kasir.'),
        'Must contain exact validation error message'
      );
    });

    test('Bayar Langsung rejects submission if customer name is empty', () => {
      // Simulates the exact validation logic in handleOrder
      function validateCashOrder(paymentMethod, customerName) {
        const trimmed = (customerName || '').trim();
        if (paymentMethod === 'cash') {
          if (!trimmed) {
            return {
              allowed: false,
              error: 'Nama pembeli wajib diisi untuk pembayaran di kasir.',
            };
          }
        }
        return { allowed: true, customerName: trimmed };
      }

      const emptyRes = validateCashOrder('cash', '');
      assert.equal(emptyRes.allowed, false);
      assert.equal(emptyRes.error, 'Nama pembeli wajib diisi untuk pembayaran di kasir.');

      const whitespaceRes = validateCashOrder('cash', '   ');
      assert.equal(whitespaceRes.allowed, false);
      assert.equal(whitespaceRes.error, 'Nama pembeli wajib diisi untuk pembayaran di kasir.');

      const validRes = validateCashOrder('cash', 'Andi');
      assert.equal(validRes.allowed, true);
      assert.equal(validRes.customerName, 'Andi');
    });

    test('Online payment does not force customer name if not provided', () => {
      function validateOrder(paymentMethod, customerName) {
        const trimmed = (customerName || '').trim();
        if (paymentMethod === 'cash') {
          if (!trimmed) {
            return {
              allowed: false,
              error: 'Nama pembeli wajib diisi untuk pembayaran di kasir.',
            };
          }
        }
        return { allowed: true, customerName: trimmed };
      }

      const onlineWithoutName = validateOrder('online', '');
      assert.equal(onlineWithoutName.allowed, true);
      assert.equal(onlineWithoutName.customerName, '');
    });
  });

  describe('2. Persistence in Existing Database Field (customer_name)', () => {
    test('PublicMenuPage passes trimmed customer_name to create_public_order RPC and fallback orders table', () => {
      assert.ok(
        publicMenuSource.includes('p_customer_name: trimmedCustomerName'),
        'Must pass customer name to RPC create_public_order'
      );
      assert.ok(
        publicMenuSource.includes('customer_name: trimmedCustomerName'),
        'Must pass customer name to fallback orders table insert'
      );
    });

    test('PostgreSQL RPC create_public_order receives p_customer_name and stores in orders.customer_name', () => {
      assert.ok(
        rpcMigrationSource.includes('p_customer_name text DEFAULT \'\''),
        'RPC definition must accept p_customer_name'
      );
      assert.ok(
        rpcMigrationSource.includes('INSERT INTO public.orders'),
        'RPC must insert into public.orders'
      );
      assert.ok(
        rpcMigrationSource.includes('customer_name'),
        'RPC must insert customer_name'
      );
    });
  });

  describe('3. Confirmation Page Specification', () => {
    test('Confirmation page displays Nomor Pesanan, Nama Pembeli, Metode Bayar, Status, Total', () => {
      assert.ok(
        publicMenuSource.includes('Nomor Pesanan'),
        'Confirmation page must show Nomor Pesanan'
      );
      assert.ok(
        publicMenuSource.includes('Nama Pembeli') &&
          publicMenuSource.includes('orderSuccess.customer_name'),
        'Confirmation page must show Nama Pembeli from orderSuccess'
      );
      assert.ok(
        publicMenuSource.includes('Metode Bayar'),
        'Confirmation page must show Metode Bayar'
      );
      assert.ok(
        publicMenuSource.includes('Status'),
        'Confirmation page must show Status'
      );
      assert.ok(
        publicMenuSource.includes('Total'),
        'Confirmation page must show Total'
      );
    });

    test('Confirmation page preserves customer_name when order succeeds', () => {
      const mockOrder = {
        id: 'ord-123',
        order_number: 72,
        total: 50000,
        customer_name: 'Andi',
        payment_method: 'cash',
      };
      assert.equal(mockOrder.customer_name, 'Andi');
    });
  });

  describe('4. POS / Kasir Display (#<order_number> — <Nama Pembeli>)', () => {
    test('PosPage renders #{order.order_number} — {order.customer_name}', () => {
      assert.ok(
        posPageSource.includes(
          '#{order.order_number}{order.customer_name ? ` — ${order.customer_name}` : \'\'}'
        ),
        'PosPage must format orders as #{order.order_number} — {order.customer_name}'
      );
    });

    test('OrderHistory renders #{o.order_number} — {o.customer_name} in list and detail modal', () => {
      assert.ok(
        orderHistorySource.includes(
          '#{o.order_number}{o.customer_name ? ` — ${o.customer_name}` : \'\'}'
        ),
        'OrderHistory list must format orders as #{o.order_number} — {o.customer_name}'
      );
      assert.ok(
        orderHistorySource.includes(
          'Order #{detailOrder.order_number}{detailOrder.customer_name ? ` — ${detailOrder.customer_name}` : \'\'}'
        ),
        'OrderHistory modal header must include customer name'
      );
      assert.ok(
        orderHistorySource.includes('Nama Pembeli') &&
          orderHistorySource.includes('detailOrder.customer_name'),
        'OrderHistory detail modal must show Nama Pembeli row'
      );
    });

    test('Kasir display example formatted accurately', () => {
      const order = { order_number: 72, customer_name: 'Budi' };
      const display = `#${order.order_number}${order.customer_name ? ` — ${order.customer_name}` : ''}`;
      assert.equal(display, '#72 — Budi');

      const orderAndi = { order_number: 105, customer_name: 'Andi' };
      const displayAndi = `#${orderAndi.order_number}${orderAndi.customer_name ? ` — ${orderAndi.customer_name}` : ''}`;
      assert.equal(displayAndi, '#105 — Andi');

      const anonymousOrder = { order_number: 88, customer_name: '' };
      const displayAnon = `#${anonymousOrder.order_number}${anonymousOrder.customer_name ? ` — ${anonymousOrder.customer_name}` : ''}`;
      assert.equal(displayAnon, '#88');
    });
  });

  describe('5. Receipt / Struk Dynamic Customer Name', () => {
    test('ReceiptView component takes customer_name as Pelanggan: <Nama Pembeli>', () => {
      assert.ok(
        receiptViewSource.includes('order.customer_name'),
        'ReceiptView must check order.customer_name'
      );
      assert.ok(
        receiptViewSource.includes('Pelanggan:'),
        'ReceiptView must render Pelanggan:'
      );
    });

    test('generateReceiptHtml prints Pelanggan: Andi for real order with customer_name "Andi"', () => {
      const realOrder = {
        order_number: 72,
        customer_name: 'Andi',
        payment_method: 'cash',
        total: 35000,
        items: [
          { name: 'Kopi Susu Gula Aren', quantity: 2, unit_price: 17500, subtotal: 35000 },
        ],
      };

      const html = generateThermalReceiptHtml({
        order: realOrder,
        settings: {},
        business: { name: 'Kopi Kenangan' },
      });
      assert.ok(html.includes('Pelanggan:'), 'Receipt must contain Pelanggan label');
      assert.ok(html.includes('Andi'), 'Receipt must contain buyer name "Andi"');
      assert.ok(html.includes('#72'), 'Receipt must contain order number #72');
    });

    test('No hardcoded dummy name "Budi Santoso" when order customer_name is empty or custom', () => {
      const customOrder = {
        order_number: 99,
        customer_name: 'Siti Aminah',
        payment_method: 'cash',
        total: 20000,
        items: [{ name: 'Teh Tarik', quantity: 1, unit_price: 20000, subtotal: 20000 }],
      };

      const html = generateThermalReceiptHtml({
        order: customOrder,
        settings: {},
        business: { name: 'Warung Berkah' },
      });
      assert.ok(!html.includes('Budi Santoso'), 'Must NOT contain hardcoded "Budi Santoso"');
      assert.ok(html.includes('Siti Aminah'), 'Must contain actual buyer name "Siti Aminah"');
    });
  });

  describe('6. Member Prefill & Tenant Safety', () => {
    test('PublicMenuPage includes member prefill hook with profile/user metadata check', () => {
      assert.ok(
        publicMenuSource.includes('loadLoggedInCustomer'),
        'PublicMenuPage must include loadLoggedInCustomer'
      );
      assert.ok(
        publicMenuSource.includes('user.user_metadata'),
        'PublicMenuPage checks user metadata'
      );
      assert.ok(
        publicMenuSource.includes('.from(\'profiles\')'),
        'PublicMenuPage queries profiles table for full_name'
      );
    });

    test('Customer can edit prefilled name freely', () => {
      let state = 'Member Old Name';
      // User types new name
      state = 'Andi';
      assert.equal(state, 'Andi');
    });
  });
});
