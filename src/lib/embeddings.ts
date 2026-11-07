/**
 * Embeddings + categorization fallback, both through OpenAI (one provider,
 * named on the privacy page; API data is not used for training per OpenAI's
 * API terms). Only the title + lead text of a public web page is ever sent —
 * never notes, never who saved it.
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
