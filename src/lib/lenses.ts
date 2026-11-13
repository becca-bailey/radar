import { embedTexts, embeddingsConfigured } from './embeddings';

export const LENS_NAME_MAX = 60;
export const LENS_QUERY_MAX = 200;

export interface LensInput {
  name: string;
  query: string;
}

/**
 * Validate a lens form. The name is optional and falls back to the query,
 * so "knitting patterns" alone makes a lens called "knitting patterns".
 */
export function parseLensForm(form: FormData): LensInput | { error: string } {
  const query = String(form.get('query') ?? '').replace(/\s+/g, ' ').trim();
  const name = String(form.get('name') ?? '').replace(/\s+/g, ' ').trim() || query;
  if (!query) return { error: 'Give the lens something to search for.' };
  if (query.length > LENS_QUERY_MAX) return { error: `Keep the search under ${LENS_QUERY_MAX} characters.` };
  return { name: name.slice(0, LENS_NAME_MAX), query };
}

/**
 * Embed the query once, at save time, so viewing a lens doesn't call the
 * embedding API. Null means keyword-only matching, which still works.
 */
export async function embedLensQuery(query: string): Promise<number[] | null> {
  if (!embeddingsConfigured()) return null;
  try {
    const [embedding] = await embedTexts([query]);
    return embedding;
  } catch {
    return null;
  }
}

/**
 * Where a lens lives: personal lenses on Explore, group lenses on their
 * group's page. With a lens id, the path opens that lens in full.
 */
export function lensHomePath(groupId: string | null, lensId?: string): string {
  const base = groupId ? `/groups/${groupId}` : '/explore';
  return lensId ? `${base}?lens=${lensId}` : base;
}
