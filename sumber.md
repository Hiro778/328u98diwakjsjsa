STOP. Jangan implementasi realtime dulu.

Audit sebelumnya menemukan masalah yang lebih penting:
Dashboard + Excel menggunakan orders/order_items,
sementara Analytics sebagian menggunakan tabel sales.

Saya ingin SATU sumber kebenaran untuk metrik penjualan.

TASK INI HANYA UNTUK SOURCE-OF-TRUTH AUDIT + FIX.

1. Trace seluruh sumber angka berikut:
   - Dashboard Total Revenue
   - Dashboard Net Profit
   - Analytics Real-time Dashboard
   - Analytics Benchmarking
   - Analytics Weekly Recap
   - Excel Penjualan
   - POS
   - QR Menu orders

2. Tentukan sumber transaksi canonical BisnisSehat.
   Jangan membuat tabel baru.
   Jangan membuat query palsu.
   Jangan mempertahankan dua sumber revenue yang berbeda hanya karena service lama sudah ada.

3. Untuk revenue/transaction/product sold:
   gunakan sumber transaksi yang benar-benar merepresentasikan order final BisnisSehat.

4. Pastikan status order/payment diperhitungkan dengan aturan yang konsisten.
   Jangan menjumlahkan order yang seharusnya cancelled/failed jika memang bukan revenue.

5. Audit khusus:
   - orders.total
   - orders.discount_amount
   - order_items.quantity
   - order_items.subtotal
   - sales
   - inventory
   - payment_status
   - order_status

6. Buat satu service/query aggregation yang menjadi SOURCE OF TRUTH untuk:
   revenue
   transactions
   products sold
   discounts
   losses/profit jika datanya memang tersedia.

7. Dashboard, Analytics, dan Excel preview harus menggunakan aggregation yang sama.

8. JANGAN mengubah UI/design.

9. JANGAN membuat Realtime dulu.
   Setelah source-of-truth konsisten, berhenti dan laporkan:
   - sumber data canonical
   - kenapa dipilih
   - field yang digunakan
   - filter status yang digunakan
   - file/service yang diubah
   - contoh angka sebelum/sesudah

10. Verifikasi dengan database live:
    ambil transaksi aktual tenant aktif dan hitung manual:
    revenue = ...
    transaction count = ...
    product sold = ...

PENTING:
Jangan membuat dokumentasi/artifact baru.
Jangan pakai Context7 kalau tidak diperlukan.
Jangan menjalankan task berat yang tidak berhubungan.
Jangan implementasi WebSocket pada tahap ini.
