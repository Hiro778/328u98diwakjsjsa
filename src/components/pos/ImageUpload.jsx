import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const ALLOWED_TYPES = ['image/jpeg', 'image/png']
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png']
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

/**
 * Image upload component for Supabase Storage.
 * Uploads to product-images or business-assets bucket.
 *
 * Props:
 * - bucket: 'product-images' | 'business-assets'
 * - folder: string (e.g. business slug)
 * - currentImage: string (current image URL)
 * - onUpload: (url: string) => void
 * - onError: (error: string) => void
 * - accept: string (default: 'image/jpeg,image/png')
 * - className: string
 */
export default function ImageUpload({
  bucket = 'product-images',
  folder = '',
  currentImage = '',
  onUpload,
  onError,
  accept = 'image/jpeg,image/png',
  className = '',
}) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(currentImage)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [fileInfo, setFileInfo] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setPreview(currentImage || '')
    if (!currentImage) setFileInfo(null)
  }, [currentImage])

  function validateFile(file) {
    if (!file) return 'Tidak ada file yang dipilih.'

    const ext = file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      return 'Format tidak didukung. Hanya file JPG atau PNG yang diperbolehkan.'
    }

    if (file.size > MAX_SIZE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1)
      return `Ukuran file ${mb}MB melebihi batas maksimal 5MB.`
    }

    return null
  }

  async function handleFile(file) {
    if (!file) return

    if (!folder) {
      const msg = 'Data bisnis belum siap. Coba lagi sebentar.'
      setError(msg)
      onError?.(msg)
      return
    }

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      onError?.(validationError)
      return
    }

    setError('')
    setUploading(true)
    onError?.('')

    const ext = file.name.split('.').pop().toLowerCase()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
    const filePath = `${folder}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      const msg = `Gagal mengupload: ${uploadError.message}`
      setError(msg)
      onError?.(msg)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
    const url = data.publicUrl

    setPreview(url)
    setFileInfo({ name: file.name, size: file.size })
    onUpload?.(url)
    setUploading(false)
  }

  function handleInputChange(e) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so re-selecting the same file triggers onChange
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function handleRemove() {
    setPreview('')
    setFileInfo(null)
    setError('')
    onUpload?.('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleReplace() {
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.click()
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className={className}>
      {/* Error message */}
      {error && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="Preview"
            className="h-40 w-full rounded-xl object-cover"
          />
          {/* File info */}
          {fileInfo && (
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-muted">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
              <span className="truncate">{fileInfo.name}</span>
              <span className="text-text-muted/50">·</span>
              <span>{formatSize(fileInfo.size)}</span>
            </div>
          )}
          {/* Action buttons */}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleReplace}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:bg-cream disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Ganti
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Hapus
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => folder && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (folder) setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          disabled={!folder}
          className={`flex h-40 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
            !folder
              ? 'cursor-not-allowed border-border bg-surface opacity-50'
              : dragOver
                ? 'border-warm-400 bg-warm-50'
                : 'border-border bg-surface hover:border-warm-300 hover:bg-cream'
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
              <p className="text-xs text-text-muted">Mengupload...</p>
            </div>
          ) : (
            <>
              <svg className="h-8 w-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <p className="mt-1 text-xs text-text-muted">
                {folder ? 'Klik atau seret gambar ke sini' : 'Menunggu data bisnis...'}
              </p>
              <p className="text-[10px] text-text-muted">JPG, PNG, maks 5MB</p>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  )
}
