import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import DateInput from '../../../components/DateInput'
import {
  PLATFORMS,
  STATUSES,
  DAY_OPTIONS,
  DAY_NAMES_ID,
  SCHEDULE_TYPES,
  getPlatformBadgeInfo,
  generateRecurringDates,
  loadCalendarItems,
  saveCalendarItem,
  deleteCalendarItem,
  generateMonthGrid,
  filterCalendarItems,
} from '../../../services/contentCalendarService'

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

export default function ContentCalendarPage() {
  const { business, user } = useAuth()
  const tenantId = business?.id || user?.id || 'guest'

  // Date navigation state (default to current month)
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // View state: 'calendar' or 'list'
  const [viewMode, setViewMode] = useState('calendar')

  // Filter states
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Data state
  const [items, setItems] = useState(() => loadCalendarItems(tenantId))
  const [lastTenantId, setLastTenantId] = useState(tenantId)

  // Tenant sync during auth/session change
  if (lastTenantId !== tenantId) {
    setLastTenantId(tenantId)
    setItems(loadCalendarItems(tenantId))
  }

  // Modal / Form state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [pageError, setPageError] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Delete confirm state (stores full item object or null)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null)

  // Form inputs
  const [formData, setFormData] = useState({
    title: '',
    platform: 'Instagram',
    format: 'Reels',
    scheduleType: 'once', // 'once' | 'recurring' | 'allday'
    publishDate: '',
    publishTime: '10:00',
    isAllDay: false,
    daysOfWeek: ['Sen', 'Rab', 'Jum'],
    startDate: '',
    endDate: '',
    noEndDate: false,
    status: 'scheduled',
    caption: '',
    tags: '',
    cta: '',
    editMode: 'single', // 'single' | 'series'
  })

  // Next / Prev Month navigators
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // Open modal for new item (optional prefill date)
  const handleOpenNewModal = (prefillDate = '') => {
    const defaultDate = prefillDate || new Date().toISOString().slice(0, 10)
    setEditingItem(null)
    setFormData({
      title: '',
      platform: 'Instagram',
      format: 'Reels',
      scheduleType: 'once',
      publishDate: defaultDate,
      publishTime: '10:00',
      isAllDay: false,
      daysOfWeek: ['Sen', 'Rab', 'Jum'],
      startDate: defaultDate,
      endDate: '',
      noEndDate: false,
      status: 'scheduled',
      caption: '',
      tags: '',
      cta: '',
      editMode: 'single',
    })
    setFormError(null)
    setModalOpen(true)
  }

  // Open modal for editing existing item
  const handleOpenEditModal = (item) => {
    setEditingItem(item)
    const isRec = Boolean(item.seriesId || item.isRecurring)
    setFormData({
      title: item.title,
      platform: item.platform || 'Instagram',
      format: item.format || 'Feed',
      scheduleType: item.isAllDay ? 'allday' : (isRec ? 'recurring' : 'once'),
      publishDate: item.publishDate,
      publishTime: item.publishTime || '10:00',
      isAllDay: Boolean(item.isAllDay),
      daysOfWeek: item.recurrenceRule?.daysOfWeek || ['Sen', 'Rab', 'Jum'],
      startDate: item.recurrenceRule?.startDate || item.publishDate,
      endDate: item.recurrenceRule?.endDate || '',
      noEndDate: !item.recurrenceRule?.endDate,
      status: item.status || 'scheduled',
      caption: item.caption || '',
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || ''),
      cta: item.cta || '',
      editMode: 'single',
    })
    setFormError(null)
    setModalOpen(true)
  }

  // Toggle recurring day selection
  const handleToggleDay = (day) => {
    setFormData((prev) => {
      const exists = prev.daysOfWeek.includes(day)
      const nextDays = exists
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day]
      return { ...prev, daysOfWeek: nextDays }
    })
  }

  // Handle Form Submit
  const handleFormSubmit = async (e) => {
    e?.preventDefault()
    if (formLoading) return

    setFormLoading(true)
    setFormError(null)

    try {
      const payload = {
        ...(editingItem ? { id: editingItem.id, seriesId: editingItem.seriesId } : {}),
        ...formData,
      }

      const { allItems } = saveCalendarItem(tenantId, payload, {
        mode: formData.editMode || 'single',
        now: new Date(),
      })

      setItems(allItems)
      setSuccessMessage(
        editingItem
          ? formData.editMode === 'series'
            ? 'Seluruh rangkaian jadwal berhasil diperbarui.'
            : 'Jadwal konten berhasil diperbarui.'
          : formData.scheduleType === 'recurring'
          ? 'Rangkaian jadwal berulang berhasil dibuat.'
          : 'Jadwal konten berhasil ditambahkan.'
      )
      setPageError(null)
      setModalOpen(false)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan jadwal konten.')
    } finally {
      setFormLoading(false)
    }
  }

  // Handle Delete
  const handleDeleteItem = (item, deleteSeries = false) => {
    if (isDeleting || !item?.id) return
    setIsDeleting(true)
    try {
      const updated = deleteCalendarItem(tenantId, item.id, { deleteSeries })
      setItems(updated)
      setDeleteConfirmItem(null)
      setSuccessMessage(
        deleteSeries
          ? 'Seluruh rangkaian jadwal berhasil dihapus.'
          : 'Jadwal konten berhasil dihapus.'
      )
      setPageError(null)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err) {
      setPageError(err.message || 'Gagal menghapus jadwal konten.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Generate calendar grid matrix
  const monthGrid = useMemo(() => generateMonthGrid(year, month), [year, month])

  // Filtered items
  const monthIso = `${year}-${String(month + 1).padStart(2, '0')}`
  const filteredItems = useMemo(() => {
    return filterCalendarItems(items, {
      platform: platformFilter,
      status: statusFilter,
      search: searchQuery,
      monthIso: viewMode === 'calendar' ? monthIso : '',
    })
  }, [items, platformFilter, statusFilter, searchQuery, monthIso, viewMode])

  // Map items by date for quick lookup in calendar cells
  const itemsByDate = useMemo(() => {
    const map = new Map()
    for (const item of filteredItems) {
      const dateKey = item.publishDate
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey).push(item)
    }
    return map
  }, [filteredItems])

  // Dynamic preview of recurring occurrences
  const recurringPreviewDates = useMemo(() => {
    if (formData.scheduleType !== 'recurring') return []
    const sDate = formData.startDate || formData.publishDate
    if (!sDate || !formData.daysOfWeek.length) return []
    try {
      return generateRecurringDates({
        startDate: sDate,
        endDate: formData.noEndDate ? null : (formData.endDate || null),
        daysOfWeek: formData.daysOfWeek,
        maxOccurrences: 10,
      })
    } catch {
      return []
    }
  }, [
    formData.scheduleType,
    formData.startDate,
    formData.publishDate,
    formData.endDate,
    formData.noEndDate,
    formData.daysOfWeek,
  ])

  return (
    <div className="space-y-6 pb-16">
      <BackButton fallbackUrl="/dashboard/marketing" label="Kembali" />

      {/* Header & Breadcrumb */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Link to="/dashboard/marketing" className="hover:text-text-primary">
              Marketing &amp; Promosi
            </Link>
            <span>/</span>
            <span className="text-text-secondary font-medium">Content Calendar</span>
          </div>
          <h1 className="text-2xl font-black text-navy-700 dark:text-navy-100">
            Kalender Konten &amp; Jadwal Publikasi
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Rencanakan dan jadwalkan postingan sosial media secara terstruktur, manual, maupun berulang.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Toggle */}
          <div className="flex items-center rounded-xl border border-border bg-surface p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-profit-600 text-white shadow-2xs'
                  : 'text-text-secondary hover:text-navy-700 dark:hover:text-navy-200'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Kalender</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-profit-600 text-white shadow-2xs'
                  : 'text-text-secondary hover:text-navy-700 dark:hover:text-navy-200'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <span>Daftar</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleOpenNewModal()}
            className="flex items-center gap-1.5 rounded-xl bg-profit-600 px-4 py-2 text-xs font-bold text-white hover:bg-profit-500 transition-colors shadow-xs cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>+ Jadwal Konten</span>
          </button>
        </div>
      </div>

      {/* Notifications / Toast */}
      {successMessage && (
        <div className="rounded-xl border border-profit-200 bg-profit-50 p-3 text-xs text-profit-800 dark:border-profit-800 dark:bg-profit-950/40 dark:text-profit-200">
          {successMessage}
        </div>
      )}
      {pageError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {pageError}
        </div>
      )}

      {/* Filter & Calendar Controls Card */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Month Navigator (visible when viewMode === 'calendar') */}
          <div className="flex items-center gap-2">
            {viewMode === 'calendar' && (
              <>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="rounded-xl border border-border p-1.5 text-navy-700 dark:text-navy-200 hover:bg-cream transition-colors cursor-pointer"
                  title="Bulan Sebelumnya"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="min-w-[140px] text-center text-sm font-bold text-navy-800 dark:text-navy-100">
                  {MONTH_NAMES[month]} {year}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="rounded-xl border border-border p-1.5 text-navy-700 dark:text-navy-200 hover:bg-cream transition-colors cursor-pointer"
                  title="Bulan Berikutnya"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="ml-1 rounded-xl border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-cream transition-colors cursor-pointer"
                >
                  Hari Ini
                </button>
              </>
            )}
          </div>

          {/* Filters: Search, Platform, Status */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[180px] flex-1 sm:flex-none">
              <input
                type="text"
                placeholder="Cari judul, topik, hashtag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-navy-800 dark:text-navy-100 placeholder-text-muted focus:border-profit-500 focus:outline-none"
              />
            </div>

            {/* Platform Filter */}
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-navy-800 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-navy-800 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
            >
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* VIEW: CALENDAR MONTH GRID */}
      {viewMode === 'calendar' && (
        <div className="space-y-3">
          {filteredItems.length === 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-cream/30 p-4 text-xs text-text-secondary">
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>
                  Belum ada jadwal konten untuk bulan {MONTH_NAMES[month]} {year}. Klik tanggal pada kalender atau tombol &ldquo;+ Jadwal Konten&rdquo; untuk merencanakan.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleOpenNewModal()}
                className="self-start sm:self-auto rounded-lg bg-surface px-3 py-1.5 font-semibold text-navy-700 shadow-2xs hover:bg-cream transition-colors cursor-pointer"
              >
                + Jadwal Konten
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 border-b border-border bg-cream/50 dark:bg-navy-900/40 text-center text-xs font-bold text-navy-700 dark:text-navy-200">
              {DAY_NAMES.map((d) => (
                <div key={d} className="py-2.5">
                  {d}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-border">
              {monthGrid.map((cell, idx) => {
                const dayItems = itemsByDate.get(cell.isoDate) || []
                return (
                  <div
                    key={idx}
                    onClick={() => handleOpenNewModal(cell.isoDate)}
                    className={`group relative min-h-[110px] p-2 transition-colors cursor-pointer sm:min-h-[125px] ${
                      cell.isCurrentMonth ? 'bg-surface hover:bg-cream/30' : 'bg-warm-50/20 dark:bg-navy-950/40 opacity-40'
                    }`}
                  >
                    {/* Day header */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          cell.isToday
                            ? 'bg-profit-600 text-white'
                            : cell.isCurrentMonth
                            ? 'text-navy-900 dark:text-navy-100'
                            : 'text-text-muted'
                        }`}
                      >
                        {cell.day}
                      </span>
                      <span className="hidden text-[10px] text-text-muted group-hover:inline">
                        + Jadwal
                      </span>
                    </div>

                    {/* Content item badges */}
                    <div className="mt-1.5 space-y-1">
                      {dayItems.slice(0, 3).map((it) => {
                        const plat = getPlatformBadgeInfo(it.platform)
                        const stat = STATUSES.find((s) => s.id === it.status)

                        return (
                          <div
                            key={it.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenEditModal(it)
                            }}
                            className={`flex items-center justify-between rounded px-1.5 py-1 text-[11px] font-medium transition-transform hover:scale-[1.02] shadow-2xs ${
                              plat?.color || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            <span className="truncate pr-1 font-semibold flex items-center gap-1">
                              {it.isRecurring && <span className="text-[10px] font-bold">↻</span>}
                              {it.title}
                            </span>
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${stat?.dot || 'bg-gray-400'}`}
                              title={stat?.label || ''}
                            />
                          </div>
                        )
                      })}

                      {dayItems.length > 3 && (
                        <p className="text-[10px] font-semibold text-electric-600">
                          +{dayItems.length - 3} lainnya
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: LIST VIEW */}
      {viewMode === 'list' && (
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-700 dark:text-navy-100">
              Daftar Konten ({filteredItems.length} jadwal)
            </h3>
          </div>

          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-text-muted">
              Tidak ada konten yang cocok dengan kriteria pencarian atau filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-cream/40 dark:bg-navy-900/40 text-text-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Tanggal &amp; Waktu</th>
                    <th className="px-3 py-2.5 font-semibold">Judul Konten</th>
                    <th className="px-3 py-2.5 font-semibold">Platform</th>
                    <th className="px-3 py-2.5 font-semibold">Format</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredItems.map((item) => {
                    const plat = getPlatformBadgeInfo(item.platform)
                    const stat = STATUSES.find((s) => s.id === item.status)

                    return (
                      <tr key={item.id} className="hover:bg-cream/20">
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-navy-900 dark:text-navy-100">
                          {new Date(item.publishDate).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {item.isAllDay ? (
                            <span className="ml-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-bold">
                              Seharian
                            </span>
                          ) : (
                            <>
                              {' '}• <span className="text-text-muted">{item.publishTime}</span>
                            </>
                          )}
                          {item.isRecurring && (
                            <span
                              className="ml-1.5 inline-flex items-center text-[10px] font-bold text-electric-600 dark:text-electric-400"
                              title="Jadwal Berulang"
                            >
                              ↻
                            </span>
                          )}
                        </td>
                        <td className="max-w-[280px] px-3 py-2.5">
                          <p className="font-bold text-navy-800 dark:text-navy-100 flex items-center gap-1.5">
                            {item.title}
                          </p>
                          {item.caption && (
                            <p className="truncate text-[11px] text-text-secondary">{item.caption}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${plat?.color || 'bg-gray-100'}`}>
                            {item.platform}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-text-secondary capitalize">
                          {item.format}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${stat?.color || 'bg-gray-100 text-gray-700'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${stat?.dot || 'bg-gray-400'}`} />
                            <span>{stat?.label || item.status}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              className="rounded bg-navy-50 dark:bg-navy-800 px-2.5 py-1 text-[11px] font-semibold text-navy-700 dark:text-navy-200 hover:bg-navy-100 transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteConfirmItem(item)}
                              className="rounded px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD / EDIT CONTENT FORM */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-navy-700 dark:text-navy-100">
                {editingItem ? 'Edit Jadwal Konten' : 'Tambah Jadwal Konten Baru'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-text-muted hover:bg-cream hover:text-navy-700 dark:hover:text-navy-100 transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              {/* Recurring Edit Mode Toggle (if editing an item belonging to a recurring series) */}
              {editingItem?.seriesId && (
                <div className="rounded-xl border border-electric-200 bg-electric-50/70 dark:border-electric-800 dark:bg-electric-950/30 p-3 text-xs">
                  <p className="font-bold text-electric-800 dark:text-electric-200 mb-1.5 flex items-center gap-1.5">
                    <span>↻</span> Event Berulang
                  </p>
                  <p className="text-[11px] text-text-secondary mb-2">
                    Konten ini adalah bagian dari jadwal berulang. Tentukan ruang lingkup pengubahan:
                  </p>
                  <div className="flex items-center gap-4 text-xs font-semibold text-navy-800 dark:text-navy-200">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="editMode"
                        checked={formData.editMode === 'single'}
                        onChange={() => setFormData({ ...formData, editMode: 'single' })}
                        className="text-profit-600 focus:ring-profit-500"
                      />
                      <span>Edit event ini saja</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="editMode"
                        checked={formData.editMode === 'series'}
                        onChange={() => setFormData({ ...formData, editMode: 'series' })}
                        className="text-profit-600 focus:ring-profit-500"
                      />
                      <span>Edit seluruh rangkaian</span>
                    </label>
                  </div>
                </div>
              )}

              {/* 1. Judul Konten */}
              <div>
                <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                  Judul / Topik Konten <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Promo Gajian Diskon 20% Kopi Robusta"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none focus:ring-1 focus:ring-profit-500"
                />
              </div>

              {/* 2. Platform & Format (Free text inputs with quick chips) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                    Platform <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Instagram, TikTok, Threads, dll"
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {['Instagram', 'TikTok', 'Threads', 'Facebook', 'YouTube'].map((plat) => (
                      <button
                        key={plat}
                        type="button"
                        onClick={() => setFormData({ ...formData, platform: plat })}
                        className="rounded-md border border-border bg-cream/40 dark:bg-navy-800 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary hover:bg-cream transition-colors cursor-pointer"
                      >
                        {plat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                    Format
                  </label>
                  <input
                    type="text"
                    placeholder="Reels, Story, Feed, Carousel, dll"
                    value={formData.format}
                    onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {['Reels', 'Story', 'Feed', 'Carousel', 'Video', 'Artikel'].map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setFormData({ ...formData, format: fmt })}
                        className="rounded-md border border-border bg-cream/40 dark:bg-navy-800 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary hover:bg-cream transition-colors cursor-pointer"
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Pola Jadwal (Schedule Type) */}
              <div>
                <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200 mb-1.5">
                  Pola Jadwal
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {SCHEDULE_TYPES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          scheduleType: st.id,
                          isAllDay: st.id === 'allday' ? true : (st.id === 'recurring' ? prev.isAllDay : false),
                        }))
                      }}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all cursor-pointer ${
                        formData.scheduleType === st.id
                          ? 'border-profit-600 bg-profit-50 dark:bg-profit-950/40 text-profit-700 dark:text-profit-300 font-bold shadow-2xs ring-1 ring-profit-500'
                          : 'border-border bg-surface text-text-secondary hover:bg-cream'
                      }`}
                    >
                      <span className="text-xs font-bold flex items-center gap-1">
                        {st.id === 'once' && '● '}
                        {st.id === 'recurring' && '↻ '}
                        {st.id === 'allday' && '☀️ '}
                        {st.label}
                      </span>
                      <span className="mt-0.5 text-[9px] text-text-muted leading-tight">
                        {st.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Single / All-Day Schedule Fields */}
              {formData.scheduleType !== 'recurring' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                      Tanggal Publish <span className="text-red-500">*</span>
                    </label>
                    <DateInput
                      required
                      value={formData.publishDate}
                      onChange={(e) => setFormData({ ...formData, publishDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                      Jam Tayang
                    </label>
                    <input
                      type="time"
                      disabled={formData.scheduleType === 'allday'}
                      value={formData.scheduleType === 'allday' ? '' : formData.publishTime}
                      onChange={(e) => setFormData({ ...formData, publishTime: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none disabled:opacity-40 disabled:bg-cream/40"
                    />
                    {formData.scheduleType === 'allday' && (
                      <p className="mt-1 text-[10px] text-profit-600 dark:text-profit-400 font-semibold">
                        ✓ Berlaku sepanjang hari (tanpa jam tayang)
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 5. Recurring Schedule Fields */}
              {formData.scheduleType === 'recurring' && (
                <div className="space-y-3 rounded-2xl border border-border bg-cream/30 dark:bg-navy-900/30 p-3.5">
                  {/* Days of Week Toggle */}
                  <div>
                    <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200 mb-1.5">
                      Ulangi pada: <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-7 gap-1">
                      {DAY_OPTIONS.map((day) => {
                        const isSelected = formData.daysOfWeek.includes(day)
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => handleToggleDay(day)}
                            className={`h-8 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'border-profit-600 bg-profit-600 text-white shadow-2xs'
                                : 'border-border bg-surface text-navy-700 dark:text-navy-300 hover:bg-cream'
                            }`}
                          >
                            {day}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Range Recurring: Start, End, No End Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                        Tanggal Mulai <span className="text-red-500">*</span>
                      </label>
                      <DateInput
                        required
                        value={formData.startDate || formData.publishDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            startDate: e.target.value,
                            publishDate: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-navy-700 dark:text-navy-200">
                          Tanggal Berakhir
                        </label>
                        <label className="inline-flex items-center gap-1 text-[10px] text-text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.noEndDate}
                            onChange={(e) => setFormData({ ...formData, noEndDate: e.target.checked })}
                            className="rounded border-border text-profit-600 focus:ring-profit-500"
                          />
                          <span>Tanpa akhir</span>
                        </label>
                      </div>
                      <DateInput
                        disabled={formData.noEndDate}
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none disabled:opacity-40 disabled:bg-cream/40"
                      />
                    </div>
                  </div>

                  {/* Jam Tayang & Seharian Toggle */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                        Jam Tayang
                      </label>
                      <input
                        type="time"
                        disabled={formData.isAllDay}
                        value={formData.isAllDay ? '' : formData.publishTime}
                        onChange={(e) => setFormData({ ...formData, publishTime: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none disabled:opacity-40 disabled:bg-cream/40"
                      />
                    </div>

                    <div className="pt-4 sm:pt-6">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-navy-700 dark:text-navy-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isAllDay}
                          onChange={(e) => setFormData({ ...formData, isAllDay: e.target.checked })}
                          className="h-4 w-4 rounded border-border text-profit-600 focus:ring-profit-500"
                        />
                        <span>Seharian (tanpa jam tayang)</span>
                      </label>
                    </div>
                  </div>

                  {/* Recurring Preview Card */}
                  <div className="rounded-xl border border-border bg-surface p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between font-bold text-navy-800 dark:text-navy-100">
                      <span className="flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-profit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Preview Jadwal Berulang
                      </span>
                      <span className="text-[11px] font-semibold text-profit-600 dark:text-profit-400">
                        {formData.isAllDay ? 'Seharian' : (formData.publishTime || '10:00')}
                      </span>
                    </div>

                    <div className="text-[11px] text-text-secondary space-y-0.5">
                      <p>
                        <strong>Hari:</strong> {formData.daysOfWeek.join(', ') || 'Belum dipilih'}
                      </p>
                      <p>
                        <strong>Periode:</strong>{' '}
                        {formData.startDate || formData.publishDate || '-'} s/d{' '}
                        {formData.noEndDate ? 'Tanpa batas' : formData.endDate || 'Tanpa batas'}
                      </p>
                    </div>

                    {recurringPreviewDates.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-semibold text-text-muted mb-1">Contoh Jadwal:</p>
                        <div className="flex flex-wrap gap-1">
                          {recurringPreviewDates.slice(0, 5).map((d) => {
                            const dateObj = new Date(d)
                            const dayName = DAY_NAMES_ID[dateObj.getDay()]
                            const label = dateObj.toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                            })
                            return (
                              <span
                                key={d}
                                className="rounded-md bg-cream/60 dark:bg-navy-800 border border-border px-2 py-0.5 text-[10px] font-medium text-navy-700 dark:text-navy-300"
                              >
                                {label} ({dayName})
                              </span>
                            )
                          })}
                          {recurringPreviewDates.length > 5 && (
                            <span className="rounded-md bg-cream/30 px-1.5 py-0.5 text-[10px] text-text-muted">
                              +{recurringPreviewDates.length - 5} lainnya...
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Pilih hari dan tanggal mulai untuk melihat preview jadwal.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 6. Status (Controlled select) */}
              <div>
                <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
                >
                  {STATUSES.filter((s) => s.id !== 'all').map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 7. Caption / Catatan Ide */}
              <div>
                <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                  Draft Caption / Catatan Ide
                </label>
                <textarea
                  rows={3}
                  placeholder="Tulis naskah caption, poin penting, atau arahan visual di sini..."
                  value={formData.caption}
                  onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-border bg-surface p-2.5 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
                />
              </div>

              {/* 8. Hashtags & Link CTA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                    Hashtags
                  </label>
                  <input
                    type="text"
                    placeholder="#kopi, #kuliner"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-navy-700 dark:text-navy-200">
                    Link CTA
                  </label>
                  <input
                    type="text"
                    placeholder="https://wa.me/..."
                    value={formData.cta}
                    onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-900 dark:text-navy-100 focus:border-profit-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={formLoading}
                  className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-cream transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex items-center gap-1.5 rounded-xl bg-profit-600 px-4 py-2 text-xs font-bold text-white hover:bg-profit-500 disabled:opacity-60 transition-colors shadow-xs cursor-pointer"
                >
                  {formLoading ? (
                    <span>Menyimpan...</span>
                  ) : (
                    <span>{editingItem ? 'Simpan Perubahan' : 'Jadwalkan Konten'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE DIALOG (Supports single occurrence & entire series) */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40 text-red-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h4 className="mt-3 text-sm font-bold text-navy-800 dark:text-navy-100">
              {deleteConfirmItem.seriesId
                ? 'Hapus Jadwal Berulang?'
                : 'Hapus Jadwal Konten?'}
            </h4>
            <p className="mt-1 text-xs text-text-secondary">
              {deleteConfirmItem.seriesId
                ? 'Jadwal ini adalah bagian dari rangkaian berulang. Pilih opsi penghapusan:'
                : `Jadwal "${deleteConfirmItem.title}" akan dihapus permanen.`}
            </p>

            {deleteConfirmItem.seriesId ? (
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteItem(deleteConfirmItem, false)}
                  className="w-full rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors cursor-pointer"
                >
                  Hapus Jadwal Ini Saja
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteItem(deleteConfirmItem, true)}
                  className="w-full rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  Hapus Seluruh Rangkaian ({deleteConfirmItem.recurrenceRule?.daysOfWeek?.join(', ') || 'Rangkaian'})
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmItem(null)}
                  className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-text-secondary hover:bg-cream transition-colors cursor-pointer"
                >
                  Batal
                </button>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmItem(null)}
                  className="rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-cream transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteItem(deleteConfirmItem, false)}
                  className="rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors cursor-pointer"
                >
                  Ya, Hapus
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
