// Idempotency Layer for BisnisSehat WhatsApp Operational System
// Prevents duplicate processing of incoming WhatsApp commands based on business_id + whatsapp_message_id.

const processedMemoryCache = new Set();
const MAX_CACHE_SIZE = 5000;

function getCompositeKey(businessId, messageId) {
  return `${businessId}:${messageId}`;
}

/**
 * Check if a WhatsApp message has already been processed or is in-flight.
 * Returns: { isDuplicate: boolean, existingResult?: any }
 */
export async function checkIdempotency({ supabase, businessId, whatsappMessageId }) {
  if (!businessId || !whatsappMessageId) {
    return { isDuplicate: false };
  }

  const key = getCompositeKey(businessId, whatsappMessageId);

  // 1. Fast in-memory check
  if (processedMemoryCache.has(key)) {
    return { isDuplicate: true };
  }

  // 2. Database check via whatsapp_message_queue
  if (supabase) {
    try {
      const { data } = await supabase
        .from('whatsapp_message_queue')
        .select('id, status, payload')
        .eq('business_id', businessId)
        .eq('whatsapp_message_id', whatsappMessageId)
        .maybeSingle();

      if (data && (data.status === 'completed' || data.status === 'processing')) {
        // Cache locally
        processedMemoryCache.add(key);
        return { isDuplicate: true, existingStatus: data.status };
      }
    } catch (err) {
      // If DB error, do not fail completely, rely on memory cache
      console.warn('[Idempotency] DB check warning:', err.message);
    }
  }

  return { isDuplicate: false };
}

/**
 * Record message as processed to prevent duplicates.
 */
export async function recordProcessed({ supabase, businessId, whatsappMessageId, status = 'completed' }) {
  if (!businessId || !whatsappMessageId) return;

  const key = getCompositeKey(businessId, whatsappMessageId);

  // Maintain memory cache bound
  if (processedMemoryCache.size > MAX_CACHE_SIZE) {
    const firstKey = processedMemoryCache.values().next().value;
    processedMemoryCache.delete(firstKey);
  }
  processedMemoryCache.add(key);

  if (supabase) {
    try {
      await supabase
        .from('whatsapp_message_queue')
        .update({
          status,
          completed_at: new Date().toISOString()
        })
        .eq('business_id', businessId)
        .eq('whatsapp_message_id', whatsappMessageId);
    } catch {
      // Ignore if record was not in queue
    }
  }
}
