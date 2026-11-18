import type { APIRoute } from 'astro';
import { CLEAR_OFFLINE_DATA } from '../../../lib/offline';

/**
 * Sign out. Clear-Site-Data also tells the browser to drop Radar's offline
 * copies of your saves and its service worker (RAD-25). Browsers that ignore
 * the header get the same cleanup from the signed-out page this lands on
 * (src/scripts/offline.ts).
 */
export const POST: APIRoute = async ({ locals, redirect }) => {
  await locals.supabase.auth.signOut();
  const response = redirect('/login');
  response.headers.set('Clear-Site-Data', CLEAR_OFFLINE_DATA);
  return response;
};
