// Tenant-Scoped Entity Resolution for BisnisSehat WhatsApp Operational System
// Resolves entity names (products, suppliers, customers, invoices) strictly within the caller's business_id.

/**
 * Resolve a product by name or ID within a business.
 */
export async function resolveProduct({ supabase, businessId, productName, productId }) {
  if (!businessId) {
    throw new Error('business_id is required for entity resolution');
  }

  if (productId) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, unit_price, cost_price, unit, category, is_active')
      .eq('id', productId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error || !data) return { notFound: true, query: productId };
    return { product: data };
  }

  if (!productName) return { notFound: true, query: '' };

  const nameClean = productName.trim();

  // 1. Try exact match (case insensitive)
  const { data: exactMatches, error: exactErr } = await supabase
    .from('products')
    .select('id, name, unit_price, cost_price, unit, category, is_active')
    .eq('business_id', businessId)
    .ilike('name', nameClean);

  if (!exactErr && exactMatches && exactMatches.length === 1) {
    return { product: exactMatches[0] };
  }

  // 2. Try partial substring match
  const { data: partialMatches, error: partialErr } = await supabase
    .from('products')
    .select('id, name, unit_price, cost_price, unit, category, is_active')
    .eq('business_id', businessId)
    .ilike('name', `%${nameClean}%`)
    .limit(5);

  if (partialErr || !partialMatches || partialMatches.length === 0) {
    return { notFound: true, query: nameClean };
  }

  if (partialMatches.length === 1) {
    return { product: partialMatches[0] };
  }

  // Ambiguous: multiple matches found
  return {
    ambiguous: true,
    query: nameClean,
    options: partialMatches.map(p => p.name),
    matches: partialMatches
  };
}

/**
 * Resolve a supplier by name or ID within a business.
 */
export async function resolveSupplier({ supabase, businessId, supplierName, supplierId }) {
  if (!businessId) throw new Error('business_id is required');

  if (supplierId) {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, phone, email, contact, contact_person')
      .eq('id', supplierId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error || !data) return { notFound: true, query: supplierId };
    return { supplier: data };
  }

  if (!supplierName) return { notFound: true, query: '' };

  const nameClean = supplierName.trim();
  const { data: matches } = await supabase
    .from('suppliers')
    .select('id, name, phone, email, contact, contact_person')
    .eq('business_id', businessId)
    .ilike('name', `%${nameClean}%`)
    .limit(5);

  if (!matches || matches.length === 0) {
    return { notFound: true, query: nameClean };
  }

  if (matches.length === 1) {
    return { supplier: matches[0] };
  }

  return {
    ambiguous: true,
    query: nameClean,
    options: matches.map(s => s.name),
    matches
  };
}

/**
 * Resolve a customer by name or ID within a business.
 */
export async function resolveCustomer({ supabase, businessId, customerName, customerId }) {
  if (!businessId) throw new Error('business_id is required');

  if (customerId) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, email, address')
      .eq('id', customerId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error || !data) return { notFound: true, query: customerId };
    return { customer: data };
  }

  if (!customerName) return { notFound: true, query: '' };

  const nameClean = customerName.trim();
  const { data: matches } = await supabase
    .from('customers')
    .select('id, name, phone, email, address')
    .eq('business_id', businessId)
    .ilike('name', `%${nameClean}%`)
    .limit(5);

  if (!matches || matches.length === 0) {
    return { notFound: true, query: nameClean };
  }

  if (matches.length === 1) {
    return { customer: matches[0] };
  }

  return {
    ambiguous: true,
    query: nameClean,
    options: matches.map(c => c.name),
    matches
  };
}

/**
 * Resolve an invoice by number or ID within a business.
 */
export async function resolveInvoice({ supabase, businessId, invoiceNumber, invoiceId }) {
  if (!businessId) throw new Error('business_id is required');

  let query = supabase
    .from('invoices')
    .select('id, invoice_number, customer_id, amount, paid_amount, status, due_date')
    .eq('business_id', businessId);

  if (invoiceId) {
    query = query.eq('id', invoiceId);
  } else if (invoiceNumber) {
    query = query.ilike('invoice_number', `%${invoiceNumber.trim()}%`);
  } else {
    return { notFound: true, query: '' };
  }

  const { data: matches, error } = await query.limit(5);
  if (error || !matches || matches.length === 0) {
    return { notFound: true, query: invoiceNumber || invoiceId };
  }

  if (matches.length === 1) {
    return { invoice: matches[0] };
  }

  return {
    ambiguous: true,
    query: invoiceNumber,
    options: matches.map(i => i.invoice_number),
    matches
  };
}
