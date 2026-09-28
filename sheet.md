JANGAN UBAH SOURCE LAGI.

Verifikasi hasil Excel yang baru dibuat.

Saya ingin memastikan 3 hal:

1. "Produk Terjual"
   = SUM(order_items.quantity) untuk transaksi final
   pada periode yang diekspor.

2. "Produk Terlaris"
   = produk dengan SUM(quantity) terbesar,
   bukan jumlah row/order.

3. "Revenue"
   = agregasi transaksi final yang sama dengan source of truth
   Dashboard/Analytics/Excel.

Dan satu hal terakhir:

DataBar conditional formatting JANGAN disebut sebagai
"native Excel chart".

Kalau implementation sekarang masih:

ws.addConditionalFormatting({
  type: 'dataBar',
  ...
})

maka itu hanya DataBar.

Jangan ubah sekarang jika belum diminta.
Cukup laporkan:

- apakah 3 perhitungan di atas benar
- source table + field yang digunakan
- apakah chart saat ini DataBar atau native Excel Chart

Jangan full test.
Jangan Context7.
Jangan artifact.
