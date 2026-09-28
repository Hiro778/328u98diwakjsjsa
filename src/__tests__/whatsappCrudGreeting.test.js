import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  OPERATIONAL_INTENTS,
  parseOperationalText,
  validateOperationalCommand,
  executeOperationalCommand
} from '../lib/operationalEngine.js'
import { CONNECTION_STATUS, statusFromConnectionUpdate } from '../../whatsapp-connector/connectionState.mjs'

function customerStore(rows) {
  return {
    rows,
    from(table) {
      assert.equal(table, 'customers')
      const filters = []
      let deleting = false
      const query = {
        select() { return query },
        eq(column, value) { filters.push(row => row[column] === value); return query },
        ilike(column, value) {
          const needle = value.replaceAll('%', '').toLowerCase()
          filters.push(row => String(row[column] || '').toLowerCase().includes(needle))
          return query
        },
        limit() { return query },
        delete() { deleting = true; return query },
        then(resolve) {
          const matches = rows.filter(row => filters.every(filter => filter(row)))
          if (deleting) {
            for (const row of matches) rows.splice(rows.indexOf(row), 1)
            resolve({ data: matches, error: null })
            return
          }
          resolve({ data: matches, error: null })
        }
      }
      return query
    }
  }
}

describe('WhatsApp CRUD routing and greeting', () => {
  it('gives delete priority and never parses "hapus yanto" as create', () => {
    assert.equal(parseOperationalText('hapus yanto').intent, OPERATIONAL_INTENTS.DELETE_CUSTOMER)
    assert.equal(parseOperationalText('hapus produk Kopi Susu').intent, OPERATIONAL_INTENTS.DELETE_PRODUCT)
  })

  it('distinguishes update from create', () => {
    const command = parseOperationalText('edit pelanggan Yanto email baru@gmail.com')
    assert.equal(command.intent, OPERATIONAL_INTENTS.UPDATE_CUSTOMER)
    assert.equal(command.data.name, 'Yanto')
    assert.equal(command.data.email, 'baru@gmail.com')
    assert.equal(parseOperationalText('tambah pelanggan Yanto email yanto@gmail.com').intent, OPERATIONAL_INTENTS.CREATE_CUSTOMER)
  })

  it('treats an open Baileys socket as connected even when sync metadata exists', () => {
    assert.equal(statusFromConnectionUpdate({ connection: 'open', qr: 'stale-sync-qr' }), CONNECTION_STATUS.CONNECTED)
  })

  it('/hai returns the two usable mode choices', async () => {
    const command = parseOperationalText('/hai')
    assert.equal(command.intent, OPERATIONAL_INTENTS.SHOW_GREETING)
    assert.equal(validateOperationalCommand(command).valid, true)
    const result = await executeOperationalCommand(command, { businessId: 'biz_test', supabase: {} })
    assert.equal(result.success, true)
    assert.match(result.message, /Gunakan AI/)
    assert.match(result.message, /Gunakan Formulir/)
  })

  it('returns safe AI and form-mode responses without a second executor', async () => {
    const ai = await executeOperationalCommand({ intent: OPERATIONAL_INTENTS.SELECT_AI_MODE, data: {} }, { businessId: 'biz_test', supabase: {} })
    const form = await executeOperationalCommand({ intent: OPERATIONAL_INTENTS.SELECT_FORM_MODE, data: {} }, { businessId: 'biz_test', supabase: {} })
    assert.match(ai.message, /Gemini API Key|Mode AI aktif/)
    assert.match(form.message, /Pelanggan/)
  })

  it('does not mutate when a delete target is unknown or ambiguous', async () => {
    const rows = [
      { id: 'customer-a', business_id: 'biz_test', name: 'Yanto A' },
      { id: 'customer-b', business_id: 'biz_test', name: 'Yanto B' },
      { id: 'other-tenant', business_id: 'biz_other', name: 'Yanto' }
    ]
    const supabase = customerStore(rows)
    const unknown = await executeOperationalCommand(parseOperationalText('hapus pelanggan Tidak Ada'), { businessId: 'biz_test', supabase })
    const ambiguous = await executeOperationalCommand(parseOperationalText('hapus pelanggan Yanto'), { businessId: 'biz_test', supabase })
    assert.equal(unknown.success, false)
    assert.equal(ambiguous.ambiguous, true)
    assert.equal(rows.length, 3)
  })

  it('deletes only the resolved record in the current tenant', async () => {
    const rows = [
      { id: 'customer-current', business_id: 'biz_test', name: 'Yanto' },
      { id: 'customer-other', business_id: 'biz_other', name: 'Yanto' }
    ]
    const result = await executeOperationalCommand(parseOperationalText('hapus pelanggan Yanto'), {
      businessId: 'biz_test',
      supabase: customerStore(rows)
    })
    assert.equal(result.success, true)
    assert.deepEqual(rows, [{ id: 'customer-other', business_id: 'biz_other', name: 'Yanto' }])
  })
})
