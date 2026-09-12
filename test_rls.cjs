const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...value] = trimmed.split('=');
    if (key && value.length) env[key.trim()] = value.join('=').trim();
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

(async () => {
  // Test: query as anon user (no auth) - should get empty or RLS filtered
  console.log('=== RLS TEST: Query as ANON (no session) ===');
  const { data: d1, error: e1 } = await supabase
    .from('invoices')
    .select('*')
    .limit(1);
  console.log('  Result:', d1?.length || 0, 'rows');
  console.log('  Error:', e1 ? e1.code + ': ' + e1.message : 'none');
  console.log('');

  // Test: verify column structure
  console.log('=== COLUMN CHECK via select one row with all cols ===');
  const { data: d2, error: e2 } = await supabase
    .from('invoices')
    .select('id, business_id, customer_id, invoice_number, issue_date, due_date, amount, paid_amount, status, notes, subtotal, discount, tax, created_at, updated_at')
    .limit(0);
  console.log('  Columns query error:', e2 ? e2.code + ': ' + e2.message : 'none (columns exist)');
  console.log('');

  // Test: check invoice_payments structure
  console.log('=== invoice_payments columns ===');
  const { data: d3, error: e3 } = await supabase
    .from('invoice_payments')
    .select('*')
    .limit(0);
  console.log('  Error:', e3 ? e3.code + ': ' + e3.message : 'none (columns exist)');
  console.log('');

  // Test: check invoice_followups structure
  console.log('=== invoice_followups columns ===');
  const { data: d4, error: e4 } = await supabase
    .from('invoice_followups')
    .select('*')
    .limit(0);
  console.log('  Error:', e4 ? e4.code + ': ' + e4.message : 'none (columns exist)');
  console.log('');

  // Test: try inserting (dry run - will fail but shows permissions)
  console.log('=== INSERT PERMISSION TEST ===');
  const { data: d5, error: e5 } = await supabase
    .from('invoices')
    .insert({ invoice_number: 'TEST_DELETE_ME', amount: 0, due_date: '2025-01-01', business_id: '00000000-0000-0000-0000-000000000000' })
    .select();
  console.log('  Insert result:', e5 ? e5.code + ': ' + e5.message : 'allowed (check RLS)');
  console.log('');
})();
