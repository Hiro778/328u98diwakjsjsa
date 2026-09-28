import { useState, useEffect, useCallback } from 'react'
import {
  adminGetAllFooterSocialLinks,
  adminCreateFooterSocialLink,
  adminUpdateFooterSocialLink,
  adminToggleFooterSocialLink,
  adminDeleteFooterSocialLink,
  normalizeSocialLinksError,
  SUPPORTED_PLATFORMS,
} from '../../services/footerSocialLinksService.js'
import SocialLinkIcon from '../../components/SocialLinkIcon.jsx'

// ─── Platform label URL placeholders ─────────────────────────────────────────
const PLATFORM_PLACEHOLDERS = {
  instagram: 'https://instagram.com/namaakun',
  tiktok: 'https://tiktok.com/@namaakun',
  whatsapp: 'https://wa.me/628xxxxxxxxxx',
  email: 'mailto:support@bisnissehat.id',
  phone: 'tel:+628xxxxxxxxxx',
  youtube: 'https://youtube.com/@namakanal',
  facebook: 'https://facebook.com/namahalaman',
  x: 'https://x.com/namaakun',
  linkedin: 'https://linkedin.com/company/namaperusahaan',
  website: 'https://contoh.com',
  custom: 'https://...',
}

const DEFAULT_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  email: 'Email',
  phone: 'Telepon',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X / Twitter',
  linkedin: 'LinkedIn',
  website: 'Website',
  custom: '',
}

// ─── Empty form state ─────────────────────────────────────────────────────────
const EMPTY_FORM = {
  platform: 'instagram',
  label: 'Instagram',
  url: '',
  enabled: true,
  sort_order: 0,
}

export default function AdminFooterSocialLinksPage() {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Modal state
  const [modal, setModal] = useState({ open: false, mode: 'create', editId: null })
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, label: '' })
  const [deleting, setDeleting] = useState(false)

  // ─── Load all links ─────────────────────────────────────────────────────────
  const loadLinks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGetAllFooterSocialLinks()
      setLinks(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLinks()
  }, [loadLinks])

  // ─── Flash message helper ────────────────────────────────────────────────────
  function showSuccess(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  // ─── Open create modal ───────────────────────────────────────────────────────
  function openCreate() {
    const nextOrder = links.length > 0 ? Math.max(...links.map((l) => l.sort_order)) + 1 : 0
    setForm({ ...EMPTY_FORM, sort_order: nextOrder })
    setFormError(null)
    setModal({ open: true, mode: 'create', editId: null })
  }

  // ─── Open edit modal ─────────────────────────────────────────────────────────
  function openEdit(link) {
    setForm({
      platform: link.platform,
      label: link.label,
      url: link.url,
      enabled: link.enabled,
      sort_order: link.sort_order,
    })
    setFormError(null)
    setModal({ open: true, mode: 'edit', editId: link.id })
  }

  function closeModal() {
    setModal({ open: false, mode: 'create', editId: null })
    setFormError(null)
  }

  // ─── Form field changes ──────────────────────────────────────────────────────
  function handlePlatformChange(platform) {
    setForm((prev) => ({
      ...prev,
      platform,
      label: prev.label === DEFAULT_LABELS[prev.platform] ? DEFAULT_LABELS[platform] : prev.label,
    }))
  }

  // ─── Save (create or update) ─────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault()
    setFormError(null)

    if (!form.url.trim()) {
      setFormError('URL wajib diisi.')
      return
    }
    if (!form.label.trim()) {
      setFormError('Label wajib diisi.')
      return
    }

    setSaving(true)
    try {
      if (modal.mode === 'create') {
        await adminCreateFooterSocialLink(form)
        showSuccess('Social link berhasil ditambahkan.')
      } else {
        await adminUpdateFooterSocialLink(modal.editId, form)
        showSuccess('Social link berhasil diperbarui.')
      }
      await loadLinks()
      closeModal()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ─── Toggle enable/disable ───────────────────────────────────────────────────
  async function handleToggle(id, currentEnabled) {
    setError(null)
    try {
      await adminToggleFooterSocialLink(id, !currentEnabled)
      setLinks((prev) =>
        prev.map((l) => (l.id === id ? { ...l, enabled: !currentEnabled } : l))
      )
    } catch (err) {
      setError(err.message)
    }
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────
  function openDelete(id, label) {
    setDeleteConfirm({ open: true, id, label })
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await adminDeleteFooterSocialLink(deleteConfirm.id)
      showSuccess('Social link berhasil dihapus.')
      await loadLinks()
      setDeleteConfirm({ open: false, id: null, label: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Footer &amp; Social Links</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Kelola link sosial media yang ditampilkan di footer publik. Hanya link yang aktif yang akan
            tampil di website.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Tambah Link
        </button>
      </div>

      {/* Success */}
      {successMsg && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : links.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <p className="text-zinc-400 text-sm">Belum ada social link. Klik &ldquo;Tambah Link&rdquo; untuk mulai.</p>
        </div>
      ) : (
        /* Links table */
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Urutan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Platform</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Label</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider hidden sm:table-cell">URL</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {links.map((link) => (
                  <tr key={link.id} className="bg-zinc-950 hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3.5 text-zinc-400 tabular-nums">{link.sort_order}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-indigo-400">
                          <SocialLinkIcon platform={link.platform} className="w-4 h-4" />
                        </span>
                        <span className="text-zinc-300 font-medium capitalize">
                          {SUPPORTED_PLATFORMS.find((p) => p.key === link.platform)?.label || link.platform}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-200 font-medium">{link.label}</td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <span className="text-zinc-400 text-xs truncate max-w-[240px] inline-block font-mono">
                        {link.url}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggle(link.id, link.enabled)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          link.enabled ? 'bg-emerald-600' : 'bg-zinc-700'
                        }`}
                        role="switch"
                        aria-checked={link.enabled}
                        aria-label={`Toggle ${link.label}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            link.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(link)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-700 transition"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(link.id, link.label)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview section */}
      {links.filter((l) => l.enabled).length > 0 && (
        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Preview Footer — IKUTI KAMI</p>
          <div className="flex flex-wrap gap-3">
            {links
              .filter((l) => l.enabled)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.label}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition text-sm"
                >
                  <SocialLinkIcon platform={link.platform} className="w-4 h-4" />
                  <span>{link.label}</span>
                </a>
              ))}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-zinc-100">
                {modal.mode === 'create' ? 'Tambah Social Link' : 'Edit Social Link'}
              </h2>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Platform */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Platform</label>
                <select
                  value={form.platform}
                  onChange={(e) => handlePlatformChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                >
                  {SUPPORTED_PLATFORMS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Label</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder={DEFAULT_LABELS[form.platform] || 'Label'}
                  maxLength={80}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              {/* URL */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">URL / Kontak</label>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                  placeholder={PLATFORM_PLACEHOLDERS[form.platform]}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono"
                />
                {(form.platform === 'email' || form.platform === 'phone' || form.platform === 'whatsapp') && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {form.platform === 'email' && 'Format: mailto:email@domain.com atau langsung email@domain.com'}
                    {form.platform === 'phone' && 'Format: tel:+62812xxxxx atau langsung nomor HP'}
                    {form.platform === 'whatsapp' && 'Format: https://wa.me/628xxxxxxxxxx'}
                  </p>
                )}
              </div>

              {/* Sort order & Status row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Urutan Tampil</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    min={0}
                    onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Status</label>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-sm font-medium transition ${
                      form.enabled
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <span>{form.enabled ? 'Aktif' : 'Nonaktif'}</span>
                    <span className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${form.enabled ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${form.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </span>
                  </button>
                </div>
              </div>

              {/* Form error */}
              {formError && (
                <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg">
                  {formError}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 transition flex items-center gap-2 disabled:opacity-60"
                >
                  {saving ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menyimpan...</>
                  ) : (
                    modal.mode === 'create' ? 'Tambah Link' : 'Simpan Perubahan'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-zinc-100">Hapus Social Link?</h3>
            </div>
            <p className="text-sm text-zinc-300">
              Anda akan menghapus link <span className="font-semibold text-white">{deleteConfirm.label}</span>. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ open: false, id: null, label: '' })}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 transition flex items-center gap-2 disabled:opacity-60"
              >
                {deleting ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menghapus...</>
                ) : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
