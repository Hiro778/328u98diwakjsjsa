AUDIT SUDAH CUKUP. SEKARANG JANGAN BUAT ARSITEKTUR BARU.

Dari audit sebelumnya, resolver getProductImageUrl() sudah mendukung:
- product.image_url
- product.imageUrl
- product.image
- product.images[0]

Tetapi screenshot public menu nyata masih menunjukkan beberapa produk:
"No Image"

Jadi sekarang lakukan DEBUG DATA AKTUAL sampai ditemukan root cause.

==================================================
1. JANGAN ASUMSI
==================================================

Ambil data REAL dari Supabase untuk business yang sedang dibuka:

business/menu ID:
b51fdc7e-6b7d-4207-8b30-d5f02275f686

Inspect product yang tampil:
- iwqheio
- Nasi Goreng Test
- hai

Untuk masing-masing product, tampilkan sementara:

id
name
image_url
imageUrl
image
images

Jangan hanya menjalankan unit test dengan mock object.

==================================================
2. BANDINGKAN PRODUCT YANG BERHASIL

Screenshot menunjukkan product "hai" berhasil menampilkan gambar BS.

Bandingkan data "hai" dengan:
- iwqheio
- Nasi Goreng Test

Cari perbedaan:
- field image
- URL
- storage path
- bucket
- format data

Ini harus menghasilkan root cause yang konkret.

==================================================
3. VALIDASI URL AKTUAL

Untuk setiap product yang memiliki image URL:

print/log URL final setelah getProductImageUrl(product).

Contoh:

PRODUCT: hai
FINAL IMAGE URL: ...

PRODUCT: iwqheio
FINAL IMAGE URL: ...

Kemudian pastikan URL tersebut benar-benar menunjuk ke object Storage yang ada.

Jika URL:
- kosong → masalah upload/save/database
- salah → masalah resolver/path
- object tidak ada → masalah upload/storage
- 403 → masalah access/RLS
- 404 → object/path tidak ada
- 200 tetapi gambar tetap tidak muncul → masalah renderer/browser

Jangan menyelesaikan dengan sekadar CSS.

==================================================
4. TRACE UPLOAD PRODUCT IMAGE

Cari flow saat user membuat/edit product dan upload gambar.

Trace:

file
 ↓
upload service
 ↓
Supabase Storage
 ↓
public URL
 ↓
products.image_url
 ↓
loadProducts()
 ↓
getProductImageUrl()
 ↓
<img src>

Pastikan URL yang disimpan ke database adalah URL yang benar.

Jika upload berhasil tetapi image_url tidak pernah disimpan:
FIX SAVE FLOW.

Jika image_url tersimpan sebagai relative path seperti:
products/...
tetapi renderer membutuhkan full URL:
FIX RESOLVER supaya relative Storage path di-resolve menggunakan bucket existing.

Jangan mengubah database schema kalau tidak diperlukan.

==================================================
5. BANNER

Lakukan hal yang sama untuk banner.

Ambil data REAL:

qr_menu_design_settings
business.cover_url

Untuk businessId yang sedang dipakai.

Print:

business.cover_url
layout
banner block
block.props.banners
banner.imageUrl
banner.image_url

Kemudian tentukan kenapa banner tidak muncul.

==================================================
6. STORAGE OBJECT CHECK

Untuk image yang URL-nya bermasalah:

pastikan object benar-benar ada di bucket:

product-images

dengan path sesuai database.

Jangan membuat bucket baru.

Jangan membuat upload service baru.

==================================================
7. PUBLIC MENU ID MAPPING

PENTING:

Pastikan:

/menu/b51fdc7e-6b7d-4207-8b30-d5f02275f686

memang mengambil business yang sama dengan businessId yang dipakai saat upload.

Print:

route/menu ID
business.id
business.name
business_id pada products
business_id pada qr_menu_design_settings

Harus konsisten.

==================================================
8. FIX HANYA ROOT CAUSE

Setelah ditemukan, lakukan fix minimal.

Contoh:

Jika masalahnya image URL tidak tersimpan:
→ fix save product.

Jika masalahnya relative Storage path:
→ fix getProductImageUrl.

Jika masalahnya bucket access:
→ fix policy/storage configuration.

Jika masalahnya wrong business ID:
→ fix query/mapping.

JANGAN membuat:
- table baru
- bucket baru
- resolver kedua
- duplicate image service
- hardcoded image URL

==================================================
9. REAL BROWSER TEST

Setelah fix:

1. upload gambar baru ke product
2. save
3. refresh dashboard
4. buka public menu
5. hard refresh
6. gambar harus tampil

Lalu:

1. upload banner baru
2. save
3. refresh QR Designer
4. buka public menu
5. banner harus tampil

==================================================
10. TEST REGRESSION

Pastikan:

Product tanpa gambar:
→ tetap No Image.

Product dengan gambar:
→ gambar tampil.

Banner tanpa gambar:
→ fallback sesuai behavior existing.

Banner dengan gambar:
→ gambar tampil.

Tenant A:
→ tidak membaca image/menu tenant B.

Jalankan:
npm test
npm run build

==================================================
FINAL REPORT

Jangan laporkan "sudah benar" hanya karena unit test PASS.

Laporkan:

ROOT CAUSE SEBENARNYA:
...

PRODUCT YANG BERHASIL:
...

PRODUCT YANG GAGAL:
...

IMAGE URL DI DATABASE:
...

FINAL URL YANG DIPAKAI RENDERER:
...

STORAGE OBJECT:
...

FIX:
...

REAL BROWSER TEST:
PASS/FAIL

npm test:
PASS/FAIL

npm run build:
PASS/FAIL
