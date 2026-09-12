const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read .env
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...value] = trimmed.split('=');
    if (key && value.length) env[key.trim()] = value.join('=').trim();
  }
});

console.log('=== INVOICE TABLE VERIFICATION ===');
console.log('Project URL:', env.VITE_SUPABASE_URL);
console.log('Key type:', env.VITE_SUPABASE_ANON_KEY?.substring(0, 12) + '...');
console.log('');

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function testTable(name) {
  console.log(`--- ${name} ---`);
  const { data, error, count, status } = await supabase
    .from(name)
    .select('*', { count: 'exact', head: true });
  console.log('  Status:', status || 'N/A');
  console.log('  Count:', count);
  if (error) {
    console.log('  Error code:', error.code);
    console.log('  Error msg:', error.message);
    console.log('  Error hint:', error.hint || 'none');
  } else {
    console.log('  EXISTS: YES');
  }
  console.log('');
}

(async () => {
  await testTable('invoices');
  await testTable('invoice_payments');
  await testTable('invoice_followups');
})();
