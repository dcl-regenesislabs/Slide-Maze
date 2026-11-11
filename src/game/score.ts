// Points for a finished level, for the leaderboard. Pure: no SDK imports, so the server (which decides the score) and the
// client (which shows it) use the same numbers.
//
// A level is worth more the more pushes it needs at best (its par, from the solver), so harder levels count for more:
//   max = BASE + PER_PUSH * par
// Of that, MOVES_SHARE goes to moves and the rest to time:
//   moves part = par / moves              (1 at the optimal number of pushes, halves at twice as many)
//   time part  = parTime / time, at most 1, where parTime = TIME_GRACE + TIME_PER_PUSH * par
// so a perfect run (fewest pushes, within par time) scores the full max, and any finish scores at least MIN_SHARE of it.

import { LEVELS } from './levels'
import { solve } from './solver'

export const SCORE = {
  BASE: 500,
  PER_PUSH: 100,
  MOVES_SHARE: 0.7,
  TIME_GRACE_MS: 10_000, // walking in, looking around
  TIME_PER_PUSH_MS: 6_000, // walking round to the right face and pushing
  MIN_SHARE: 0.1
}

export const maxScore = (par: number) => SCORE.BASE + SCORE.PER_PUSH * par
export const parTimeMs = (par: number) => SCORE.TIME_GRACE_MS + SCORE.TIME_PER_PUSH_MS * par

/** Points for finishing a level whose par is `par` pushes in `moves` pushes and `timeMs` ms. */
export function levelScore(par: number, moves: number, timeMs: number): number {
  const max = maxScore(par)
  const m = Math.min(1, par / Math.max(1, moves))
  const t = Math.min(1, parTimeMs(par) / Math.max(1, timeMs))
  const share = Math.max(SCORE.MIN_SHARE, SCORE.MOVES_SHARE * m + (1 - SCORE.MOVES_SHARE) * t)
  return Math.round(max * share)
}

const pars: number[] = []
/** Fewest pushes that solve official level `i` (from the solver, computed once per level, tens of ms). */
export const levelPar = (i: number) => (pars[i] ??= solve(LEVELS[i]).pushes)

/** Stars for a level's best score: 0 = not finished, then 1 / 2 / 3 at STAR_SHARES of its max. */
export const STAR_SHARES = [0.7, 0.9] // 2 stars from 70 % of the max, 3 from 90 %
export function starsFor(i: number, score: number): number {
  if (score <= 0) return 0
  const share = score / maxScore(levelPar(i))
  return share >= STAR_SHARES[1] ? 3 : share >= STAR_SHARES[0] ? 2 : 1
}
