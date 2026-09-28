import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || 'https://placeholder.supabase.co'
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: typeof window !== 'undefined',
    persistSession: typeof window !== 'undefined',
    detectSessionInUrl: typeof window !== 'undefined',
  },
})
