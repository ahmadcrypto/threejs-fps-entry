// The match: buy phase, round, plant and defuse, round banners, first to five.
// One object owns the clock, the score and the bomb; main.js owns the shooting.
// All mutable state lives on `state`, read by main.js and the HUD.
import { SITES } from './map.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createMatch() {
  const state = {
    phase: 'menu', // menu | buy | round | roundEnd | matchEnd
    round: 0,
    score: { vanguard: 0, revenant: 0 },
    phaseTime: 0,
    roundTimeLeft: ROUND_SECONDS,
    bomb: {
      state: 'none', // none | carried | dropped | planted
      carrier: null,
      position: null,
      site: null,
      plantedAt: 0,
      channeler: null,
      channelKind: null,
    },
    lastWinner: null,
    lastReason: '',
    matchWinner: null,
  };

  function resetBomb() {
    state.bomb.state = 'none';
    state.bomb.carrier = null;
    state.bomb.position = null;
    state.bomb.site = null;
    state.bomb.plantedAt = 0;
    state.bomb.channeler = null;
    state.bomb.channelKind = null;
  }

  function startBuy() {
    state.round += 1;
    state.phase = 'buy';
    state.phaseTime = 0;
    state.roundTimeLeft = ROUND_SECONDS;
    resetBomb();
  }

  function startRound() {
    state.phase = 'round';
    state.phaseTime = 0;
    state.roundTimeLeft = ROUND_SECONDS;
  }

  function endRound(winner, reason) {
    state.phase = 'roundEnd';
    state.phaseTime = 0;
    state.score[winner] += 1;
    state.lastWinner = winner;
    state.lastReason = reason;
    resetBomb();
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      state.matchWinner = state.score.vanguard > state.score.revenant ? 'vanguard' : 'revenant';
    }
  }

  function aliveCount(agents, team) {
    return agents.filter((a) => a.team === team && a.alive).length;
  }

  // Called every fixed step during 'round': timer, bomb, elimination.
  // Returns { winner, reason } when the round ends, else null.
  function step(dt, agents, now) {
    if (state.phase !== 'round') return null;
    state.phaseTime += dt;
    state.roundTimeLeft = Math.max(0, ROUND_SECONDS - state.phaseTime);
    if (state.bomb.state === 'planted') {
      const left = BOMB_SECONDS - (now - state.bomb.plantedAt);
      if (left <= 0) return { winner: 'vanguard', reason: 'Bomb detonated at Site ' + state.bomb.site };
    }
    if (state.roundTimeLeft <= 0) {
      if (state.bomb.state === 'planted') return null; // the bomb decides it
      return { winner: 'revenant', reason: 'Time expired — site held' };
    }
    const vanguardAlive = aliveCount(agents, 'vanguard');
    const revenantAlive = aliveCount(agents, 'revenant');
    if (vanguardAlive === 0) return { winner: 'revenant', reason: 'Vanguard eliminated' };
    if (revenantAlive === 0) {
      if (state.bomb.state === 'planted') return null; // bomb still ticks
      return { winner: 'vanguard', reason: 'Revenant eliminated' };
    }
    return null;
  }

  function siteById(id) {
    return SITES.find((s) => s.id === id);
  }

  return { state, startBuy, startRound, endRound, step, siteById };
}
