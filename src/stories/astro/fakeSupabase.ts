/**
 * A stand-in Supabase client for rendering real pages in Storybook with
 * sample data (scripts/storybook/render-astro.ts). It answers the small
 * slice of the query builder the pages use, from in-memory rows, and
 * throws on anything else, naming the call, so a page that starts reading
 * something new fails loudly instead of rendering an empty screen.
 *
 * Filters apply to top-level columns only. Rows can carry joined tables
 * already nested (e.g. a save with its `links`), and `select` returns whole
 * rows: pages pick out the columns they asked for.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

export interface FakeData {
  tables: Record<string, Row[]>;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
}

const fail = (what: string): never => {
  throw new Error(`Storybook's fake Supabase can't answer ${what}. Add sample data in src/stories/astro/screens.ts.`);
};

class Query implements PromiseLike<{ data: unknown; error: null; count: number | null }> {
  private rows: Row[];
  private filters: ((r: Row) => boolean)[] = [];
  private sorts: { col: string; ascending: boolean }[] = [];
  private max: number | null = null;
  private count: boolean = false;
  private head: boolean = false;
  private one: 'single' | 'maybe' | null = null;

  constructor(
    private table: string,
    rows: Row[]
  ) {
    this.rows = rows;
  }

  private column(col: string): string {
    return col.includes('.') ? fail(`a filter on a joined column (${this.table}.${col})`) : col;
  }

  select(_cols?: string, opts: { count?: string; head?: boolean } = {}) {
    this.count = !!opts.count;
    this.head = !!opts.head;
    return this;
  }
  eq(col: string, value: unknown) {
    const c = this.column(col);
    this.filters.push((r) => r[c] === value);
    return this;
  }
  is(col: string, value: unknown) {
    const c = this.column(col);
    this.filters.push((r) => (r[c] ?? null) === value);
    return this;
  }
  in(col: string, values: unknown[]) {
    const c = this.column(col);
    this.filters.push((r) => values.includes(r[c]));
    return this;
  }
  lt(col: string, value: string) {
    const c = this.column(col);
    this.filters.push((r) => String(r[c]) < value);
    return this;
  }
  gt(col: string, value: string) {
    const c = this.column(col);
    this.filters.push((r) => String(r[c]) > value);
    return this;
  }
  /**
   * Only the form savesWithArchivedText uses: "a.not.is.null,b.not.is.null"
   * on a joined table, i.e. the joined row has any of those columns set.
   */
  or(filter: string, opts: { referencedTable?: string } = {}) {
    const table = opts.referencedTable ?? fail(`.or() on ${this.table}`);
    const cols = filter.split(',').map((part) => {
      const m = /^(\w+)\.not\.is\.null$/.exec(part);
      return m ? m[1] : fail(`.or("${filter}") on ${this.table}.${table}`);
    });
    this.filters.push((r) => {
      const joined = r[table] as Row | null | undefined;
      return !!joined && cols.some((c) => joined[c] != null);
    });
    return this;
  }
  order(col: string, { ascending = true }: { ascending?: boolean } = {}) {
    this.sorts.push({ col: this.column(col), ascending });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.one = 'single';
    return this;
  }
  maybeSingle() {
    this.one = 'maybe';
    return this;
  }

  private result() {
    let rows = this.rows.filter((r) => this.filters.every((f) => f(r)));
    rows = [...rows].sort((a, b) => {
      for (const { col, ascending } of this.sorts) {
        const x = a[col] ?? '';
        const y = b[col] ?? '';
        // Numbers compare as numbers; ISO dates and text compare as strings.
        const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        if (order !== 0) return order * (ascending ? 1 : -1);
      }
      return 0;
    });
    const count = this.count ? rows.length : null;
    if (this.max !== null) rows = rows.slice(0, this.max);
    if (this.head) return { data: null, error: null, count };
    if (this.one === 'single' && rows.length !== 1) fail(`.single() on ${this.table} matching ${rows.length} rows`);
    const data = this.one ? (rows[0] ?? null) : rows;
    return { data, error: null, count };
  }

  then<A = { data: unknown; error: null; count: number | null }, B = never>(
    onFulfilled?: ((v: { data: unknown; error: null; count: number | null }) => A | PromiseLike<A>) | null,
    onRejected?: ((e: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return new Promise<{ data: unknown; error: null; count: number | null }>((resolve) => resolve(this.result())).then(
      onFulfilled,
      onRejected
    );
  }
}

export function fakeSupabase(data: FakeData): SupabaseClient {
  const client = {
    from(table: string) {
      const rows = data.tables[table] ?? fail(`a query on the "${table}" table`);
      return new Query(table, rows);
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      const handler = data.rpc?.[fn] ?? fail(`rpc("${fn}")`);
      return Promise.resolve({ data: handler(args), error: null });
    },
  };
  // Anything else on the client (auth, storage, insert via from()…) is a
  // TypeError at the call site, which names the missing method.
  return client as unknown as SupabaseClient;
}
