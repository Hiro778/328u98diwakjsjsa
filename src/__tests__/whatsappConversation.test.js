import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceConversation,
  getConversationState,
  getInteractiveSelection
} from '../../whatsapp-connector/operational/conversation.mjs'
import { OPERATIONAL_INTENTS } from '../lib/operationalEngine.js'

function executorSpy() {
  const calls = []
  return {
    calls,
    execute: async command => {
      calls.push(command)
      return { success: true, message: '✅ Produk berhasil disimpan.' }
    }
  }
}

describe('WhatsApp conversational operational form', () => {
  it('normalizes native button and list response IDs', () => {
    assert.equal(getInteractiveSelection({ buttonsResponseMessage: { selectedButtonId: 'MODE_FORM' } }), 'MODE_FORM')
    assert.equal(getInteractiveSelection({ listResponseMessage: { singleSelectReply: { selectedRowId: 'FORM_ADD_PRODUCT' } } }), 'FORM_ADD_PRODUCT')
    assert.equal(getInteractiveSelection({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"id":"SAVE_PRODUCT"}' } } }), 'SAVE_PRODUCT')
  })

  it('/hai sends native choices and creates a stateful product form', async () => {
    const spy = executorSpy()
    const scope = { businessId: 'biz_form_a', senderPhone: '62810001', execute: spy.execute }
    const greeting = await advanceConversation({ ...scope, input: '/hai' })
    assert.equal(greeting.interactive.kind, 'buttons')
    assert.equal(greeting.interactive.buttons.length, 2)

    const form = await advanceConversation({ ...scope, input: 'MODE_FORM' })
    assert.equal(form.interactive.kind, 'list')
    await advanceConversation({ ...scope, input: 'FORM_ADD_PRODUCT' })
    assert.equal(getConversationState(scope.businessId, scope.senderPhone).step, 'product_name')
    await advanceConversation({ ...scope, input: 'Kopi Susu' })
    await advanceConversation({ ...scope, input: '5000' })
    await advanceConversation({ ...scope, input: '10000' })
    await advanceConversation({ ...scope, input: '100' })
    const confirmation = await advanceConversation({ ...scope, input: 'LOCATION_GUDANG_UTAMA' })
    assert.equal(confirmation.interactive.kind, 'buttons')
    assert.equal(getConversationState(scope.businessId, scope.senderPhone).step, 'product_confirm')

    await advanceConversation({ ...scope, input: 'SAVE_PRODUCT' })
    assert.equal(spy.calls.length, 1)
    assert.equal(spy.calls[0].intent, OPERATIONAL_INTENTS.CREATE_PRODUCT)
    assert.equal(spy.calls[0].data.name, 'Kopi Susu')
    assert.equal(getConversationState(scope.businessId, scope.senderPhone), null)
  })

  it('cancel clears only the current tenant/user state without calling executor', async () => {
    const spy = executorSpy()
    await advanceConversation({ businessId: 'biz_form_a', senderPhone: '62810002', input: '/hai', execute: spy.execute })
    await advanceConversation({ businessId: 'biz_form_a', senderPhone: '62810002', input: 'MODE_FORM', execute: spy.execute })
    await advanceConversation({ businessId: 'biz_form_b', senderPhone: '62810002', input: '/hai', execute: spy.execute })
    await advanceConversation({ businessId: 'biz_form_a', senderPhone: '62810002', input: 'CANCEL_FORM', execute: spy.execute })
    assert.equal(getConversationState('biz_form_a', '62810002'), null)
    assert.equal(getConversationState('biz_form_b', '62810002').step, 'landing')
    assert.equal(spy.calls.length, 0)
  })
})
