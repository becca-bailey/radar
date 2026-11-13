import type { APIRoute } from 'astro';
import { userIdForBearerToken } from '../../lib/apiTokens';
import { groupsEnabled } from '../../lib/flags';
import { JUST_SAVE, groupsForUser, shareChoices } from '../../lib/shares';
import { createServiceClient } from '../../lib/supabase';

/**
 * GET /api/groups — the share menu for capture tools (the iOS Shortcut).
 * Returns `choices`: labels to show, "Just save" first. Send the picked
 * label back as `share_to` on POST /api/saves. Group names only, never
 * members or what's in a group.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const service = createServiceClient();
  let userId = locals.user?.id ?? null;
  if (!userId) {
    const lookup = await userIdForBearerToken(service, request.headers.get('Authorization'));
    if (!lookup.userId) {
      return Response.json(
        { error: 'Sign in or pass a valid API token.', choices: [JUST_SAVE] },
        { status: 401 }
      );
    }
    userId = lookup.userId;
  }

  if (!groupsEnabled()) {
    return Response.json({ choices: [JUST_SAVE] });
  }
  const { groups, lastUsedId } = await groupsForUser(service, userId);
  return Response.json({ choices: shareChoices(groups, lastUsedId).map((c) => c.label) });
};
