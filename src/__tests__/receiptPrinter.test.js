import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateThermalReceiptHtml } from '../lib/receiptPrinter.js';

describe('Thermal Receipt Printer Specification Tests (fix.md)', () => {
  const receiptPrinterPath = path.resolve('src/lib/receiptPrinter.js');
  const receiptViewPath = path.resolve('src/components/pos/ReceiptView.jsx');
  const indexCssPath = path.resolve('src/index.css');

  const mockOrder = {
    id: 'ord-123',
    order_number: '43',
    created_at: '2026-09-20T10:30:00Z',
    table: { name: '04' },
    payment_method: 'cash',
    payment_status: 'paid',
    items: [
      { id: 'i1', product_name: 'Nasi Goreng Spesial', quantity: 2, unit_price: 25000, subtotal: 50000 },
      { id: 'i2', product_name: 'Es Teh Manis', quantity: 2, unit_price: 5000, subtotal: 10000 },
    ],
    subtotal: 60000,
    discount_amount: 5000,
    total: 55000,
  };

  const mockSettings = {
    paper_size: '58mm',
    store_name: 'Kedai Kopi Nusantara',
    store_address: 'Jl. Merdeka No. 45, Jakarta Pusat',
    store_phone: '081234567890',
    header_text: 'Selamat Menikmati Hidangan Kami',
    footer_text: 'Terima kasih atas kunjungan Anda! Silakan datang kembali.',
    show_logo: false,
    show_table: true,
    show_cashier: true,
    show_order_number: true,
  };

  const mockBusiness = {
    id: 'biz-1',
    name: 'Kedai Kopi Nusantara',
    location: 'Jl. Merdeka No. 45, Jakarta Pusat',
    phone: '081234567890',
  };

  describe('1. Thermal HTML Generation & Dimensions', () => {
    test('generates valid standalone HTML with @page paper size 58mm and width 58mm', () => {
      const html = generateThermalReceiptHtml({
        order: mockOrder,
        settings: { ...mockSettings, paper_size: '58mm' },
        business: mockBusiness,
        cashierName: 'Ahmad',
      });

      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('size: 58mm auto;'), 'Must have @page size: 58mm auto');
      assert.ok(html.includes('width: 58mm;'), 'Must have width: 58mm');
      assert.ok(html.includes('margin: 0;'), 'Must have margin: 0');
      assert.ok(!html.toLowerCase().includes('landscape'), 'Must not contain landscape orientation');
      assert.ok(!html.toLowerCase().includes('letter'), 'Must not contain letter size');
      assert.ok(!html.toLowerCase().includes('297mm'), 'Must not contain A4 height 297mm');
      assert.ok(!html.includes('100vh'), 'Must not contain viewport height 100vh');
      assert.ok(html.includes('Kedai Kopi Nusantara'));
      assert.ok(html.includes('Nasi Goreng Spesial'));
      assert.ok(html.includes('Es Teh Manis'));
      assert.ok(html.includes('Terima kasih atas kunjungan Anda!'));
    });

    test('generates valid standalone HTML with @page paper size 80mm', () => {
      const html = generateThermalReceiptHtml({
        order: mockOrder,
        settings: { ...mockSettings, paper_size: '80mm' },
        business: mockBusiness,
        cashierName: 'Ahmad',
      });

      assert.ok(html.includes('size: 80mm auto;'));
      assert.ok(html.includes('width: 80mm;'));
    });

    test('supports long product name word wrapping without truncation', () => {
      const longOrder = {
        ...mockOrder,
        items: [
          { id: 'i1', product_name: 'Ayam Goreng Sambal Matah Spesial Pedas Level 5 Mantap Sekali', quantity: 1, unit_price: 35000, subtotal: 35000 },
        ],
      };

      const html = generateThermalReceiptHtml({
        order: longOrder,
        settings: mockSettings,
        business: mockBusiness,
        cashierName: 'Ahmad',
      });

      assert.ok(html.includes('word-break: break-word;'));
      assert.ok(html.includes('Ayam Goreng Sambal Matah Spesial Pedas Level 5 Mantap Sekali'));
    });

    test('renders single receipt container with page-break-inside avoid (prevent duplicate pages)', () => {
      const html = generateThermalReceiptHtml({
        order: mockOrder,
        settings: mockSettings,
        business: mockBusiness,
        cashierName: 'Ahmad',
      });

      assert.ok(html.includes('page-break-inside: avoid;'));
      assert.ok(html.includes('break-inside: avoid;'));

      // Count occurrences of receipt container — must be exactly 1
      const occurrences = (html.match(/class="[^"]*\breceipt\b[^"]*"/g) || []).length;
      assert.equal(occurrences, 1, 'There must be exactly one receipt container in the print output');
    });

    test('escapes HTML to prevent XSS injection in receipt details', () => {
      const dangerousOrder = {
        ...mockOrder,
        items: [
          { id: 'i1', product_name: '<script>alert("xss")</script> Es Krim', quantity: 1, unit_price: 10000, subtotal: 10000 },
        ],
      };

      const html = generateThermalReceiptHtml({
        order: dangerousOrder,
        settings: { ...mockSettings, footer_text: '<img src=x onerror=alert(1)>' },
        business: mockBusiness,
        cashierName: '<b>Hacker</b>',
      });

      assert.ok(!html.includes('<script>alert("xss")</script>'));
      assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
      assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
      assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    });

    test('contains ZERO hardcoded legacy BisnisSehat branding', () => {
      const html = generateThermalReceiptHtml({
        order: mockOrder,
        settings: mockSettings,
        business: mockBusiness,
        cashierName: 'Ahmad',
      });

      assert.ok(!html.includes('BisnisSehat'), 'Receipt must not have hardcoded BisnisSehat branding');
    });
  });

  describe('2. ReceiptView Integration & Isolated Print Mechanism', () => {
    test('ReceiptView imports and invokes printThermalReceipt instead of window.print()', () => {
      assert.ok(fs.existsSync(receiptViewPath), 'ReceiptView.jsx must exist');
      const viewSrc = fs.readFileSync(receiptViewPath, 'utf8');

      assert.ok(
        viewSrc.includes('printThermalReceipt'),
        'ReceiptView must import and call printThermalReceipt'
      );
      assert.ok(
        !viewSrc.includes('const handlePrint = () => {\n    window.print()'),
        'ReceiptView handlePrint must not directly call window.print()'
      );
    });

    test('receiptPrinter.js defines iframe-based printing to eliminate background UI leakage', () => {
      assert.ok(fs.existsSync(receiptPrinterPath), 'receiptPrinter.js must exist');
      const printerSrc = fs.readFileSync(receiptPrinterPath, 'utf8');

      assert.ok(
        printerSrc.includes('pos-thermal-print-frame'),
        'receiptPrinter must use dedicated iframe id pos-thermal-print-frame'
      );
      assert.ok(
        printerSrc.includes('iframe.contentWindow?.print()'),
        'receiptPrinter must print via iframe.contentWindow'
      );
    });

    test('index.css @media print ensures zero page overflow and avoids duplicate sheets', () => {
      assert.ok(fs.existsSync(indexCssPath), 'index.css must exist');
      const css = fs.readFileSync(indexCssPath, 'utf8');

      assert.ok(css.includes('@media print'));
      assert.ok(css.includes('page-break-after: avoid;'));
      assert.ok(css.includes('break-after: avoid;'));
    });
  });
});
