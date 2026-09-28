BUG LOGIKA / UX DI PRODUCTION CAPACITY.

Di halaman:
 /dashboard/operational/production-capacity

Saat:
Kebutuhan = 30 pcs
Target = 100

sistem menghasilkan:
Dibutuhkan = 3000 pcs

Karena sistem melakukan:
30 × 100 = 3000

Masalahnya: field "Kebutuhan" saat ini ambigu. Saya ingin audit dulu arti field tersebut berdasarkan schema, formula existing, dan logic production capacity.

TASK:

1. TRACE FORMULA EXISTING
Cari source code yang menghitung:
- Kebutuhan
- Target
- Dibutuhkan
- Kekurangan bahan
- Max Batch

Jangan langsung mengubah rumus.

2. TENTUKAN SEMANTIK FIELD
Periksa apakah "Kebutuhan" dimaksudkan sebagai:
A. kebutuhan bahan baku PER BATCH
atau
B. total kebutuhan bahan baku untuk target produksi.

Jangan menebak. Ikuti logic/schema existing.

3. JIKA "KEBUTUHAN" MEMANG PER BATCH:
Rumus:
Total kebutuhan = kebutuhan per batch × target batch

Maka JANGAN mengubah kalkulasinya.

Tetapi ubah label UI supaya jelas:

"Kebutuhan per Batch"

dan target menjadi:

"Target Produksi (Batch)"

Tambahkan unit yang jelas.

Contoh:
Kebutuhan per Batch: 30 pcs
Target Produksi: 100 batch
Total Dibutuhkan: 3.000 pcs

4. JIKA "KEBUTUHAN" MEMANG TOTAL UNTUK TARGET:
Maka JANGAN kalikan lagi dengan target.

Contoh:
Kebutuhan: 30 pcs
Target: 100 pcs
Total Dibutuhkan: 30 pcs

5. PRIORITAS
Sebelum mengubah code:
- inspect calculation function
- inspect data model
- inspect database/schema
- inspect qr/production documentation jika ada
- cari penggunaan field "kebutuhan" di fitur lain

Jangan membuat asumsi.

6. ACCEPTANCE TEST
Test minimal:

Case 1:
Kebutuhan = 30
Target = 100

Case 2:
Kebutuhan = 3000
Target = 100

Case 3:
Kebutuhan = 0
Target = 100

Case 4:
stok tersedia lebih besar dari kebutuhan

Pastikan:
- total kebutuhan
- kekurangan
- max batch
- status target

semuanya konsisten.

SETELAH SELESAI LAPORKAN:
- arti sebenarnya field Kebutuhan
- rumus sebelum
- rumus sesudah jika diubah
- file yang diubah
- contoh hasil Case 1 dan Case 2
- npm test
- npm run build

JANGAN langsung mengubah rumus sebelum memastikan semantic field-nya.
