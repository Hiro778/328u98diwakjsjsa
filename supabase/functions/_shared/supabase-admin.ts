// _shared/supabase-admin.ts
// Server-side Supabase client with service_role key.
// Bypasses RLS — used for credential access and cross-table operations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
