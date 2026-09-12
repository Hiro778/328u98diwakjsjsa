import { createClient } from '@supabase/supabase-js';

// Phase 1 Queue Manager & Simulator
class WhatsAppQueueManager {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // 1. Ingest webhook event with Idempotency
  async ingestEvent(payload, businessId = null, phoneNumberId = null) {
    try {
      const entry = payload.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      const whatsappMessageId = message?.id || `fallback_${Date.now()}_${Math.random()}`;
      const senderPhone = message?.from || '';
      const messageType = message?.type || 'text';
      const messageText = message?.text?.body || '';

      // Insert or ignore if duplicate (idempotency via unique index on whatsapp_message_id)
      const { data, error } = await this.supabase
        .from('whatsapp_message_queue')
        .insert({
          business_id: businessId,
          phone_number_id: phoneNumberId || value?.metadata?.phone_number_id,
          whatsapp_message_id: whatsappMessageId,
          sender_phone: senderPhone,
          message_type: messageType,
          message_text: messageText,
          payload: payload,
          status: 'queued'
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Unique violation -> Duplicate webhook, safe ignore
          return { status: 'duplicate', whatsappMessageId };
        }
        throw error;
      }

      return { status: 'queued', job: data };
    } catch (err) {
      console.error('Ingest error:', err.message);
      throw err;
    }
  }

  // 2. Claim job atomically
  async claimJob(workerId, timeoutSeconds = 300) {
    const { data, error } = await this.supabase.rpc('claim_whatsapp_job', {
      worker_id: workerId,
      claim_timeout: `${timeoutSeconds} seconds`
    });

    if (error) {
      console.error('Claim error:', error.message);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  }

  // 3. Complete job
  async completeJob(jobId) {
    const { error } = await this.supabase
      .from('whatsapp_message_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) throw error;
  }

  // 4. Fail or Retry job with exponential backoff
  async failJob(jobId, attempts, maxAttempts, errorMessage) {
    const nextAttempts = attempts + 1;
    if (nextAttempts >= maxAttempts) {
      const { error } = await this.supabase
        .from('whatsapp_message_queue')
        .update({
          status: 'failed',
          attempts: nextAttempts,
          failed_at: new Date().toISOString(),
          last_error: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
      if (error) throw error;
    } else {
      // Exponential backoff: 2^attempts * 10 seconds
      const delaySeconds = Math.pow(2, nextAttempts) * 10;
      const availableAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

      const { error } = await this.supabase
        .from('whatsapp_message_queue')
        .update({
          status: 'retrying',
          attempts: nextAttempts,
          available_at: availableAt,
          last_error: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
      if (error) throw error;
    }
  }
}

export { WhatsAppQueueManager };
