import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyWithLlm, cosineSimilarity, embedTexts, embeddingsConfigured } from './embeddings';

const SIM_THRESHOLD = Number(import.meta.env.CATEGORY_SIM_THRESHOLD ?? '0.25');

interface CategoryRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  embedding: number[] | null;
}

let cache: { rows: CategoryRow[]; loadedAt: number } | null = null;

async function loadCategories(service: SupabaseClient): Promise<CategoryRow[]> {
  if (cache && Date.now() - cache.loadedAt < 10 * 60_000) return cache.rows;
  const { data, error } = await service
    .from('categories')
    .select('id, slug, name, description, embedding');
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  const rows = (data ?? []).map((r) => ({
    ...r,
    // pgvector comes back as a JSON-ish string through PostgREST.
    embedding: typeof r.embedding === 'string' ? (JSON.parse(r.embedding) as number[]) : r.embedding,
  }));
  cache = { rows, loadedAt: Date.now() };
  return rows;
}

export interface CategorizationResult {
  embedding: number[] | null;
  categoryId: number | null;
}

/**
 * Embed title + lead, assign nearest category above the similarity threshold,
 * else one LLM call (PLAN.md §4). Returns nulls when no provider key is set —
 * the archive works fine without categorization; it just isn't categorized.
 */
export async function embedAndCategorize(
  service: SupabaseClient,
  title: string,
  lead: string
): Promise<CategorizationResult> {
  if (!embeddingsConfigured()) return { embedding: null, categoryId: null };

  const text = `${title}\n\n${lead}`.trim().slice(0, 4000);
  if (!text) return { embedding: null, categoryId: null };

  const [embedding] = await embedTexts([text]);
  const categories = await loadCategories(service);
  const withEmbeddings = categories.filter((c) => c.embedding);

  let best: { row: CategoryRow; sim: number } | null = null;
  for (const row of withEmbeddings) {
    const sim = cosineSimilarity(embedding, row.embedding!);
    if (!best || sim > best.sim) best = { row, sim };
  }

  if (best && best.sim >= SIM_THRESHOLD) {
    return { embedding, categoryId: best.row.id };
  }

  const slug = await classifyWithLlm(title, lead, categories);
  const picked = categories.find((c) => c.slug === slug);
  return { embedding, categoryId: picked?.id ?? best?.row.id ?? null };
}

/** One-off: fill categories.embedding for rows that lack one. */
export async function embedCategoryDescriptions(service: SupabaseClient): Promise<number> {
  const { data, error } = await service
    .from('categories')
    .select('id, name, description')
    .is('embedding', null);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return 0;

  const embeddings = await embedTexts(data.map((c) => `${c.name}. ${c.description}`));
  for (let i = 0; i < data.length; i++) {
    const { error: upErr } = await service
      .from('categories')
      .update({ embedding: embeddings[i] })
      .eq('id', data[i].id);
    if (upErr) throw new Error(upErr.message);
  }
  cache = null;
  return data.length;
}
