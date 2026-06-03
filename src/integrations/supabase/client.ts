import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getRuntimeConfig, isRealtimeEnabled, isWhatsAppInboxRealtimeEnabled } from '@/lib/runtime-config';

const runtimeConfig = getRuntimeConfig();

const SUPABASE_URL = runtimeConfig.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  runtimeConfig.supabasePublishableKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Configuração do backend ausente. Defina runtime-config.js ou as variáveis VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY.',
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: isRealtimeEnabled() || isWhatsAppInboxRealtimeEnabled() ? 10 : 0,
    },
  },
});