/**
 * Embeddings + categorization fallback, both through OpenAI (one provider,
 * named on the privacy page; API data is not used for training per OpenAI's
 * API terms). Only the title + lead text of a public web page is ever sent —
 * never notes, never who saved it. Naming a group's suggested topics sends
 * titles of links shared to that group, under the same rule.
 */

const API_BASE = 'https://api.openai.com/v1';
export const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dims, matches schema
const CLASSIFY_MODEL = import.meta.env.OPENAI_CLASSIFY_MODEL ?? 'gpt-4o-mini';

function apiKey(): string | null {
  return import.meta.env.OPENAI_API_KEY || null;
}

export function embeddingsConfigured(): boolean {
  return apiKey() !== null;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = apiKey();
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const res = await fetch(`${API_BASE}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: Array<{ index: number; embedding: number[] }> };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export interface CategoryChoice {
  slug: string;
  name: string;
  description: string;
}

/** One LLM call when embedding similarity is below threshold (PLAN.md §4). */
export async function classifyWithLlm(
  title: string,
  lead: string,
  categories: CategoryChoice[]
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;
  const list = categories.map((c) => `- ${c.slug}: ${c.description}`).join('\n');
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: CLASSIFY_MODEL,
      max_tokens: 20,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You assign one category to a web page. Reply with exactly one slug from the list, nothing else.',
        },
        {
          role: 'user',
          content: `Categories:\n${list}\n\nPage title: ${title}\nLead: ${lead.slice(0, 500)}\n\nSlug:`,
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const answer = json.choices?.[0]?.message?.content?.trim().toLowerCase() ?? '';
  return categories.some((c) => c.slug === answer) ? answer : null;
}

export interface TopicName {
  id: number;
  name: string;
  query: string;
}

/**
 * Name clusters of a group's shared links: a short topic name and a search
 * phrase that picks the cluster out of the rest of the pool. Sends titles
 * only (no notes, nothing about who shared). Null on any failure.
 */
export async function nameTopics(
  clusters: { id: number; titles: string[] }[],
  poolSample: string[],
  avoidWords: string[]
): Promise<TopicName[] | null> {
  const key = apiKey();
  if (!key || clusters.length === 0) return null;
  try {
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: CLASSIFY_MODEL,
        temperature: 0,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You name topics in a reading list a group shares. pool_sample shows what the whole list is about. ' +
              'For each cluster of titles, give a topic name (1 to 4 words, sentence case) and a search phrase ' +
              '(1 to 3 words) that would find this cluster and not the rest of the list. Never use the words in ' +
              'avoid_words, or any other words the whole list shares: a search for the overall theme matches ' +
              'everything. If a cluster has no clear common thread, set name and query to null. ' +
              'Reply as JSON: {"topics":[{"id":0,"name":"...","query":"..."}]}',
          },
          {
            role: 'user',
            content: JSON.stringify({ avoid_words: avoidWords, pool_sample: poolSample, clusters }),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}') as { topics?: unknown };
    if (!Array.isArray(parsed.topics)) return null;
    const ids = new Set(clusters.map((c) => c.id));
    return parsed.topics.flatMap((t) => {
      const { id, name, query } = (t ?? {}) as Record<string, unknown>;
      if (typeof id !== 'number' || !ids.has(id) || typeof name !== 'string' || typeof query !== 'string') return [];
      const cleanName = name.replace(/\s+/g, ' ').trim().slice(0, 60);
      const cleanQuery = query.replace(/\s+/g, ' ').trim().slice(0, 80);
      return cleanName && cleanQuery ? [{ id, name: cleanName, query: cleanQuery }] : [];
    });
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
