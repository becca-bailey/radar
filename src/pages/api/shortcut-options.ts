import type { APIRoute } from 'astro';
import { userIdForBearerToken } from '../../lib/apiTokens';
import { groupsForUser, shortcutMenu } from '../../lib/shares';
import { createServiceClient } from '../../lib/supabase';

/**
 * GET /api/shortcut-options — what the iOS Shortcut should ask, fetched
 * before it asks anything:
 *   ask_note — "yes" or "no" (Settings → Shortcut). A string, because
 *              Shortcuts compares text more reliably than JSON booleans.
 *   groups   — the Shortcut's multi-select: "★ I made this" first, then
 *              the group labels, last-used first. The Shortcut sends the
 *              picked labels back, one per line, as `share_to` on POST
 *              /api/saves; picking none just saves. ("groups" is the
 *              historical key; installed Shortcuts read it.)
 * Group names only, never members or what's in a group.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const service = createServiceClient();
  let userId = locals.user?.id ?? null;
  if (!userId) {
    const lookup = await userIdForBearerToken(service, request.headers.get('Authorization'));
    if (!lookup.userId) {
      return Response.json(
        { error: 'Sign in or pass a valid API token.', groups: [], ask_note: 'yes' },
        { status: 401 }
      );
    }
    userId = lookup.userId;
  }

  const { data: profile } = await service.from('profiles').select('shortcut_ask_note').eq('id', userId).maybeSingle();
  const askNote = profile?.shortcut_ask_note === false ? 'no' : 'yes';
  const { groups, lastUsedId } = await groupsForUser(service, userId);
  return Response.json({ groups: shortcutMenu(groups, lastUsedId), ask_note: askNote });
};
