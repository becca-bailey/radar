import { defineMiddleware } from 'astro:middleware';
import { createRequestClient } from './lib/supabase';
import { withOwnQuery } from './lib/redirects';
import { TZ_COOKIE, TZ_SAVED_COOKIE, isValidTimeZone, resolveTimeZone } from './lib/dates';

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createRequestClient(context.request, context.cookies);
  context.locals.supabase = supabase;

  // getUser() validates the JWT against the auth server — never trust
  // getSession() alone on the server.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  context.locals.user = user;

  // The person's time zone: the browser's `tz` cookie (set in Layout.astro),
  // else the one saved on their profile, else UTC. The cookie is untrusted
  // input, so it's validated before any formatter sees it.
  const cookieZone = context.cookies.get(TZ_COOKIE)?.value;
  if (isValidTimeZone(cookieZone)) {
    context.locals.timeZone = cookieZone;
    // Copy it to the profile when it changes, so a new device without the
    // cookie yet still gets the right zone on its first page. The marker
    // names the user too, so a different sign-in on this browser saves again.
    const saved = `${user?.id}:${cookieZone}`;
    if (user && context.cookies.get(TZ_SAVED_COOKIE)?.value !== saved) {
      const { error } = await supabase.from('profiles').update({ time_zone: cookieZone }).eq('id', user.id);
      if (!error) {
        context.cookies.set(TZ_SAVED_COOKIE, saved, {
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
          sameSite: 'lax',
          httpOnly: true,
          secure: context.url.protocol === 'https:',
        });
      }
    }
  } else if (user) {
    const { data } = await supabase.from('profiles').select('time_zone').eq('id', user.id).maybeSingle();
    context.locals.timeZone = resolveTimeZone(data?.time_zone);
  } else {
    context.locals.timeZone = resolveTimeZone();
  }

  const response = await next();

  // Netlify copies the request's query onto a redirect whose Location has
  // none, so give every same-site redirect its own query (RAD-83, see
  // withOwnQuery). The headers are edited in place: a rebuilt Response could
  // lose the auth cookies the callback and logout set.
  const location = response.headers.get('location');
  if (location && response.status >= 300 && response.status < 400) {
    const rewritten = withOwnQuery(location, context.url.origin);
    // Response.redirect() and fetched responses have read-only headers; leave
    // those as they are rather than fail the request.
    try {
      if (rewritten !== location) response.headers.set('location', rewritten);
    } catch {}
  }
  return response;
});
