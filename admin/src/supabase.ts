import { createClient } from '@supabase/supabase-js'

// Valeurs publiques : seul un compte administrateur peut utiliser les fonctions admin_*.
export const supabase = createClient(
  'https://ffohwqynmtsoqtfejxne.supabase.co',
  'sb_publishable_Kg20gZ0a_7o2QpkX89W7Sw_YvU0dhr2',
)
