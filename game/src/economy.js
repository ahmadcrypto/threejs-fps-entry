// The economy: money earned per round and per kill, spent in the buy menu.
// Pistol is free; everything else costs, and a lost round still pays enough to
// keep the game moving.
import { WEAPONS, GRENADE } from './weapons.js';

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const PLANT_REWARD = 300;

export function createEconomy() {
  return {
    startMoney: START_MONEY,
    killReward: KILL_REWARD,
    winReward: WIN_REWARD,
    lossReward: LOSS_REWARD,
    plantReward: PLANT_REWARD,
    buyWeapon(agent, weaponId) {
      const def = WEAPONS[weaponId];
      if (!def) return { ok: false, reason: 'no such weapon' };
      if (agent.money < def.price) return { ok: false, reason: 'not enough money' };
      agent.money -= def.price;
      return { ok: true, def };
    },
    buyGrenade(agent) {
      if (agent.money < GRENADE.price) return { ok: false, reason: 'not enough money' };
      agent.money -= GRENADE.price;
      return { ok: true };
    },
    canAfford(agent, price) {
      return agent.money >= price;
    },
  };
}
