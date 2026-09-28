import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLATFORMS,
  STATUSES,
  FORMATS,
  DAY_OPTIONS,
  SCHEDULE_TYPES,
  getPlatformBadgeInfo,
  checkPastDateTime,
  generateRecurringDates,
  getContentCalendarStorageKey,
  validateCalendarItem,
  loadCalendarItems,
  saveCalendarItem,
  deleteCalendarItem,
  clearCalendarItems,
  generateMonthGrid,
  filterCalendarItems,
} from '../services/contentCalendarService.js'

// Mock for localStorage in Node test runner
const mockStorage = new Map()
global.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
}

describe('Content Calendar Service & Business Logic (sce.md Specification)', () => {
  beforeEach(() => {
    mockStorage.clear()
  })

  describe('1. Validation Rules & Past-Date Protection', () => {
    it('should validate a correct calendar item with future date', () => {
      const fixedNow = new Date('2026-09-19T12:00:00')
      const validItem = {
        title: 'Peluncuran Produk Kopi Gayo Baru',
        platform: 'Instagram',
        format: 'Reels',
        publishDate: '2026-09-19',
        publishTime: '18:00',
        status: 'scheduled',
      }
      const res = validateCalendarItem(validItem, { now: fixedNow })
      assert.equal(res.valid, true)
      assert.deepEqual(res.errors, {})
    })

    it('should reject missing or blank title', () => {
      const res1 = validateCalendarItem({ title: '', platform: 'TikTok', publishDate: '2026-10-01' })
      assert.equal(res1.valid, false)
      assert.ok(res1.errors.title)

      const res2 = validateCalendarItem({ title: '   ', platform: 'TikTok', publishDate: '2026-10-01' })
      assert.equal(res2.valid, false)
      assert.ok(res2.errors.title)
    })

    it('should reject title exceeding 120 characters', () => {
      const longTitle = 'a'.repeat(121)
      const res = validateCalendarItem({ title: longTitle, platform: 'TikTok', publishDate: '2026-10-01' })
      assert.equal(res.valid, false)
      assert.ok(res.errors.title.includes('maksimal 120 karakter'))
    })

    it('should reject missing or invalid publish date', () => {
      const res1 = validateCalendarItem({ title: 'Promo', platform: 'WhatsApp', publishDate: '' })
      assert.equal(res1.valid, false)
      assert.ok(res1.errors.publishDate)

      const res2 = validateCalendarItem({ title: 'Promo', platform: 'WhatsApp', publishDate: 'invalid-date' })
      assert.equal(res2.valid, false)
      assert.ok(res2.errors.publishDate)
    })

    it('should allow free-text custom platform and reject empty or "all"', () => {
      // Free-text platform (Threads, Myspace, etc.) should be valid
      const resCustom = validateCalendarItem({
        title: 'Promo',
        platform: 'Threads',
        publishDate: '2026-10-01',
      })
      assert.equal(resCustom.valid, true)

      // Empty platform should be invalid
      const resEmpty = validateCalendarItem({ title: 'Promo', platform: '', publishDate: '2026-10-01' })
      assert.equal(resEmpty.valid, false)
      assert.ok(resEmpty.errors.platform)

      // "all" should be invalid for a single item
      const resAll = validateCalendarItem({ title: 'Promo', platform: 'all', publishDate: '2026-10-01' })
      assert.equal(resAll.valid, false)
      assert.ok(resAll.errors.platform)
    })

    it('TEST A: Sekali, 19 Sep 2026 18:00 -> PASS jika sekarang sebelum 18:00', () => {
      const fixedNow = new Date('2026-09-19T17:00:00')
      const item = {
        title: 'Flash Sale Sore',
        platform: 'Instagram',
        publishDate: '2026-09-19',
        publishTime: '18:00',
        scheduleType: 'once',
      }
      const res = validateCalendarItem(item, { now: fixedNow })
      assert.equal(res.valid, true)
      assert.deepEqual(res.errors, {})
    })

    it('TEST B: Sekali, 19 Sep 2026 10:00 -> BLOCK dengan pesan "Jadwal sudah lewat. Pilih waktu setelah waktu sekarang."', () => {
      const fixedNow = new Date('2026-09-19T17:00:00')
      const item = {
        title: 'Flash Sale Pagi yang Lewat',
        platform: 'Instagram',
        publishDate: '2026-09-19',
        publishTime: '10:00',
        scheduleType: 'once',
      }
      const res = validateCalendarItem(item, { now: fixedNow })
      assert.equal(res.valid, false)
      assert.equal(res.errors.publishDate, 'Jadwal sudah lewat. Pilih waktu setelah waktu sekarang.')
    })
  })

  describe('2. Recurrence Engine & Custom Day Selections', () => {
    it('TEST C: Berulang Senin + Rabu + Jumat, 21–30 Sep 2026 17:00 -> hanya occurrence pada hari tersebut', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_recurring_test'
      const item = {
        title: 'Kopi Sore Spesial',
        platform: 'Instagram',
        format: 'Reels',
        scheduleType: 'recurring',
        startDate: '2026-09-21',
        endDate: '2026-09-30',
        daysOfWeek: ['Sen', 'Rab', 'Jum'],
        publishTime: '17:00',
        status: 'scheduled',
      }

      const { allItems, seriesItems } = saveCalendarItem(tenant, item, { now: fixedNow })

      // Expected generated dates: 21 (Sen), 23 (Rab), 25 (Jum), 28 (Sen), 30 (Rab)
      const expectedDates = ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30']
      const generatedDates = seriesItems.map((it) => it.publishDate)

      assert.deepEqual(generatedDates, expectedDates)
      assert.equal(seriesItems.length, 5)

      // Ensure no Tuesday, Thursday, Saturday, Sunday dates were generated
      for (const it of seriesItems) {
        const dayIdx = new Date(it.publishDate).getDay()
        assert.ok([1, 3, 5].includes(dayIdx), `Day ${dayIdx} should be Monday(1), Wednesday(3), or Friday(5)`)
        assert.equal(it.publishTime, '17:00')
        assert.ok(it.seriesId)
        assert.equal(it.isRecurring, true)
      }
    })

    it('TEST D: Berulang Senin–Minggu -> setiap hari dalam range', () => {
      const dates = generateRecurringDates({
        startDate: '2026-09-21', // Monday
        endDate: '2026-09-27',   // Sunday
        daysOfWeek: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
      })
      assert.equal(dates.length, 7)
      assert.deepEqual(dates, [
        '2026-09-21',
        '2026-09-22',
        '2026-09-23',
        '2026-09-24',
        '2026-09-25',
        '2026-09-26',
        '2026-09-27',
      ])
    })

    it('TEST E: Berulang + Seharian -> occurrence tanpa jam tayang dan isAllDay = true', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_allday_rec'
      const item = {
        title: 'Campaign Seharian',
        platform: 'TikTok',
        scheduleType: 'recurring',
        isAllDay: true,
        startDate: '2026-09-21',
        endDate: '2026-09-25',
        daysOfWeek: ['Sen', 'Jum'],
      }

      const { seriesItems } = saveCalendarItem(tenant, item, { now: fixedNow })
      assert.equal(seriesItems.length, 2)
      assert.equal(seriesItems[0].isAllDay, true)
      assert.equal(seriesItems[0].publishTime, '')
      assert.equal(seriesItems[1].isAllDay, true)
      assert.equal(seriesItems[1].publishTime, '')
    })
  })

  describe('3. Free-Text Manual Inputs (TEST F & TEST G)', () => {
    it('TEST F: Platform "Instagram, TikTok, Threads" tersimpan sebagai input user tanpa batasan dropdown', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_custom_platform'
      const { item } = saveCalendarItem(
        tenant,
        {
          title: 'Konten Multiplatform',
          platform: 'Instagram, TikTok, Threads',
          format: 'Reels',
          publishDate: '2026-09-22',
          publishTime: '15:00',
        },
        { now: fixedNow }
      )

      assert.equal(item.platform, 'Instagram, TikTok, Threads')
      const loaded = loadCalendarItems(tenant)
      assert.equal(loaded[0].platform, 'Instagram, TikTok, Threads')
    })

    it('TEST G: Format "Video 30 detik" tersimpan sebagai input user', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_custom_format'
      const { item } = saveCalendarItem(
        tenant,
        {
          title: 'Review Minuman',
          platform: 'YouTube',
          format: 'Video 30 detik',
          publishDate: '2026-09-22',
          publishTime: '15:00',
        },
        { now: fixedNow }
      )

      assert.equal(item.format, 'Video 30 detik')
      const loaded = loadCalendarItems(tenant)
      assert.equal(loaded[0].format, 'Video 30 detik')
    })
  })

  describe('4. Delete & Edit Recurring Occurrences (TEST H & TEST I)', () => {
    it('TEST H: Delete single recurring occurrence -> hanya satu occurrence hilang', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_del_single'
      const { seriesItems } = saveCalendarItem(
        tenant,
        {
          title: 'Rangkaian Event Mingguan',
          platform: 'Instagram',
          scheduleType: 'recurring',
          startDate: '2026-09-21',
          endDate: '2026-09-25',
          daysOfWeek: ['Sen', 'Rab', 'Jum'],
        },
        { now: fixedNow }
      )

      assert.equal(seriesItems.length, 3)
      const targetId = seriesItems[1].id // 23 Sep (Rabu)

      // Delete only single occurrence
      const afterDelete = deleteCalendarItem(tenant, targetId, { deleteSeries: false })
      assert.equal(afterDelete.length, 2)
      assert.ok(!afterDelete.some((el) => el.id === targetId))
      // The other 2 occurrences of the series remain
      assert.equal(afterDelete[0].seriesId, seriesItems[0].seriesId)
      assert.equal(afterDelete[1].seriesId, seriesItems[0].seriesId)
    })

    it('TEST I: Delete entire series -> seluruh series hilang', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_del_series'
      const { seriesItems } = saveCalendarItem(
        tenant,
        {
          title: 'Series to Wipe',
          platform: 'Facebook',
          scheduleType: 'recurring',
          startDate: '2026-09-21',
          endDate: '2026-09-25',
          daysOfWeek: ['Sen', 'Rab', 'Jum'],
        },
        { now: fixedNow }
      )

      // Also add an unrelated single event
      saveCalendarItem(
        tenant,
        {
          title: 'Unrelated Solo Event',
          platform: 'YouTube',
          publishDate: '2026-09-30',
        },
        { now: fixedNow }
      )

      assert.equal(loadCalendarItems(tenant).length, 4)

      // Delete entire series
      const afterDelete = deleteCalendarItem(tenant, seriesItems[0].id, { deleteSeries: true })
      assert.equal(afterDelete.length, 1)
      assert.equal(afterDelete[0].title, 'Unrelated Solo Event')
    })

    it('should edit entire recurring series in-place when mode is "series"', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_edit_series'
      const { seriesItems } = saveCalendarItem(
        tenant,
        {
          title: 'Draft Series',
          platform: 'Instagram',
          scheduleType: 'recurring',
          startDate: '2026-09-21',
          endDate: '2026-09-25',
          daysOfWeek: ['Sen', 'Jum'],
        },
        { now: fixedNow }
      )

      const updatedSeries = saveCalendarItem(
        tenant,
        {
          ...seriesItems[0],
          title: 'Title Revisi Serentak',
          caption: 'Caption baru seragam',
        },
        { mode: 'series', now: fixedNow }
      )

      const reloaded = loadCalendarItems(tenant)
      assert.equal(reloaded.length, 2)
      for (const it of reloaded) {
        assert.equal(it.title, 'Title Revisi Serentak')
        assert.equal(it.caption, 'Caption baru seragam')
      }
    })
  })

  describe('5. Storage Persistence & Tenant Isolation (TEST J & TEST K)', () => {
    it('TEST J: Refresh browser / reload -> recurrence tetap benar', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_persist_check'
      saveCalendarItem(
        tenant,
        {
          title: 'Posting Pagi Rutin',
          platform: 'TikTok',
          scheduleType: 'recurring',
          startDate: '2026-09-21',
          endDate: '2026-09-23',
          daysOfWeek: ['Sen', 'Rab'],
          publishTime: '08:00',
        },
        { now: fixedNow }
      )

      // Simulates page reload
      const reloaded = loadCalendarItems(tenant)
      assert.equal(reloaded.length, 2)
      assert.equal(reloaded[0].publishDate, '2026-09-21')
      assert.equal(reloaded[0].publishTime, '08:00')
      assert.equal(reloaded[0].isRecurring, true)
      assert.ok(reloaded[0].seriesId)
    })

    it('TEST K: Strict Tenant Isolation -> Business A cannot read/modify Business B items', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenantA = 'biz_tenant_A'
      const tenantB = 'biz_tenant_B'

      const { item: itemA } = saveCalendarItem(
        tenantA,
        {
          title: 'Konten Rahasia A',
          platform: 'Instagram',
          publishDate: '2026-09-25',
        },
        { now: fixedNow }
      )

      const { item: itemB } = saveCalendarItem(
        tenantB,
        {
          title: 'Konten Rahasia B',
          platform: 'TikTok',
          publishDate: '2026-09-26',
        },
        { now: fixedNow }
      )

      const loadedA = loadCalendarItems(tenantA)
      const loadedB = loadCalendarItems(tenantB)

      assert.equal(loadedA.length, 1)
      assert.equal(loadedA[0].title, 'Konten Rahasia A')

      assert.equal(loadedB.length, 1)
      assert.equal(loadedB[0].title, 'Konten Rahasia B')

      // Attempting delete in tenant A using tenant B id must not delete from B
      deleteCalendarItem(tenantA, itemB.id)
      assert.equal(loadCalendarItems(tenantB).length, 1)
      assert.equal(loadCalendarItems(tenantB)[0].id, itemB.id)
    })
  })

  describe('6. UI Helpers & Filtering', () => {
    it('getPlatformBadgeInfo provides fallback styling for custom platforms', () => {
      const igInfo = getPlatformBadgeInfo('Instagram')
      assert.equal(igInfo.id, 'instagram')

      const customInfo = getPlatformBadgeInfo('Threads Official')
      assert.ok(customInfo.color)
      assert.ok(customInfo.badgeColor)
    })

    it('filterCalendarItems handles search and platform filtering', () => {
      const items = [
        { id: '1', title: 'Kopi Susu Gula Aren Promo', platform: 'Instagram', status: 'scheduled', publishDate: '2026-10-05' },
        { id: '2', title: 'Tutorial Cold Brew', platform: 'TikTok, Reels', status: 'published', publishDate: '2026-10-10' },
      ]

      const resSearch = filterCalendarItems(items, { search: 'cold brew' })
      assert.equal(resSearch.length, 1)
      assert.equal(resSearch[0].id, '2')

      const resPlat = filterCalendarItems(items, { platform: 'tiktok' })
      assert.equal(resPlat.length, 1)
      assert.equal(resPlat[0].id, '2')
    })
  })

  describe('7. Additional Edge Cases & Recurrence Rules', () => {
    it('should reject recurring schedule if endDate is before startDate', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const res = validateCalendarItem(
        {
          title: 'Invalid Range',
          platform: 'Instagram',
          scheduleType: 'recurring',
          startDate: '2026-09-25',
          endDate: '2026-09-20',
          daysOfWeek: ['Sen'],
        },
        { now: fixedNow }
      )
      assert.equal(res.valid, false)
      assert.equal(res.errors.endDate, 'Tanggal berakhir tidak boleh sebelum tanggal mulai.')
    })

    it('editing a single occurrence modifies only that occurrence and preserves the rest of the series', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_single_edit_test'
      const { seriesItems } = saveCalendarItem(
        tenant,
        {
          title: 'Template Series',
          platform: 'Instagram',
          scheduleType: 'recurring',
          startDate: '2026-09-21',
          endDate: '2026-09-25',
          daysOfWeek: ['Sen', 'Rab', 'Jum'],
        },
        { now: fixedNow }
      )

      // Edit only occurrence index 1 (Rabu)
      const target = seriesItems[1]
      saveCalendarItem(
        tenant,
        {
          ...target,
          title: 'Special Wednesday Post',
        },
        { mode: 'single', now: fixedNow }
      )

      const reloaded = loadCalendarItems(tenant)
      assert.equal(reloaded.length, 3)

      const updatedOne = reloaded.find((el) => el.id === target.id)
      assert.equal(updatedOne.title, 'Special Wednesday Post')

      const unmodifiedOne = reloaded.find((el) => el.id === seriesItems[0].id)
      assert.equal(unmodifiedOne.title, 'Template Series')
    })

    it('clearCalendarItems empties the tenant items', () => {
      const fixedNow = new Date('2026-09-19T10:00:00')
      const tenant = 'biz_clear_test'
      saveCalendarItem(
        tenant,
        { title: 'Item 1', platform: 'TikTok', publishDate: '2026-09-25' },
        { now: fixedNow }
      )
      assert.equal(loadCalendarItems(tenant).length, 1)

      clearCalendarItems(tenant)
      assert.equal(loadCalendarItems(tenant).length, 0)
    })
  })
})

