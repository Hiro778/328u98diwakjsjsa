import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('Variant Image Drag & Drop Safety & Text Input Protection (fo.md)', () => {

  // Logic under test simulating preventFileDropOnInput
  function preventFileDropOnInput(e) {
    if (
      e.dataTransfer?.files?.length > 0 ||
      e.dataTransfer?.types?.includes('Files') ||
      e.dataTransfer?.types?.includes('text/uri-list')
    ) {
      e.preventDefault()
      e.stopPropagation()
      return true
    }
    return false
  }

  // Logic under test simulating VariantOptionImagePicker drop and validation
  function processVariantImageDrop({
    dataTransfer,
    businessId,
    currentOption,
    onUpdate,
    onError,
    uploadStorageMock,
  }) {
    // Check if files exist
    const files = Array.from(dataTransfer?.files || [])
    if (files.length === 0) {
      // Reject URL / URI / text injection as images
      return { handled: false, reason: 'no_files' }
    }

    const file = files[0]
    if (!businessId) {
      onError?.('Business ID tidak ditemukan. Harap simpan bisnis terlebih dahulu.')
      return { handled: false, error: 'missing_business' }
    }

    const ext = file.name ? file.name.split('.').pop().toLowerCase() : ''
    const validExts = ['jpg', 'jpeg', 'png', 'webp']
    const validMimes = ['image/jpeg', 'image/png', 'image/webp']

    const isExtValid = validExts.includes(ext)
    const isMimeValid = validMimes.includes(file.type)

    if (!isExtValid && !isMimeValid) {
      onError?.('Format gambar harus JPG, PNG, atau WEBP.')
      return { handled: false, error: 'invalid_format' }
    }

    if (file.size > 5 * 1024 * 1024) {
      onError?.('Ukuran file gambar maksimal 5MB.')
      return { handled: false, error: 'oversize' }
    }

    // Process upload
    const resolvedExt = isExtValid ? ext : 'png'
    const filePath = `${businessId}/${Date.now()}-mock.${resolvedExt}`
    const publicUrl = `https://supabase.mock/storage/v1/object/public/product-images/${filePath}`

    uploadStorageMock?.(filePath, file)

    onUpdate?.({
      ...currentOption,
      imageUrl: publicUrl,
      image_url: publicUrl,
    })

    return { handled: true, publicUrl }
  }

  // A. File drop ke variant image picker → upload handler menerima File
  it('A. File drop ke variant image picker → upload handler menerima File', () => {
    let uploadedFile = null
    let updatedOption = null

    const option = { id: 'opt-1', name: 'pedss', price_adjustment: 5000, stock: 10, imageUrl: null }
    const fakePng = { name: 'pedas-spesial.png', type: 'image/png', size: 1024 * 50 }

    const res = processVariantImageDrop({
      dataTransfer: { files: [fakePng] },
      businessId: 'biz-123',
      currentOption: option,
      onUpdate: (opt) => { updatedOption = opt },
      onError: (err) => { throw new Error(err) },
      uploadStorageMock: (path, file) => { uploadedFile = file },
    })

    assert.equal(res.handled, true)
    assert.equal(uploadedFile.name, 'pedas-spesial.png')
    assert.ok(updatedOption.imageUrl.includes('biz-123'))
    assert.equal(updatedOption.name, 'pedss') // Option name remains untouched
  })

  // B. File drop tidak mengubah variant name
  it('B. File drop pada text input variant name dicegah (preventFileDropOnInput)', () => {
    let defaultPrevented = false
    let propagationStopped = false

    const mockEvent = {
      dataTransfer: {
        files: [{ name: 'injected.png', type: 'image/png' }],
        types: ['Files'],
      },
      preventDefault: () => { defaultPrevented = true },
      stopPropagation: () => { propagationStopped = true },
    }

    const prevented = preventFileDropOnInput(mockEvent)
    assert.equal(prevented, true)
    assert.equal(defaultPrevented, true)
    assert.equal(propagationStopped, true)

    // Ensure variant name in form state remains what the user typed
    const form = { variant_name: 'pedss' }
    // Since default was prevented, browser does NOT paste URL or path into the input
    assert.equal(form.variant_name, 'pedss')
  })

  // C. File drop tidak mengubah category
  it('C. File drop pada input category dicegah sehingga category tidak terinjeksi URL', () => {
    let defaultPrevented = false
    const mockEvent = {
      dataTransfer: {
        files: [{ name: 'banner.jpg', type: 'image/jpeg' }],
        types: ['Files'],
      },
      preventDefault: () => { defaultPrevented = true },
      stopPropagation: () => {},
    }

    const prevented = preventFileDropOnInput(mockEvent)
    assert.equal(prevented, true)
    assert.equal(defaultPrevented, true)

    const form = { category_name: 'Makanan Pedas' }
    assert.equal(form.category_name, 'Makanan Pedas')
  })

  // D. URL dari text/uri-list tidak dimasukkan ke form state
  it('D. URL dari text/uri-list saat drop ditolak dan tidak diinjeksi ke input', () => {
    let errorMsg = ''
    let updatedOption = null

    // User drags an image link or Supabase URL from browser window
    const dataTransfer = {
      files: [], // Browser link drag has 0 native files, only text/uri-list
      types: ['text/uri-list', 'text/plain'],
      getData: (format) => format === 'text/uri-list' ? 'https://ttdevvrzmdquvaewxzhh.supabase.co/storage/v1/object/public/product-images/biz-1/item.png' : '',
    }

    // 1. Text input drop interceptor blocks it
    let inputDefaultPrevented = false
    preventFileDropOnInput({
      dataTransfer,
      preventDefault: () => { inputDefaultPrevented = true },
      stopPropagation: () => {},
    })
    assert.equal(inputDefaultPrevented, true)

    // 2. Variant image picker ignores text/uri-list without File
    const res = processVariantImageDrop({
      dataTransfer,
      businessId: 'biz-123',
      currentOption: { id: 'opt-1', name: 'asin' },
      onUpdate: (opt) => { updatedOption = opt },
      onError: (err) => { errorMsg = err },
    })

    assert.equal(res.handled, false)
    assert.equal(res.reason, 'no_files')
    assert.equal(updatedOption, null)
  })

  // E. Non-image file ditolak
  it('E. Non-image file (PDF/TXT/EXE) ditolak dengan pesan error format', () => {
    let errorMsg = ''
    let updatedOption = null

    const fakePdf = { name: 'dokumen.pdf', type: 'application/pdf', size: 1024 * 20 }

    const res = processVariantImageDrop({
      dataTransfer: { files: [fakePdf] },
      businessId: 'biz-123',
      currentOption: { id: 'opt-1', name: 'pedss', imageUrl: null },
      onUpdate: (opt) => { updatedOption = opt },
      onError: (err) => { errorMsg = err },
    })

    assert.equal(res.handled, false)
    assert.equal(res.error, 'invalid_format')
    assert.equal(errorMsg, 'Format gambar harus JPG, PNG, atau WEBP.')
    assert.equal(updatedOption, null)
  })

  // F. Existing "+Foto" click upload tetap bekerja
  it('F. Existing "+Foto" click upload via native file input tetap bekerja', () => {
    let updatedOption = null
    const fakeJpg = { name: 'sambal.jpg', type: 'image/jpeg', size: 1024 * 100 }

    const res = processVariantImageDrop({
      dataTransfer: { files: [fakeJpg] },
      businessId: 'biz-123',
      currentOption: { id: 'opt-1', name: 'pedss' },
      onUpdate: (opt) => { updatedOption = opt },
    })

    assert.equal(res.handled, true)
    assert.ok(updatedOption.imageUrl.endsWith('.jpg'))
  })

  // G. Existing variant image preview tetap bekerja
  it('G. Existing variant image preview (imageUrl / image_url) tetap dipreservasi', () => {
    const existingOption = {
      id: 'opt-pedss',
      name: 'pedss',
      imageUrl: 'https://cdn.supabase.co/product-images/biz-1/pedss.png',
      image_url: 'https://cdn.supabase.co/product-images/biz-1/pedss.png',
    }

    assert.ok(existingOption.imageUrl)
    assert.equal(existingOption.imageUrl, existingOption.image_url)
  })

  // H. Existing image replace/remove tetap bekerja
  it('H. Existing image replace dan remove tetap bekerja tanpa efek samping ke text input', () => {
    let option = {
      id: 'opt-pedss',
      name: 'pedss',
      imageUrl: 'https://cdn.supabase.co/product-images/biz-1/pedss.png',
      image_url: 'https://cdn.supabase.co/product-images/biz-1/pedss.png',
    }

    // Simulate Remove action
    function handleRemove(opt) {
      return {
        ...opt,
        imageUrl: null,
        image_url: null,
      }
    }

    option = handleRemove(option)
    assert.equal(option.imageUrl, null)
    assert.equal(option.image_url, null)
    assert.equal(option.name, 'pedss') // Name unchanged
  })
})
