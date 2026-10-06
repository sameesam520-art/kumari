const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 
                     process.env.NEXT_PUBLIC_SUPABASE_URL || 
                     '';

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                     process.env.SUPABASE_KEY || 
                     process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
                     '';

let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return null;
    }
    try {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    } catch (e) {
      console.warn('[Supabase Init Error]:', e.message);
      return null;
    }
  }
  return supabaseClient;
}

module.exports = {
  getSupabase,
  SUPABASE_URL,
  SUPABASE_KEY
};
