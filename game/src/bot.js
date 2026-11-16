// Bot AI: waypoints, line of sight, reaction time, bursts, plant and defuse.
// A bot thinks in states — push, hold, engage, plant, defuse, retreat — and
// re-plans every 0.2 s, so it reacts to what it sees and hears instead of
// running a script. Accuracy and reaction time vary per bot and per round.
import * as THREE from 'three';
import { range } from './rng.js';
import { WEAPONS, GRENADE } from './weapons.js';

const REACTION_MIN = 0.35;
const REACTION_MAX = 0.75;
const BURST_MIN = 3;
const BURST_MAX = 6;
const BURST_PAUSE = 0.55;
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;

export function createBot(agent, random, options) {
  const bot = {
    agent,
    role: options.role, // 'attack' | 'defend'
    site: options.site, // 'A' | 'B'
    skill: range(random, 0.55, 1),
    reaction: range(random, REACTION_MIN, REACTION_MAX),
    state: 'push',
    path: [],
    pathIndex: 0,
    holdPoint: null,
    holdUntil: 0,
    target: null,
    acquireAt: 0,
    burstLeft: 0,
    burstPauseUntil: 0,
    channel: null, // { kind: 'plant'|'defuse', until, site }
    stuckAt: 0,
    lastPos: new THREE.Vector3(),
    lastProgressAt: 0,
    thinkAt: 0,
    strafeDir: 1,
    strafeUntil: 0,
  };

  function siteCenter(map, siteId) {
    const site = map.sites.find((s) => s.id === siteId);
    return site ? site.center : new THREE.Vector3(0, 0, 0);
  }

  function setPath(map, to) {
    const from = map.nearestWaypoint(agent.mover.body.position);
    bot.path = map.findPath(from, to);
    bot.pathIndex = 0;
  }

  function faceToward(target, dt, turnRate = 4.5) {
    const body = agent.mover.body;
    const dx = target.x - body.position.x;
    const dz = target.z - body.position.z;
    const want = Math.atan2(-dx, -dz);
    let diff = want - body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
    body.yaw += turn;
    return Math.abs(diff) < 0.12;
  }

  function moveAlongPath(dt, map) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = bot.path[bot.pathIndex];
    const body = agent.mover.body;
    const dx = node.x - body.position.x;
    const dz = node.z - body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const facing = faceToward(node, dt);
    agent.mover.step(dt, facing ? 1 : 0.25, 0, false, false);
    // Stuck detection: no progress in 1.5 s means the direct line is blocked.
    if (body.position.distanceToSquared(bot.lastPos) > 0.04) {
      bot.lastPos.copy(body.position);
      bot.lastProgressAt = 0;
    } else {
      bot.lastProgressAt += dt;
      if (bot.lastProgressAt > 1.5) {
        bot.lastProgressAt = 0;
        bot.pathIndex += 1;
      }
    }
    return false;
  }

  function nearestVisibleEnemy(ctx) {
    const eye = agent.eyePosition(new THREE.Vector3());
    let best = null;
    let bestScore = Infinity;
    for (const enemy of ctx.enemies) {
      if (!enemy.alive) continue;
      const chest = new THREE.Vector3(enemy.mover.body.position.x, enemy.mover.body.position.y + 1.2, enemy.mover.body.position.z);
      const dist = eye.distanceTo(chest);
      if (dist > 55) continue;
      if (!ctx.map.lineOfSight(eye, chest)) continue;
      const score = dist + (enemy.isPlayer ? -3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  function buy(ctx) {
    const money = agent.money;
    let def = WEAPONS.rifle;
    if (bot.role === 'defend' && bot.site === 'B' && money >= WEAPONS.sniper.price) def = WEAPONS.sniper;
    else if (money < WEAPONS.rifle.price && money >= WEAPONS.smg.price) def = WEAPONS.smg;
    else if (money < WEAPONS.smg.price) def = WEAPONS.pistol;
    if (agent.money >= def.price) {
      agent.money -= def.price;
      agent.weapon.equip(def);
    }
    if (agent.money >= GRENADE.price && ctx.random() < 0.5) {
      agent.money -= GRENADE.price;
      agent.weapon.state.grenades = (agent.weapon.state.grenades || 0) + 1;
    }
  }

  function startChannel(kind, site, until) {
    bot.channel = { kind, site, until };
  }

  function update(dt, ctx) {
    if (!agent.alive) {
      bot.channel = null;
      bot.target = null;
      return;
    }
    const now = ctx.now;
    const body = agent.mover.body;

    // Perception, staggered at ~5 Hz.
    if (now >= bot.thinkAt) {
      bot.thinkAt = now + 0.2;
      const seen = nearestVisibleEnemy(ctx);
      if (seen && bot.target !== seen) {
        bot.target = seen;
        bot.acquireAt = now + bot.reaction * (1.6 - bot.skill);
        bot.burstLeft = 0;
      } else if (!seen) {
        bot.target = null;
      }
      // Low health: fall back to the nearest waypoint behind us.
      if (agent.health < 30 && bot.target && bot.state !== 'retreat') {
        bot.state = 'retreat';
        bot.holdUntil = now + 2.5;
        const away = mapNearestAway(ctx);
        if (away) setPath(ctx.map, away);
      }
    }

    // Channeling (plant / defuse) is interrupted by taking damage or by a
    // visible enemy at close range.
    if (bot.channel) {
      const close = bot.target && body.position.distanceTo(bot.target.mover.body.position) < 10;
      if (close || agent.health < bot.channel.hpAtStart) {
        bot.channel = null;
      } else if (now >= bot.channel.until) {
        const done = bot.channel;
        bot.channel = null;
        ctx.onChannelDone(agent, done.kind, done.site);
      } else {
        faceToward(bot.channel.at, dt, 2);
        return;
      }
    }

    // Engaging: face the target, strafe, fire in bursts.
    if (bot.target && now >= bot.acquireAt) {
      const target = bot.target;
      const targetEye = target.eyePosition(new THREE.Vector3());
      const dist = body.position.distanceTo(target.mover.body.position);
      faceToward(targetEye, dt, 6);
      if (now >= bot.strafeUntil) {
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        bot.strafeUntil = now + range(ctx.random, 0.5, 1.1);
      }
      const moving = target.mover.groundSpeed() > 1;
      const spread = (0.006 + dist * 0.00045 + (moving ? 0.012 : 0)) * (1.5 - bot.skill * 0.7);
      if (bot.burstLeft <= 0) {
        if (now >= bot.burstPauseUntil) {
          bot.burstLeft = BURST_MIN + Math.floor(ctx.random() * (BURST_MAX - BURST_MIN));
          bot.burstPauseUntil = 0;
        }
      } else if (agent.weapon.ready()) {
        if (agent.weapon.takeRound()) {
          agent.weapon.pullTrigger();
          ctx.shoot(agent, spread, targetEye);
          bot.burstLeft -= 1;
          if (bot.burstLeft <= 0) bot.burstPauseUntil = now + BURST_PAUSE * (1.4 - bot.skill * 0.5);
        }
      }
      if (agent.weapon.state.mag === 0) agent.weapon.reload();
      agent.mover.step(dt, 0, bot.strafeDir, false, false);
      agent.weapon.step(dt);
      return;
    }

    // Not engaging: follow the objective.
    agent.weapon.step(dt);
    if (agent.weapon.state.mag === 0) agent.weapon.reload();

    const bomb = ctx.bomb;
    if (bot.role === 'attack') {
      if (bomb.state === 'planted') {
        // Defend the planted bomb: hold near its site.
        if (bot.state !== 'hold' || !bot.holdPoint) {
          bot.state = 'hold';
          const site = siteCenter(ctx.map, bomb.site);
          bot.holdPoint = new THREE.Vector3(site.x + range(ctx.random, -4, 4), 0, site.z + range(ctx.random, -3, 3));
          setPath(ctx.map, ctx.map.nearestWaypoint(bot.holdPoint));
        }
        if (moveAlongPath(dt, ctx.map)) {
          faceToward(new THREE.Vector3(bot.holdPoint.x, 0, bot.holdPoint.z - 6), dt, 2);
        }
        return;
      }
      if (bomb.state === 'dropped') {
        if (bot.state !== 'toBomb') {
          bot.state = 'toBomb';
          setPath(ctx.map, ctx.map.nearestWaypoint(bomb.position));
        }
        if (moveAlongPath(dt, ctx.map)) {
          if (body.position.distanceTo(bomb.position) < 1.6) ctx.onPickupBomb(agent);
          else setPath(ctx.map, ctx.map.nearestWaypoint(bomb.position));
        }
        return;
      }
      // Carrying the bomb: push the assigned site and plant when it is clear.
      if (agent.hasBomb) {
        const site = siteCenter(ctx.map, bot.site);
        const distToSite = Math.hypot(body.position.x - site.x, body.position.z - site.z);
        const siteObj = ctx.map.sites.find((s) => s.id === bot.site);
        if (distToSite < siteObj.radius) {
          if (!bot.target) {
            startChannel('plant', bot.site, now + PLANT_TIME);
            bot.channel.at = site;
            bot.channel.hpAtStart = agent.health;
            ctx.onChannelStart(agent, 'plant', bot.site);
            return;
          }
        } else {
          if (bot.state !== 'push') {
            bot.state = 'push';
            setPath(ctx.map, bot.site === 'A' ? 'siteA' : 'siteB');
          }
          moveAlongPath(dt, ctx.map);
          return;
        }
      } else {
        // Not carrying: follow the carrier, or push the site anyway.
        if (bomb.carrier && bomb.carrier.alive) {
          const c = bomb.carrier.mover.body.position;
          const d = body.position.distanceTo(c);
          if (d > 6) {
            faceToward(c, dt);
            agent.mover.step(dt, 1, 0, false, false);
            return;
          }
        }
        if (bot.state !== 'push') {
          bot.state = 'push';
          setPath(ctx.map, bot.site === 'A' ? 'siteA' : 'siteB');
        }
        moveAlongPath(dt, ctx.map);
        return;
      }
    } else {
      // Defend: hold near the assigned site, rotate to the planted bomb.
      if (bomb.state === 'planted') {
        const site = siteCenter(ctx.map, bomb.site);
        const dist = Math.hypot(body.position.x - site.x, body.position.z - site.z);
        if (dist < 2.5) {
          if (!bot.target) {
            startChannel('defuse', bomb.site, now + DEFUSE_TIME);
            bot.channel.at = bomb.position;
            bot.channel.hpAtStart = agent.health;
            ctx.onChannelStart(agent, 'defuse', bomb.site);
            return;
          }
        } else {
          if (bot.state !== 'toBomb') {
            bot.state = 'toBomb';
            setPath(ctx.map, ctx.map.nearestWaypoint(bomb.position));
          }
          moveAlongPath(dt, ctx.map);
          return;
        }
      }
      if (bot.state !== 'hold' || !bot.holdPoint) {
        bot.state = 'hold';
        const site = siteCenter(ctx.map, bot.site);
        const angle = range(ctx.random, 0, Math.PI * 2);
        bot.holdPoint = new THREE.Vector3(
          site.x + Math.cos(angle) * range(ctx.random, 3, 5.5),
          0,
          site.z + Math.sin(angle) * range(ctx.random, 3, 5.5),
        );
        setPath(ctx.map, ctx.map.nearestWaypoint(bot.holdPoint));
      }
      if (moveAlongPath(dt, ctx.map)) {
        // Scan the approaches: slow yaw sweep.
        body.yaw += dt * 0.35 * Math.sin(now * 0.5 + bot.skill * 5);
      }
    }
  }

  function mapNearestAway(ctx) {
    const body = agent.mover.body;
    const target = bot.target;
    if (!target) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const [name, point] of Object.entries(ctx.map.nodes)) {
      const away = point.distanceTo(target.mover.body.position);
      const near = point.distanceTo(body.position);
      const score = away - near * 0.6;
      if (score > bestScore) {
        bestScore = score;
        best = name;
      }
    }
    return best;
  }

  function reset(roundRandom) {
    bot.state = 'push';
    bot.path = [];
    bot.pathIndex = 0;
    bot.holdPoint = null;
    bot.target = null;
    bot.channel = null;
    bot.burstLeft = 0;
    bot.burstPauseUntil = 0;
    bot.thinkAt = 0;
    bot.skill = range(roundRandom, 0.55, 1);
    bot.reaction = range(roundRandom, REACTION_MIN, REACTION_MAX);
  }

  return {
    agent,
    update,
    buy,
    reset,
    get target() { return bot.target; },
    get state() { return bot.state; },
  };
}
