/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_CLASSIFY_MODEL?: string;
  readonly CATEGORY_SIM_THRESHOLD?: string;
  readonly CRON_SECRET?: string;
  readonly SAFE_BROWSING_API_KEY?: string;
  readonly ADMIN_EMAILS?: string;
  readonly GROUPS_ENABLED?: string;
}

declare namespace App {
  interface Locals {
    supabase: import('@supabase/supabase-js').SupabaseClient;
    user: import('@supabase/supabase-js').User | null;
    /** IANA zone for showing dates, always valid (see middleware.ts). */
    timeZone: string;
  }
}
