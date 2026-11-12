import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

function requireEnv(name: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  // process.env first: import.meta.env gets inlined at build time, and a
  // local `netlify deploy --build` can't see Netlify's secret-scoped values,
  // so inlining would bake the local dev key into the production bundle.
  const value = process.env[name] ?? import.meta.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it from \`supabase status\`.`);
  }
  return value;
}

/** Per-request client authenticated as the signed-in user (RLS applies). */
export function createRequestClient(request: Request, cookies: AstroCookies): SupabaseClient {
  return createServerClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, { path: '/', ...options });
        }
      },
    },
  });
}

let serviceClient: SupabaseClient | undefined;

/**
 * Service-role client: bypasses RLS. Only for server code that has already
 * resolved the acting user (save endpoint, ingest worker, edition builder).
 */
export function createServiceClient(): SupabaseClient {
  serviceClient ??= createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}
