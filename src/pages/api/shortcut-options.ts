import type { APIRoute } from 'astro';
import { userIdForBearerToken } from '../../lib/apiTokens';
import { groupsEnabled } from '../../lib/flags';
import { JUST_SAVE, groupsForUser, shareChoices } from '../../lib/shares';
import { createServiceClient } from '../../lib/supabase';

/**
 * GET /api/shortcut-options — what the iOS Shortcut should ask, fetched
 * before it asks anything:
 *   ask_note — "yes" or "no" (Settings → Shortcut). A string, because
 *              Shortcuts compares text more reliably than JSON booleans.
 *   choices  — the share menu, "Just save" first. Send the picked label
 *              back as `share_to` on POST /api/saves.
 * Group names only, never members or what's in a group.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const service = createServiceClient();
  let userId = locals.user?.id ?? null;
  if (!userId) {
    const lookup = await userIdForBearerToken(service, request.headers.get('Authorization'));
    if (!lookup.userId) {
      return Response.json(
        { error: 'Sign in or pass a valid API token.', choices: [JUST_SAVE], ask_note: 'yes' },
        { status: 401 }
      );
    }
    userId = lookup.userId;
  }

  const { data: profile } = await service.from('profiles').select('shortcut_ask_note').eq('id', userId).maybeSingle();
  const askNote = profile?.shortcut_ask_note === false ? 'no' : 'yes';
  if (!groupsEnabled()) {
    return Response.json({ choices: [JUST_SAVE], ask_note: askNote });
  }
  const { groups, lastUsedId } = await groupsForUser(service, userId);
  return Response.json({ choices: shareChoices(groups, lastUsedId).map((c) => c.label), ask_note: askNote });
};
