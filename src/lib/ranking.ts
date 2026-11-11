/**
 * Edition composition (PLAN.md §7), as a pure function so the rules are
 * testable and provably match the documented ranking.
 *
 * score(L) = p(L) × (1 + β·w(s(L)))
 *   p(L) = r(L)/m — proportion of active members, so nothing accumulates
 *   w(s) = min(ln((1+A)/(1+a(s))), cap) — rare sources count for more
 *
 * One interpretive decision (documented on the public ranking page): §7 says
 * every surfaced link gets exactly one label. Label priority here is
 * first_time > small_source > rising > hot, with `hot` as the default bucket,
 * so the set always partitions.
 */

export type EditionLabel = 'hot' | 'first_time' | 'small_source' | 'rising';

export interface CandidateRecommender {
  userId: string;
  displayName: string;
  note: string | null;
  attributionOk: boolean;
  createdAt: Date;
}

export interface CandidateLink {
  linkId: string;
  source: string;
  title: string | null;
  canonicalUrl: string;
  recommenders: CandidateRecommender[];
}

export interface RankingContext {
  editionSize: number;
  perSourceCap: 1 | 2;
  /** Members active in the window (floored internally). */
  activeMembers: number;
  windowStart: Date;
  windowEnd: Date;
  /** a(s): system-wide recommendations per source, last 90 days. */
  sourceCounts: Map<string, number>;
  /** A: total system-wide recommendations, last 90 days. */
  totalRecommendations: number;
  /** a(s) at the 25th percentile; at or below ⇒ "small source". */
  smallSourceThreshold: number;
  /** Sources that have appeared in this group's past editions. */
  seenSources: Set<string>;
  /**
   * Promotion damping (PLAN.md §9): accounts whose recent recommendations
   * concentrate in one source count for less. Missing users weigh 1.
   */
  userWeights?: Map<string, number>;
  beta?: number;
  weightCap?: number;
}

export interface EditionEntry {
  linkId: string;
  position: number;
  label: EditionLabel;
  score: number;
  recommenderCount: number;
  proportion: number;
  source: string;
  title: string | null;
  canonicalUrl: string;
  notes: string[];
  recommenderNames: string[];
  attributionNames: string[];
}

const MEMBER_FLOOR = 3; // avoid tiny-group blowups (PLAN.md §7)
const RESERVED_SHARE = 0.2;
const DEFAULT_BETA = 0.3;
const DEFAULT_WEIGHT_CAP = 4;

export function inverseFrequencyWeight(
  a: number,
  A: number,
  cap: number = DEFAULT_WEIGHT_CAP
): number {
  return Math.min(Math.log((1 + A) / (1 + a)), cap);
}

interface Scored extends CandidateLink {
  r: number;
  p: number;
  score: number;
  isNewPool: boolean;
  newPoolLabel: 'first_time' | 'small_source' | null;
  lastThirdShare: number;
}

export function composeEdition(candidates: CandidateLink[], ctx: RankingContext): EditionEntry[] {
  const beta = ctx.beta ?? DEFAULT_BETA;
  const weightCap = ctx.weightCap ?? DEFAULT_WEIGHT_CAP;
  const m = Math.max(ctx.activeMembers, MEMBER_FLOOR);
  const minEvidence = ctx.activeMembers < 6 ? 1 : 2;
  const windowMs = ctx.windowEnd.getTime() - ctx.windowStart.getTime();
  const lastThirdStart = ctx.windowEnd.getTime() - windowMs / 3;

  const scored: Scored[] = [];
  for (const c of candidates) {
    // r(L): distinct members, counted inside the window.
    const inWindow = c.recommenders.filter(
      (rec) => rec.createdAt >= ctx.windowStart && rec.createdAt < ctx.windowEnd
    );
    const distinct = new Map<string, CandidateRecommender>();
    for (const rec of inWindow) if (!distinct.has(rec.userId)) distinct.set(rec.userId, rec);
    const r = distinct.size;
    if (r < minEvidence) continue;

    // Weighted r: down-weighted accounts still count toward evidence (they
    // are real people) but move the score less.
    let weightedR = 0;
    for (const userId of distinct.keys()) {
      weightedR += ctx.userWeights?.get(userId) ?? 1;
    }

    const a = ctx.sourceCounts.get(c.source) ?? 0;
    const p = weightedR / m;
    const score = p * (1 + beta * inverseFrequencyWeight(a, ctx.totalRecommendations, weightCap));

    const firstTime = !ctx.seenSources.has(c.source);
    const smallSource = a <= ctx.smallSourceThreshold;
    const lastThird = inWindow.filter((rec) => rec.createdAt.getTime() >= lastThirdStart).length;

    scored.push({
      ...c,
      recommenders: [...distinct.values()],
      r,
      p,
      score,
      isNewPool: firstTime || smallSource,
      newPoolLabel: firstTime ? 'first_time' : smallSource ? 'small_source' : null,
      lastThirdShare: inWindow.length === 0 ? 0 : lastThird / inWindow.length,
    });
  }

  const byScore = (a: Scored, b: Scored) => b.score - a.score || a.linkId.localeCompare(b.linkId);
  scored.sort(byScore);

  const K = ctx.editionSize;
  const reserved = Math.max(1, Math.round(RESERVED_SHARE * K));
  const picked: Scored[] = [];
  const perSource = new Map<string, number>();

  const canTake = (link: Scored) =>
    !picked.includes(link) && (perSource.get(link.source) ?? 0) < ctx.perSourceCap;
  const take = (link: Scored) => {
    picked.push(link);
    perSource.set(link.source, (perSource.get(link.source) ?? 0) + 1);
  };

  // 1. Reserved slots from the New pool, by score.
  for (const link of scored.filter((s) => s.isNewPool)) {
    if (picked.length >= Math.min(reserved, K)) break;
    if (canTake(link)) take(link);
  }

  // 2. Remaining slots by score across all eligible links.
  for (const link of scored) {
    if (picked.length >= K) break;
    if (canTake(link)) take(link);
  }

  // 3. Labels: exactly one each, priority first_time > small_source > rising > hot.
  const topByP = [...picked].sort((a, b) => b.p - a.p || a.linkId.localeCompare(b.linkId))[0];
  const risingPick = picked
    .filter((l) => l !== topByP && !l.newPoolLabel && l.lastThirdShare >= 0.5)
    .sort((a, b) => b.lastThirdShare - a.lastThirdShare || b.score - a.score)[0];

  return picked
    .sort(byScore)
    .map((link, i) => ({
      linkId: link.linkId,
      position: i + 1,
      label: (link.newPoolLabel ?? (link === risingPick ? 'rising' : 'hot')) as EditionLabel,
      score: link.score,
      recommenderCount: link.r,
      proportion: link.p,
      source: link.source,
      title: link.title,
      canonicalUrl: link.canonicalUrl,
      notes: link.recommenders
        .map((rec) => rec.note)
        .filter((s): s is string => !!s && s.trim() !== ''),
      recommenderNames: link.recommenders.map((rec) => rec.displayName).filter(Boolean),
      attributionNames: link.recommenders
        .filter((rec) => rec.attributionOk)
        .map((rec) => rec.displayName)
        .filter(Boolean),
    }));
}

/** The most recently completed period for a cadence (UTC boundaries). */
export function completedPeriodFor(cadence: 'daily' | 'weekly' | 'biweekly', now: Date) {
  const day = 24 * 60 * 60 * 1000;
  if (cadence === 'daily') {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { start: new Date(end.getTime() - day), end };
  }
  // Weeks start Monday 00:00 UTC.
  const todayMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dowMon0 = (now.getUTCDay() + 6) % 7;
  const thisWeekStart = todayMidnight - dowMon0 * day;
  if (cadence === 'weekly') {
    return { start: new Date(thisWeekStart - 7 * day), end: new Date(thisWeekStart) };
  }
  // Biweekly: anchored to even ISO-ish fortnights since the epoch Monday.
  const epochMonday = Date.UTC(1970, 0, 5);
  const weeksSince = Math.floor((thisWeekStart - epochMonday) / (7 * day));
  const fortnightStart = thisWeekStart - (weeksSince % 2) * 7 * day;
  return { start: new Date(fortnightStart - 14 * day), end: new Date(fortnightStart) };
}
