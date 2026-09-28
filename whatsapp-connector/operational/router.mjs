// Operational Message Router for BisnisSehat WhatsApp Connector
// Connects incoming text or guided form -> Rule-based parser -> Validator -> Executor -> WhatsApp reply.

import { OPERATIONAL_INTENTS } from './intents.mjs';
import { parseOperationalText } from './parser.mjs';
import { validateOperationalCommand } from './validator.mjs';
import { executeOperationalCommand } from './executor.mjs';
import { checkIdempotency, recordProcessed } from './idempotency.mjs';

/**
 * Handle incoming WhatsApp text message through full operational pipeline.
 */
export async function handleOperationalMessage({
  text,
  businessId,
  whatsappMessageId,
  senderPhone,
  supabase,
  socket = null
}) {
  if (!text || !businessId) {
    return { success: false, message: 'Teks atau business_id tidak tersedia' };
  }

  // 1. Idempotency Check
  if (whatsappMessageId) {
    const { isDuplicate } = await checkIdempotency({
      supabase,
      businessId,
      whatsappMessageId
    });

    if (isDuplicate) {
      console.log(`[Operational] Duplicate message skipped: businessId=${businessId} messageId=${whatsappMessageId}`);
      return { success: true, duplicate: true, message: 'Pesan telah diproses sebelumnya.' };
    }
  }

  // 2. Deterministic Rule-Based Parsing
  const command = parseOperationalText(text);

  // 3. Validation
  const validation = validateOperationalCommand(command);
  if (!validation.valid) {
    const responseText = validation.prompt || `Mohon maaf, format belum sesuai:\n- ${validation.errors.join('\n- ')}`;

    // Send guidance reply to WhatsApp user if socket available
    if (socket && senderPhone) {
      const jid = senderPhone.includes('@') ? senderPhone : `${senderPhone}@s.whatsapp.net`;
      try {
        await socket.sendMessage(jid, { text: responseText });
      } catch (sendErr) {
        console.error('[Operational] Failed to send guidance reply:', sendErr.message);
      }
    }

    if (whatsappMessageId) {
      await recordProcessed({ supabase, businessId, whatsappMessageId, status: 'completed' });
    }

    return {
      success: false,
      validationError: true,
      message: responseText,
      command
    };
  }

  // 4. Execution of Database Mutation
  const execResult = await executeOperationalCommand(command, {
    supabase,
    businessId,
    whatsappMessageId
  });

  // 5. Send Confirmation Reply on WhatsApp
  if (socket && senderPhone && execResult.message) {
    const jid = senderPhone.includes('@') ? senderPhone : `${senderPhone}@s.whatsapp.net`;
    try {
      await socket.sendMessage(jid, { text: execResult.message });
    } catch (sendErr) {
      console.error('[Operational] Failed to send confirmation reply:', sendErr.message);
    }
  }

  // 6. Record message as processed
  if (whatsappMessageId) {
    await recordProcessed({ supabase, businessId, whatsappMessageId, status: 'completed' });
  }

  return {
    success: execResult.success,
    message: execResult.message,
    command,
    result: execResult
  };
}

/**
 * Handle direct command from Guided Form (Web UI).
 * Bypasses text parsing, but uses the exact same validation and executor.
 */
export async function handleGuidedCommand({
  command,
  businessId,
  supabase,
  whatsappMessageId = null
}) {
  if (!command || !command.intent) {
    return { success: false, message: 'Command tidak valid' };
  }

  // Validation
  const validation = validateOperationalCommand(command);
  if (!validation.valid) {
    return {
      success: false,
      validationError: true,
      message: validation.prompt || validation.errors.join(', ')
    };
  }

  // Unified Execution
  return await executeOperationalCommand(command, {
    supabase,
    businessId,
    whatsappMessageId
  });
}
