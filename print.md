FIX ONLY — THERMAL RECEIPT PRINT PAGE SIZE

Screenshot menunjukkan bug nyata:
Receipt 58mm sudah benar secara konten, tetapi saat Chrome Print Preview / Save as PDF, output menjadi halaman A4/Letter dengan receipt hanya di bagian atas dan ruang kosong sangat besar.

JANGAN mengubah desain/isi receipt yang sekarang.
JANGAN mengubah POS/order/payment logic.
Fokus hanya pada PRINT OUTPUT GEOMETRY.

Target:
Receipt thermal harus benar-benar mengikuti panjang konten.

Untuk mode 58mm:
- width: 58mm
- height: auto / content-driven
- margin: 0
- padding sesuai receipt
- tidak boleh menghasilkan A4/Letter canvas
- tidak boleh ada min-height: 100vh
- tidak boleh ada fixed page height seperti 297mm
- tidak boleh menggunakan container print yang mempertahankan tinggi viewport
- receipt harus menjadi satu continuous thermal document

Audit:
1. Buka receiptPrinter.js dan seluruh CSS/HTML print receipt.
2. Cari semua:
   - @page
   - width/height
   - min-height
   - height: 100vh
   - 297mm / 210mm
   - A4 / Letter
   - position: fixed
   - overflow
   - iframe print sizing
3. Pastikan print iframe hanya berisi receipt thermal, bukan wrapper dashboard/modal yang punya tinggi layar.
4. @media print harus secara eksplisit menghilangkan layout dashboard/modal dan hanya mencetak `.receipt`.
5. Jangan gunakan `visibility:hidden` pada wrapper yang masih mempertahankan layout height.
6. Jangan gunakan fixed-height page container.

Gunakan pola sederhana seperti:

@page {
  size: 58mm auto;
  margin: 0;
}

html,
body {
  width: 58mm;
  margin: 0;
  padding: 0;
}

.receipt {
  width: 58mm;
  height: auto;
  min-height: 0;
  margin: 0;
  padding: ...;
  box-sizing: border-box;
}

Semua tinggi harus content-driven.

PENTING:
Browser print engine punya keterbatasan terhadap `@page size: 58mm auto`.
Jadi jangan hanya mengganti CSS lalu mengklaim selesai.

Verifikasi dengan actual browser:
A. Receipt pendek:
   - 2 item
   - print preview harus hanya setinggi konten, bukan A4.

B. Receipt panjang:
   - banyak item
   - tinggi bertambah mengikuti jumlah item.

C. Text wrapping:
   - nama produk panjang
   - receipt tetap memanjang secara vertikal.

D. Save as PDF:
   - hasil PDF tidak berupa A4 kosong dengan receipt kecil di atas.
   - receipt harus memenuhi lebar thermal 58mm dan tinggi mengikuti konten.

E. Pastikan 80mm mode tetap bekerja:
   - width 80mm
   - content-driven height.

Jangan berhenti pada:
"npm run build sukses".

Build/test tetap jalankan setelah fix, tetapi WAJIB lakukan browser Print Preview untuk membuktikan ukuran fisiknya benar.

Jika Chrome tetap memaksa pagination ke A4 karena keterbatasan native print preview, identifikasi akar masalahnya dan gunakan pendekatan iframe/document print yang paling tepat untuk thermal printer, bukan sekadar mengecilkan receipt di dalam halaman A4.

Output akhir harus menyebut:
- file yang benar-benar diubah
- akar masalah
- solusi
- hasil browser Print Preview 58mm
- hasil 80mm
- test/build.
