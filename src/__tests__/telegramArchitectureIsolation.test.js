import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Telegram Client vs Server Architectural Boundary Isolation (te.md)', () => {
  it('1. TelegramOperasionalPage.jsx must strictly import from telegramOperasionalClient', () => {
    const pageSrc = fs.readFileSync(
      path.resolve('src/pages/dashboard/operasional/TelegramOperasionalPage.jsx'),
      'utf8'
    )
    assert.ok(
      pageSrc.includes('services/telegramOperasionalClient'),
      'TelegramOperasionalPage.jsx must import from telegramOperasionalClient'
    )
    assert.ok(
      !pageSrc.includes('services/telegramService'),
      'TelegramOperasionalPage.jsx must NOT import directly from telegramService'
    )
    assert.ok(
      !pageSrc.includes('telegramAiOperator'),
      'TelegramOperasionalPage.jsx must NOT import telegramAiOperator'
    )
  })

  it('2. telegramOperasionalClient.js must NOT reference process.env or Ollama', () => {
    const clientSrc = fs.readFileSync(
      path.resolve('src/services/telegramOperasionalClient.js'),
      'utf8'
    )
    assert.ok(
      !clientSrc.includes('process.env'),
      'telegramOperasionalClient.js must NOT contain process.env'
    )
    assert.ok(
      !clientSrc.includes('OLLAMA'),
      'telegramOperasionalClient.js must NOT contain OLLAMA references'
    )
    assert.ok(
      !clientSrc.includes('11434'),
      'telegramOperasionalClient.js must NOT contain Ollama port 11434'
    )
    assert.ok(
      !clientSrc.includes('telegramAiOperator'),
      'telegramOperasionalClient.js must NOT import or reference telegramAiOperator'
    )
  })

  it('3. Client bundle does not expose server-only modules', () => {
    const serverServiceSrc = fs.readFileSync(
      path.resolve('src/services/telegramService.server.js'),
      'utf8'
    )
    assert.ok(
      serverServiceSrc.includes('processTelegramWebhookUpdate'),
      'Server module must own processTelegramWebhookUpdate'
    )
    assert.ok(
      serverServiceSrc.includes('telegramAiOperator.server.js'),
      'Server module must own AI Operator integration'
    )
  })
})
