import { createClient } from '@supabase/supabase-js'

// Ces deux valeurs sont publiques : la sécurité vient des règles (RLS) côté Supabase.
export const SUPABASE_URL = 'https://ffohwqynmtsoqtfejxne.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_Kg20gZ0a_7o2QpkX89W7Sw_YvU0dhr2'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
