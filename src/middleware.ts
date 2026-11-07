import { defineMiddleware } from 'astro:middleware';
import { createRequestClient } from './lib/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createRequestClient(context.request, context.cookies);
  context.locals.supabase = supabase;

  // getUser() validates the JWT against the auth server — never trust
  // getSession() alone on the server.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  context.locals.user = user;

  return next();
});
