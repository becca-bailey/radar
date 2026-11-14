import { defineMiddleware } from 'astro:middleware';
import { createRequestClient } from './lib/supabase';
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
    // cookie yet still gets the right zone on its first page.
    if (user && context.cookies.get(TZ_SAVED_COOKIE)?.value !== cookieZone) {
      const { error } = await supabase.from('profiles').update({ time_zone: cookieZone }).eq('id', user.id);
      if (!error) {
        context.cookies.set(TZ_SAVED_COOKIE, cookieZone, {
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

  return next();
});
