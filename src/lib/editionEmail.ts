import type { SupabaseClient } from '@supabase/supabase-js';
import type { EditionEntry } from './ranking';

export const LABEL_TEXT: Record<string, string> = {
  hot: 'Hot this week',
  first_time: 'First time here',
  small_source: 'Small source',
  rising: 'Rising',
};

/**
 * One email per edition, nothing else (PLAN.md §10). Skips silently when no
 * RESEND_API_KEY is configured (local dev).
 */
export async function sendEditionEmails(
  service: SupabaseClient,
  groupId: string,
  groupName: string,
  editionId: string,
  entries: EditionEntry[]
): Promise<void> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) return;
  const from = import.meta.env.EDITION_FROM_EMAIL ?? 'editions@example.invalid';
  const siteUrl = import.meta.env.SITE_URL ?? 'http://localhost:4321';

  const { data: members } = await service
    .from('memberships')
    .select('user_id')
    .eq('group_id', groupId);
  if (!members?.length) return;

  const emails: string[] = [];
  for (const m of members) {
    const { data } = await service.auth.admin.getUserById(m.user_id);
    if (data.user?.email) emails.push(data.user.email);
  }
  if (emails.length === 0) return;

  const subject = `${groupName}: this edition's ${entries.length} links`;
  const itemsText = entries
    .map((e) => {
      const why = e.sentences[0] ? `\n   "${e.sentences[0]}"` : '';
      return `${e.position}. [${LABEL_TEXT[e.label]}] ${e.title ?? e.canonicalUrl}\n   ${e.canonicalUrl}${why}`;
    })
    .join('\n\n');
  const text = `${groupName}\n\n${itemsText}\n\nThat's all — when you've seen them, you're done.\n${siteUrl}/groups/${groupId}/editions/${editionId}`;

  const itemsHtml = entries
    .map((e) => {
      const why = e.sentences[0]
        ? `<p style="margin:4px 0 0;font-style:italic">“${escapeHtml(e.sentences[0])}”</p>`
        : '';
      return `<li style="margin-bottom:16px">
        <span style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#8a4f2d">${LABEL_TEXT[e.label]}</span><br>
        <a href="${escapeAttr(e.canonicalUrl)}" style="font-weight:600">${escapeHtml(e.title ?? e.canonicalUrl)}</a>
        ${why}</li>`;
    })
    .join('');
  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
    <h2>${escapeHtml(groupName)}</h2>
    <ol style="padding-left:20px">${itemsHtml}</ol>
    <p style="color:#777">That's all — when you've seen them, you're done.
    <a href="${siteUrl}/groups/${groupId}/editions/${editionId}">View this edition</a></p>
  </div>`;

  // Individual sends so addresses never leak to each other.
  for (const to of emails) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    if (!res.ok) {
      console.warn(`edition email to one member failed: ${res.status} ${await res.text()}`);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
