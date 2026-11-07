import type { APIRoute } from 'astro';
import { userIdForBearerToken } from '../../lib/apiTokens';
import { createSave } from '../../lib/saves';
import { createServiceClient } from '../../lib/supabase';

/**
 * POST /api/saves — the one capture endpoint. Three callers:
 * the web form (session cookie), the bookmarklet and the iOS Shortcut
 * (Bearer rh_… token). Form posts get redirects; everything else gets JSON.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const service = createServiceClient();

  const userId =
    locals.user?.id ?? (await userIdForBearerToken(service, request.headers.get('Authorization')));
  if (!userId) {
    return Response.json({ error: 'Sign in or pass a valid API token.' }, { status: 401 });
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  const isForm =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');

  let url = '';
  let note: string | null = null;
  let sentence: string | null = null;
  let wayback = false;

  if (isForm) {
    const form = await request.formData();
    url = String(form.get('url') ?? '');
    note = (form.get('note') as string) || null;
    sentence = (form.get('sentence') as string) || null;
    wayback = form.get('wayback') === 'on';
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Body must be JSON or form data.' }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    url = typeof b.url === 'string' ? b.url : '';
    note = typeof b.note === 'string' ? b.note : null;
    sentence = typeof b.sentence === 'string' ? b.sentence : null;
    wayback = b.wayback === true;
  }

  if (!url.trim()) {
    return isForm
      ? redirect('/?error=' + encodeURIComponent('Paste a link to save.'))
      : Response.json({ error: 'url is required.' }, { status: 400 });
  }

  try {
    const result = await createSave(service, userId, {
      url,
      note,
      sentence,
      waybackRequested: wayback,
    });
    return isForm ? redirect('/?saved=1') : Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof TypeError) {
      const msg = 'That does not look like a web link.';
      return isForm
        ? redirect('/?error=' + encodeURIComponent(msg))
        : Response.json({ error: msg }, { status: 400 });
    }
    console.error('save failed:', err);
    const msg = 'Saving failed. Try again.';
    return isForm
      ? redirect('/?error=' + encodeURIComponent(msg))
      : Response.json({ error: msg }, { status: 500 });
  }
};
