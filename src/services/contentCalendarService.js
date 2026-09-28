/**
 * Content Calendar Service
 *
 * Provides tenant-isolated storage, validation, date calculations,
 * recurrence engine, past-date protection, and filtering for UMKM marketing content.
 */

export const PLATFORMS = [
  { id: 'all', label: 'Semua Platform', color: 'bg-navy-100 text-navy-700' },
  { id: 'instagram', label: 'Instagram', color: 'bg-pink-100 text-pink-700', badgeColor: '#E1306C' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-stone-900 text-white', badgeColor: '#000000' },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-100 text-blue-700', badgeColor: '#1877F2' },
  { id: 'whatsapp', label: 'WhatsApp', color: 'bg-emerald-100 text-emerald-700', badgeColor: '#25D366' },
  { id: 'youtube', label: 'YouTube', color: 'bg-red-100 text-red-700', badgeColor: '#FF0000' },
  { id: 'threads', label: 'Threads', color: 'bg-slate-900 text-white', badgeColor: '#000000' },
  { id: 'marketplace', label: 'Marketplace', color: 'bg-amber-100 text-amber-800', badgeColor: '#F5A623' },
]

export const STATUSES = [
  { id: 'all', label: 'Semua Status' },
  { id: 'scheduled', label: 'Terjadwal', color: 'bg-electric-100 text-electric-700 dark:bg-electric-900/30 dark:text-electric-300', dot: 'bg-electric-500' },
  { id: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', dot: 'bg-gray-400' },
  { id: 'published', label: 'Selesai', color: 'bg-profit-100 text-profit-700 dark:bg-profit-900/30 dark:text-profit-300', dot: 'bg-profit-500' },
  { id: 'delayed', label: 'Dibatalkan', color: 'bg-warm-100 text-warm-700 dark:bg-warm-900/30 dark:text-warm-300', dot: 'bg-warm-400' },
]

export const FORMATS = [
  { id: 'reels', label: 'Reels' },
  { id: 'story', label: 'Story' },
  { id: 'feed', label: 'Feed' },
  { id: 'carousel', label: 'Carousel' },
  { id: 'video', label: 'Video' },
  { id: 'artikel', label: 'Artikel' },
  { id: 'broadcast', label: 'Broadcast / Promo' },
]

export const DAY_NAMES_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
export const DAY_OPTIONS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

export const SCHEDULE_TYPES = [
  { id: 'once', label: 'Sekali', description: 'Jadwal tayang spesifik satu kali' },
  { id: 'recurring', label: 'Berulang', description: 'Ulangi otomatis di hari tertentu' },
  { id: 'allday', label: 'Seharian', description: 'Berlaku sepanjang hari tanpa jam' },
]

/**
 * Get styling & badge information for any platform string (both known and free-text)
 */
export function getPlatformBadgeInfo(platformStr = '') {
  const clean = String(platformStr || '').trim().toLowerCase()
  const matched = PLATFORMS.find(
    p => p.id !== 'all' && (p.id === clean || clean.includes(p.id) || p.label.toLowerCase() === clean)
  )
  if (matched) return matched

  return {
    id: 'custom',
    label: platformStr || 'Lainnya',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    badgeColor: '#64748B',
  }
}

/**
 * Check whether a given date & time is in the past relative to reference `now`
 */
export function checkPastDateTime({ date, time, isAllDay = false }, now = new Date()) {
  if (!date || isNaN(new Date(date).getTime())) {
    return { isPast: false }
  }

  const [year, month, day] = date.split('-').map(Number)

  if (isAllDay) {
    // For all-day events, the schedule is valid if the day has not completely passed (up to 23:59:59.999 local time)
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)
    return { isPast: endOfDay.getTime() < now.getTime() }
  }

  const [hours, minutes] = (time || '00:00').split(':').map(Number)
  const target = new Date(year, month - 1, day, isNaN(hours) ? 0 : hours, isNaN(minutes) ? 0 : minutes, 0, 0)
  return { isPast: target.getTime() < now.getTime() }
}

/**
 * Generate recurring dates based on start/end date and selected days of week
 */
export function generateRecurringDates({
  startDate,
  endDate = null,
  daysOfWeek = [],
  maxOccurrences = 90,
}) {
  if (!startDate || !Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
    return []
  }

  const [sYear, sMonth, sDay] = startDate.split('-').map(Number)
  const current = new Date(sYear, sMonth - 1, sDay)

  let end = null
  if (endDate) {
    const [eYear, eMonth, eDay] = endDate.split('-').map(Number)
    end = new Date(eYear, eMonth - 1, eDay)
  } else {
    // Safe default boundary: 12 weeks from startDate to prevent infinite memory usage
    end = new Date(current)
    end.setDate(end.getDate() + 84)
  }

  const DAY_MAP = {
    Min: 0,
    Sen: 1,
    Sel: 2,
    Rab: 3,
    Kam: 4,
    Jum: 5,
    Sab: 6,
  }

  const targetDayNumbers = new Set(daysOfWeek.map(d => DAY_MAP[d]))
  const occurrences = []
  const cursor = new Date(current)

  while (cursor <= end && occurrences.length < maxOccurrences) {
    const dayOfWeek = cursor.getDay()
    if (targetDayNumbers.has(dayOfWeek)) {
      const y = cursor.getFullYear()
      const m = String(cursor.getMonth() + 1).padStart(2, '0')
      const d = String(cursor.getDate()).padStart(2, '0')
      occurrences.push(`${y}-${m}-${d}`)
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return occurrences
}

/**
 * Get tenant-isolated storage key
 */
export function getContentCalendarStorageKey(businessId) {
  if (!businessId) return 'bisnissehat_calendar_guest'
  return `bisnissehat_calendar_${businessId}`
}

/**
 * Validate a content calendar item
 *
 * Enforces:
 * - Free-text platform & format (not empty, not 'all')
 * - Title length (1-120 chars)
 * - Valid status
 * - Strict past-date blocking for both single & recurring schedules
 */
export function validateCalendarItem(item = {}, { now = new Date() } = {}) {
  const errors = {}

  if (!item.title || !String(item.title).trim()) {
    errors.title = 'Judul konten wajib diisi.'
  } else if (String(item.title).trim().length > 120) {
    errors.title = 'Judul konten maksimal 120 karakter.'
  }

  const cleanPlatform = String(item.platform || '').trim()
  if (!cleanPlatform || cleanPlatform.toLowerCase() === 'all') {
    errors.platform = 'Platform media wajib diisi.'
  }

  const validStatuses = ['draft', 'scheduled', 'published', 'delayed', 'cancelled']
  if (item.status && !validStatuses.includes(item.status)) {
    errors.status = 'Status tidak valid.'
  }

  const isRecurringNew = (item.scheduleType === 'recurring' || Boolean(item.isRecurring)) && !item.id

  if (isRecurringNew) {
    const sDate = item.startDate || item.publishDate
    if (!sDate || !String(sDate).trim()) {
      errors.startDate = 'Tanggal mulai berulang wajib diisi.'
    } else if (isNaN(new Date(sDate).getTime())) {
      errors.startDate = 'Format tanggal mulai tidak valid.'
    } else {
      const isAllDay = Boolean(item.isAllDay || item.scheduleType === 'allday')
      const pastCheck = checkPastDateTime({ date: sDate, time: item.publishTime, isAllDay }, now)
      if (pastCheck.isPast) {
        errors.startDate = 'Jadwal sudah lewat. Pilih waktu setelah waktu sekarang.'
        errors.publishDate = 'Jadwal sudah lewat. Pilih waktu setelah waktu sekarang.'
      }
    }

    const days = item.daysOfWeek || item.recurrenceRule?.daysOfWeek
    if (!Array.isArray(days) || days.length === 0) {
      errors.daysOfWeek = 'Pilih minimal satu hari untuk pengulangan.'
    }

    if (item.endDate && sDate) {
      if (isNaN(new Date(item.endDate).getTime())) {
        errors.endDate = 'Format tanggal berakhir tidak valid.'
      } else if (item.endDate < sDate) {
        errors.endDate = 'Tanggal berakhir tidak boleh sebelum tanggal mulai.'
      }
    }
  } else if (!item.id) {
    // Single or All-day new creation
    if (!item.publishDate || !String(item.publishDate).trim()) {
      errors.publishDate = 'Tanggal publish wajib ditentukan.'
    } else if (isNaN(new Date(item.publishDate).getTime())) {
      errors.publishDate = 'Format tanggal publish tidak valid.'
    } else {
      const isAllDay = Boolean(item.isAllDay || item.scheduleType === 'allday')
      const pastCheck = checkPastDateTime(
        { date: item.publishDate, time: item.publishTime, isAllDay },
        now
      )
      if (pastCheck.isPast) {
        errors.publishDate = 'Jadwal sudah lewat. Pilih waktu setelah waktu sekarang.'
      }
    }
  } else {
    // Existing item update
    if (item.publishDate && isNaN(new Date(item.publishDate).getTime())) {
      errors.publishDate = 'Format tanggal publish tidak valid.'
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

/**
 * Load items for a tenant business
 */
export function loadCalendarItems(businessId) {
  const key = getContentCalendarStorageKey(businessId)
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Save (create or update) a calendar item.
 * Supports:
 * - Single item creation & in-place update
 * - Multi-occurrence generation for Recurring patterns
 * - Batch update for recurring series (mode: 'series') vs single occurrence (mode: 'single')
 */
export function saveCalendarItem(businessId, item, { mode = 'single', now = new Date() } = {}) {
  const validation = validateCalendarItem(item, { now })
  if (!validation.valid) {
    const firstErr = Object.values(validation.errors)[0]
    throw new Error(firstErr)
  }

  const key = getContentCalendarStorageKey(businessId)
  const existing = loadCalendarItems(businessId)
  const timestamp = new Date().toISOString()

  const isRecurringSchedule = (item.scheduleType === 'recurring' || item.isRecurring) && !item.id

  // 1. CREATE NEW RECURRING SERIES
  if (isRecurringSchedule) {
    const startDate = item.startDate || item.publishDate
    const endDate = item.noEndDate ? null : (item.endDate || null)
    const isAllDay = Boolean(item.isAllDay || item.scheduleType === 'allday')
    const occurrences = generateRecurringDates({
      startDate,
      endDate,
      daysOfWeek: item.daysOfWeek || [],
      maxOccurrences: 90,
    })

    if (occurrences.length === 0) {
      throw new Error('Tidak ada jadwal yang cocok dalam rentang hari yang dipilih.')
    }

    const seriesId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const newItems = occurrences.map((occDate, idx) => ({
      id: `cal_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      businessId: businessId || 'guest',
      title: String(item.title).trim(),
      platform: String(item.platform || '').trim(),
      format: String(item.format || 'feed').trim(),
      publishDate: occDate,
      publishTime: isAllDay ? '' : (item.publishTime || '10:00'),
      isAllDay,
      scheduleType: 'recurring',
      isRecurring: true,
      seriesId,
      recurrenceRule: {
        daysOfWeek: item.daysOfWeek,
        startDate,
        endDate,
        isAllDay,
      },
      status: item.status || 'scheduled',
      caption: String(item.caption || '').trim(),
      tags: Array.isArray(item.tags)
        ? item.tags
        : String(item.tags || '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean),
      cta: String(item.cta || '').trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }))

    const combined = [...newItems, ...existing]
    combined.sort((a, b) => {
      const dateComp = a.publishDate.localeCompare(b.publishDate)
      if (dateComp !== 0) return dateComp
      return (a.publishTime || '').localeCompare(b.publishTime || '')
    })

    try {
      localStorage.setItem(key, JSON.stringify(combined))
    } catch (err) {
      console.error('Failed to persist recurring calendar items:', err)
    }

    return { item: newItems[0], allItems: combined, seriesItems: newItems }
  }

  // 2. UPDATE EXISTING RECURRING SERIES (ENTIRE SERIES)
  if (item.id && item.seriesId && mode === 'series') {
    const isAllDay = item.isAllDay !== undefined ? Boolean(item.isAllDay) : item.scheduleType === 'allday'
    const updated = existing.map(el => {
      if (el.seriesId === item.seriesId) {
        return {
          ...el,
          title: String(item.title).trim(),
          platform: String(item.platform || el.platform).trim(),
          format: String(item.format || el.format).trim(),
          status: item.status || el.status,
          caption: String(item.caption !== undefined ? item.caption : el.caption).trim(),
          tags: Array.isArray(item.tags)
            ? item.tags
            : String(item.tags || '')
                .split(',')
                .map(t => t.trim())
                .filter(Boolean),
          cta: String(item.cta !== undefined ? item.cta : el.cta).trim(),
          isAllDay,
          publishTime: isAllDay ? '' : (item.publishTime || el.publishTime || '10:00'),
          updatedAt: timestamp,
        }
      }
      return el
    })

    updated.sort((a, b) => {
      const dateComp = a.publishDate.localeCompare(b.publishDate)
      if (dateComp !== 0) return dateComp
      return (a.publishTime || '').localeCompare(b.publishTime || '')
    })

    try {
      localStorage.setItem(key, JSON.stringify(updated))
    } catch (err) {
      console.error('Failed to persist series update:', err)
    }

    const currentItem = updated.find(el => el.id === item.id) || updated[0]
    return { item: currentItem, allItems: updated }
  }

  // 3. CREATE OR UPDATE SINGLE ITEM
  const isAllDay = Boolean(item.isAllDay || item.scheduleType === 'allday')
  const payload = {
    id: item.id || `cal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    businessId: businessId || 'guest',
    title: String(item.title).trim(),
    platform: String(item.platform || '').trim(),
    format: String(item.format || 'feed').trim(),
    publishDate: item.publishDate,
    publishTime: isAllDay ? '' : (item.publishTime || '10:00'),
    isAllDay,
    scheduleType: item.scheduleType || (isAllDay ? 'allday' : 'once'),
    status: item.status || 'scheduled',
    caption: String(item.caption || '').trim(),
    tags: Array.isArray(item.tags)
      ? item.tags
      : String(item.tags || '')
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
    cta: String(item.cta || '').trim(),
    seriesId: item.seriesId || null,
    isRecurring: Boolean(item.isRecurring),
    isModifiedOccurrence: Boolean(item.seriesId && mode === 'single'),
    createdAt: item.createdAt || timestamp,
    updatedAt: timestamp,
  }

  const isUpdate = existing.some(el => el.id === payload.id)
  const updated = isUpdate
    ? existing.map(el => (el.id === payload.id ? payload : el))
    : [payload, ...existing]

  updated.sort((a, b) => {
    const dateComp = a.publishDate.localeCompare(b.publishDate)
    if (dateComp !== 0) return dateComp
    return (a.publishTime || '').localeCompare(b.publishTime || '')
  })

  try {
    localStorage.setItem(key, JSON.stringify(updated))
  } catch (err) {
    console.error('Failed to persist calendar item:', err)
  }

  return { item: payload, allItems: updated }
}

/**
 * Delete a calendar item by ID.
 * If deleteSeries is true and the item has a seriesId, deletes all items in that series.
 */
export function deleteCalendarItem(businessId, itemId, { deleteSeries = false } = {}) {
  const key = getContentCalendarStorageKey(businessId)
  const existing = loadCalendarItems(businessId)

  const target = existing.find(el => el.id === itemId)
  if (!target) return existing

  let updated
  if (deleteSeries && target.seriesId) {
    updated = existing.filter(el => el.seriesId !== target.seriesId)
  } else {
    updated = existing.filter(el => el.id !== itemId)
  }

  try {
    localStorage.setItem(key, JSON.stringify(updated))
  } catch (err) {
    console.error('Failed to update calendar storage after delete:', err)
  }

  return updated
}

/**
 * Clear all calendar items for a tenant
 */
export function clearCalendarItems(businessId) {
  const key = getContentCalendarStorageKey(businessId)
  try {
    localStorage.removeItem(key)
  } catch (err) {
    console.error('Failed to clear calendar storage:', err)
  }
  return []
}

/**
 * Generate 35 or 42 grid cells for a full monthly calendar matrix
 */
export function generateMonthGrid(year, month) {
  const firstDayOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Standard Indonesian calendar starts Monday (0=Sen, 6=Min)
  let startOffset = firstDayOfMonth.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const todayIso = new Date().toISOString().slice(0, 10)

  const cells = []

  // Preceding month trailing days
  for (let i = startOffset - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const prevDate = new Date(year, month - 1, day)
    const iso = prevDate.toISOString().slice(0, 10)
    cells.push({
      day,
      date: prevDate,
      isoDate: iso,
      isCurrentMonth: false,
      isToday: iso === todayIso,
    })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const curDate = new Date(year, month, d)
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      day: d,
      date: curDate,
      isoDate: iso,
      isCurrentMonth: true,
      isToday: iso === todayIso,
    })
  }

  // Next month leading days to complete grid (multiples of 7)
  const totalSlots = Math.ceil(cells.length / 7) * 7
  const nextMonthDays = totalSlots - cells.length
  for (let n = 1; n <= nextMonthDays; n++) {
    const nextDate = new Date(year, month + 1, n)
    const iso = nextDate.toISOString().slice(0, 10)
    cells.push({
      day: n,
      date: nextDate,
      isoDate: iso,
      isCurrentMonth: false,
      isToday: iso === todayIso,
    })
  }

  return cells
}

/**
 * Filter calendar items based on filters and search
 */
export function filterCalendarItems(
  items = [],
  { platform = 'all', status = 'all', search = '', monthIso = '' } = {}
) {
  const query = String(search || '').toLowerCase().trim()

  return items.filter(item => {
    if (platform && platform !== 'all') {
      const itemPlat = String(item.platform || '').toLowerCase()
      if (!itemPlat.includes(platform.toLowerCase())) {
        return false
      }
    }

    if (status && status !== 'all' && item.status !== status) {
      return false
    }

    if (monthIso && !item.publishDate.startsWith(monthIso)) {
      return false
    }

    if (query) {
      const matchTitle = item.title.toLowerCase().includes(query)
      const matchPlatform = String(item.platform || '').toLowerCase().includes(query)
      const matchFormat = String(item.format || '').toLowerCase().includes(query)
      const matchCaption = item.caption ? item.caption.toLowerCase().includes(query) : false
      const matchTags = Array.isArray(item.tags)
        ? item.tags.some(t => t.toLowerCase().includes(query))
        : false
      if (!matchTitle && !matchPlatform && !matchFormat && !matchCaption && !matchTags) {
        return false
      }
    }

    return true
  })
}
