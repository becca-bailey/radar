import type { APIRoute } from 'astro';
import { userIdForBearerToken } from '../../lib/apiTokens';
import { groupsEnabled } from '../../lib/flags';
import { createSave } from '../../lib/saves';
import {
  type ShareOutcome,
  groupsForUser,
  parseShareTo,
  resolveShareChoice,
  shareSaveAsService,
  shareSummary,
} from '../../lib/shares';
import { createServiceClient } from '../../lib/supabase';

/**
 * POST /api/saves — the one capture endpoint. Three callers:
 * the web form (session cookie), the bookmarklet and the iOS Shortcut
 * (Bearer rdr_… token). Form posts get redirects; everything else gets JSON.
 *
 * JSON callers may also send `share_to`: group labels from GET
 * /api/shortcut-options, as a JSON array or one string with a label per
 * line. The save always happens first; sharing is a second step whose
 * outcome goes into `message` ("Saved and shared to Readers and Bakers").
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const service = createServiceClient();

  let userId = locals.user?.id ?? null;
  if (!userId) {
    const lookup = await userIdForBearerToken(service, request.headers.get('Authorization'));
    if (!lookup.userId) {
      // `message` on every JSON response is what the Shortcut shows in its
      // notification, so failures are visible instead of a fake "Saved".
      const message =
        lookup.failure === 'no_token'
          ? 'Not saved — the Shortcut has no token; edit its first Text action and paste yours'
          : 'Not saved — token not recognized; copy a fresh one from Radar Settings';
      return Response.json(
        { error: 'Sign in or pass a valid API token.', message },
        { status: 401 }
      );
    }
    userId = lookup.userId;
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  const isForm =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');

  let url = '';
  let note: string | null = null;
  let title: string | null = null;
  let wayback = false;
  let shareTo: string[] = [];
  let returnTo = '/';
  // Echoed in the no-link error so the Shortcut's notification shows
  // what actually arrived; tokens never appear in the body.
  let bodyDebug = '';

  if (isForm) {
    const form = await request.formData();
    url = String(form.get('url') ?? '');
    note = (form.get('note') as string) || null;
    title = (form.get('title') as string) || null;
    wayback = form.get('wayback') === 'on';
    if (form.get('return_to') === 'save') returnTo = '/save';
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Body must be JSON or form data.', message: 'Not saved — the request body was not JSON' },
        { status: 400 }
      );
    }
    const b = body as Record<string, unknown>;
    url = typeof b.url === 'string' ? b.url : '';
    // "sentence" is the pre-rename key; Shortcuts configured before the
    // rename keep working.
    note = typeof b.note === 'string' ? b.note : typeof b.sentence === 'string' ? b.sentence : null;
    title = typeof b.title === 'string' ? b.title : null;
    wayback = b.wayback === true;
    shareTo = parseShareTo(b.share_to);
    bodyDebug = `url=${JSON.stringify(b.url ?? null)?.slice(0, 80)} keys=${
      Object.keys(b).join(',') || 'none'
    }`;
  }

  if (!url.trim()) {
    return isForm
      ? redirect(returnTo + '?error=' + encodeURIComponent('Paste a link to save.'))
      : Response.json(
          { error: 'url is required.', message: `Not saved — no link found (${bodyDebug})` },
          { status: 400 }
        );
  }

  try {
    const result = await createSave(service, userId, {
      url,
      note,
      title,
      waybackRequested: wayback,
    });
    if (import.meta.env.DEV) {
      // No scheduled functions in local dev, so a save kicks the ingest
      // queue itself; fire-and-forget keeps the save response fast.
      void fetch(new URL('/api/jobs/ingest?limit=5', request.url), { method: 'POST' }).catch(() => {});
    }
    if (isForm) {
      // A brand-new save can be undone from the home page's "Saved." notice.
      const undo = result.alreadySaved ? '' : `&undo_save=${result.saveId}`;
      return redirect(returnTo === '/save' ? '/save?done=1' : `/?saved=1${undo}`);
    }
    let message = result.alreadySaved ? 'Already on Radar' : 'Saved to Radar';
    const shared: string[] = [];
    if (shareTo.length && groupsEnabled()) {
      // Resolve every label against one snapshot: sharing updates the
      // last-used group, which reorders (but never relabels) the menu.
      const { groups, lastUsedId } = await groupsForUser(service, userId);
      const outcomes: { label: string; outcome: ShareOutcome }[] = [];
      const missing: string[] = [];
      const done = new Set<string>();
      for (const label of shareTo) {
        const choice = resolveShareChoice(label, groups, lastUsedId);
        if (!choice?.groupId) {
          missing.push(label);
          continue;
        }
        if (done.has(choice.groupId)) continue;
        done.add(choice.groupId);
        const outcome = await shareSaveAsService(service, userId, result.saveId, choice.groupId);
        if (outcome === 'shared' || outcome === 'already') shared.push(choice.label);
        outcomes.push({ label: choice.label, outcome });
      }
      message += shareSummary(outcomes, missing);
    }
    return Response.json({ ...result, shared_to: shared, message }, { status: 201 });
  } catch (err) {
    if (err instanceof TypeError) {
      const msg = 'That does not look like a web link.';
      return isForm
        ? redirect(returnTo + '?error=' + encodeURIComponent(msg))
        : Response.json(
            { error: msg, message: 'Not saved — that is not a web link' },
            { status: 400 }
          );
    }
    console.error('save failed:', err);
    const msg = 'Saving failed. Try again.';
    return isForm
      ? redirect(returnTo + '?error=' + encodeURIComponent(msg))
      : Response.json({ error: msg, message: 'Not saved — Radar error, try again' }, { status: 500 });
  }
};
