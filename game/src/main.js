// EMBERLINE — boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. main.js owns the shooting, the grenades, the tracers,
// the bomb and the round flow; every other module owns one job of its own.
// ?shot=start|buy|combat|plant|end with &seed=N sets up a deterministic frame
// for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, range, pick } from './rng.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponState, WEAPONS, GRENADE, BUY_ORDER } from './weapons.js';
import { createAgent } from './agents.js';
import { createBot } from './bot.js';
import { createEconomy, START_MONEY, KILL_REWARD, WIN_REWARD, LOSS_REWARD, PLANT_REWARD } from './economy.js';
import { createMatch, BUY_SECONDS, ROUND_SECONDS, BOMB_SECONDS } from './match.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const VANGUARD_NAMES = ['Rook', 'Fable', 'Iris', 'Dune'];
const REVENANT_NAMES = ['Vex', 'Moss', 'Harrow', 'Pike', 'Sable'];
const PLAYER_NAME = 'muhamadahmad13';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#241a12');
scene.fog = new THREE.Fog(new THREE.Color('#241a12'), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const audio = createAudio();
const economy = createEconomy();
const match = createMatch();
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const player = createPlayer(map.colliders, { x: 0, z: 11.5 }, 0);
const weapon = createWeaponState(camera);

const playerAgent = createAgent(scene, {
  team: 'vanguard', name: PLAYER_NAME, isPlayer: true,
  spawn: { x: 0, z: 11.5 }, yaw: 0, colliders: map.colliders,
});
playerAgent.weapon = weapon;
playerAgent.mover = player.mover;

const agents = [playerAgent];
const bots = [];
VANGUARD_NAMES.forEach((name, i) => {
  const agent = createAgent(scene, {
    team: 'vanguard', name, spawn: map.nodes.vspawn, yaw: 0, colliders: map.colliders,
  });
  agent.spawnSlot = i;
  agents.push(agent);
  bots.push(createBot(agent, random, { role: 'attack', site: i < 2 ? 'A' : 'B' }));
});
REVENANT_NAMES.forEach((name, i) => {
  const agent = createAgent(scene, {
    team: 'revenant', name, spawn: map.nodes.rspawn, yaw: Math.PI, colliders: map.colliders,
  });
  agent.spawnSlot = i;
  agents.push(agent);
  bots.push(createBot(agent, random, { role: 'defend', site: i < 2 ? 'A' : i < 4 ? 'B' : 'A' }));
});

const raycaster = new THREE.Raycaster();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const direction = new THREE.Vector3();
let shootables = map.shootables.slice();
for (const agent of agents) shootables = shootables.concat(agent.hitMeshes);

let now = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let plantProgress = 0;
let lastBeepAt = 0;
let grenadeId = 0;
let buyDone = false;
const grenades = [];
const tracers = [];
let bombMesh = null;
let bombLight = null;

function initTracers() {
  for (let i = 0; i < 24; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0 });
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
}
initTracers();

function spawnTracer(from, to, color) {
  const tracer = tracers.find((t) => t.life <= 0) || tracers[0];
  const positions = tracer.line.geometry.attributes.position.array;
  positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
  positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
  tracer.line.geometry.attributes.position.needsUpdate = true;
  tracer.line.material.color.setHex(color);
  tracer.line.material.opacity = 0.9;
  tracer.line.visible = true;
  tracer.life = 0.07;
}

function stepTracers(dt) {
  for (const tracer of tracers) {
    if (tracer.life <= 0) continue;
    tracer.life -= dt;
    tracer.line.material.opacity = Math.max(0, tracer.life / 0.07) * 0.9;
    if (tracer.life <= 0) tracer.line.visible = false;
  }
}

function muzzleOf(agent, out) {
  agent.eyePosition(out);
  const dir = agent.aimDirection(tmpC);
  out.addScaledVector(dir, 0.55);
  out.y -= 0.12;
  return out;
}

// One hitscan shot: spread, raycast against the map and every body, damage,
// tracer, sounds and the kill feed. Returns the hit, if any.
function shootFrom(shooter, origin, dir, spread, def) {
  direction.copy(dir);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  raycaster.set(origin, direction);
  raycaster.far = def.range;
  const hits = raycaster.intersectObjects(shootables, false);
  const hit = hits[0] || null;
  const end = hit ? hit.point.clone() : origin.clone().addScaledVector(direction, def.range);
  spawnTracer(muzzleOf(shooter, tmpA.clone()), end, def.tracer);
  if (!hit || !hit.object.userData.agent) return { hit: null };
  const victim = hit.object.userData.agent;
  if (victim === shooter || !victim.alive) return { hit: null };
  const part = hit.object.userData.part;
  const damage = part === 'head' ? def.headDamage : def.damage;
  const killed = victim.damage(damage);
  if (victim.isPlayer) {
    hud.damageFlash();
    audio.hurt();
  } else if (shooter.isPlayer) {
    hud.hitMarker(killed, shot ? 4000 : 120);
    if (killed) audio.kill();
    else audio.hit();
  }
  if (killed) {
    shooter.kills += 1;
    shooter.money += KILL_REWARD;
    hud.killfeed(shooter.name, victim.name, part === 'head', shooter.team);
    if (victim.hasBomb) dropBomb(victim);
  }
  return { hit, victim, part, killed, damage };
}

function dropBomb(carrier) {
  const bomb = match.state.bomb;
  bomb.state = 'dropped';
  bomb.carrier = null;
  bomb.position = carrier.mover.body.position.clone();
  bomb.position.y = 0.15;
  showBombMesh(bomb.position);
  hud.showHint('Bomb dropped — press E near it to pick it up');
}

function showBombMesh(position) {
  if (!bombMesh) {
    bombMesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.2, 0.24),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 }),
    );
    bombLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.08),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.revenant) }),
    );
    bombLight.position.set(0, 0.14, 0);
    bombMesh.add(body, bombLight);
    scene.add(bombMesh);
  }
  bombMesh.visible = true;
  bombMesh.position.copy(position);
}

function hideBombMesh() {
  if (bombMesh) bombMesh.visible = false;
}

function plantBomb(planter, siteId) {
  const bomb = match.state.bomb;
  bomb.state = 'planted';
  bomb.carrier = null;
  bomb.site = siteId;
  bomb.plantedAt = now;
  bomb.position = match.siteById(siteId).center.clone();
  bomb.position.y = 0.15;
  planter.money += PLANT_REWARD;
  showBombMesh(bomb.position);
  hud.banner('BOMB PLANTED', `Site ${siteId} — ${BOMB_SECONDS} seconds to detonation`, 'vanguard');
  hud.showHint('');
  audio.plantBeep();
}

function throwGrenade(owner, aimDir) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.4, metalness: 0.6 }),
  );
  const origin = owner.eyePosition(new THREE.Vector3());
  mesh.position.copy(origin).addScaledVector(aimDir, 0.5);
  scene.add(mesh);
  const velocity = aimDir.clone().multiplyScalar(GRENADE.throwSpeed);
  velocity.y += 3.2;
  grenades.push({ id: grenadeId += 1, mesh, velocity, fuse: GRENADE.fuse, owner });
  audio.grenadeThrow();
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  audio.explosion();
  const flash = new THREE.PointLight(new THREE.Color('#ffb45e'), 60, 14);
  flash.position.copy(g.mesh.position);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 180);
  for (const agent of agents) {
    if (!agent.alive) continue;
    const dist = agent.mover.body.position.distanceTo(g.mesh.position);
    if (dist > GRENADE.radius) continue;
    const damage = Math.max(15, Math.round(GRENADE.damage * (1 - dist / GRENADE.radius)));
    const killed = agent.damage(damage);
    if (agent.isPlayer) {
      hud.damageFlash();
      audio.hurt();
    }
    if (killed && g.owner !== agent) {
      g.owner.kills += 1;
      g.owner.money += KILL_REWARD;
      hud.killfeed(g.owner.name, agent.name, false, g.owner.team);
      if (agent.hasBomb) dropBomb(agent);
    }
  }
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.velocity.y -= 18 * dt;
    g.mesh.position.addScaledVector(g.velocity, dt);
    const p = g.mesh.position;
    if (p.y < 0.09) {
      p.y = 0.09;
      g.velocity.y *= -0.35;
      g.velocity.x *= 0.7;
      g.velocity.z *= 0.7;
    }
    for (const box of map.colliders) {
      if (box.containsPoint(p)) {
        if (Math.abs(g.velocity.x) > Math.abs(g.velocity.z)) g.velocity.x *= -0.4;
        else g.velocity.z *= -0.4;
        p.x += g.velocity.x * dt * 2;
        p.z += g.velocity.z * dt * 2;
        break;
      }
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function resetRound() {
  const vanguardSpawns = [{ x: 0, z: 11.5 }, { x: -6, z: 13.5 }, { x: -2, z: 13.5 }, { x: 2, z: 13.5 }, { x: 6, z: 13.5 }];
  const revenantSpawns = [{ x: -6, z: -13.5 }, { x: -2, z: -13.5 }, { x: 2, z: -13.5 }, { x: 6, z: -13.5 }, { x: 0, z: -11.5 }];
  playerAgent.reset(vanguardSpawns[0], 0);
  player.teleport(vanguardSpawns[0].x, vanguardSpawns[0].z, 0);
  playerAgent.weapon.refill();
  VANGUARD_NAMES.forEach((name, i) => {
    const agent = agents.find((a) => a.name === name);
    agent.reset(vanguardSpawns[i + 1], 0);
    agent.weapon.refill();
  });
  REVENANT_NAMES.forEach((name, i) => {
    const agent = agents.find((a) => a.name === name);
    agent.reset(revenantSpawns[i], Math.PI);
    agent.weapon.refill();
  });
  for (const bot of bots) bot.reset(random);
  buyDone = false;
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  for (const tracer of tracers) {
    tracer.life = 0;
    tracer.line.visible = false;
  }
  hideBombMesh();
  plantProgress = 0;
  // A random Vanguard bot carries the bomb this round.
  const carrier = pick(random, bots.filter((b) => b.agent.team === 'vanguard'));
  carrier.agent.hasBomb = true;
  match.state.bomb.state = 'carried';
  match.state.bomb.carrier = carrier.agent;
  hud.hideBanner();
  hud.setChannel(null);
  hud.hideHint();
  hud.setBombTimer(null);
}

function startMatch() {
  match.state.score.vanguard = 0;
  match.state.score.revenant = 0;
  match.state.round = 0;
  match.state.matchWinner = null;
  hud.hideOverlay();
  for (const agent of agents) {
    agent.money = START_MONEY;
    agent.kills = 0;
    agent.deaths = 0;
    agent.weapon.equip(WEAPONS.pistol);
    agent.weapon.state.grenades = 0;
  }
  weapon.equip(WEAPONS.pistol);
  weapon.state.grenades = 0;
  match.startBuy();
  resetRound();
  hud.showBuyMenu(playerAgent.money, weapon.state.def.id, weapon.state.grenades);
  hud.setScore(0, 0, 1);
}

function deployFromBuy() {
  hud.hideBuyMenu();
  match.startRound();
  if (!shot) input.requestLock();
}

function onRoundEnd(result) {
  const winner = result.winner;
  const loser = winner === 'vanguard' ? 'revenant' : 'vanguard';
  for (const agent of agents) {
    agent.money += agent.team === winner ? WIN_REWARD : LOSS_REWARD;
  }
  match.endRound(winner, result.reason);
  const playerWon = winner === 'vanguard';
  hud.banner(
    playerWon ? 'VANGUARD WINS THE ROUND' : 'REVENANT WINS THE ROUND',
    result.reason + `  ·  ${match.state.score.vanguard} — ${match.state.score.revenant}`,
    winner,
  );
  hud.setScore(match.state.score.vanguard, match.state.score.revenant, match.state.round);
  if (playerWon) audio.roundWin();
  else audio.roundLose();
  if (match.state.phase === 'matchEnd') {
    setTimeout(() => {
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showOverlay('matchEnd', `${match.state.matchWinner === 'vanguard' ? 'Vanguard' : 'Revenant'} takes the match, ${match.state.score.vanguard} — ${match.state.score.revenant}.`);
    }, 3200);
  }
}

function playerShoot() {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return;
  }
  camera.getWorldDirection(tmpB);
  playerAgent.eyePosition(tmpA);
  shootFrom(playerAgent, tmpA, tmpB, weapon.spread(player.groundSpeed()), weapon.state.def);
  weapon.pullTrigger();
  player.recoil(weapon.state.def.recoil + random() * 0.003, (random() * 2 - 1) * 0.003);
  audio.shot(weapon.state.def.kind);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name, weapon.state.grenades);
}

function buyWeapon(id) {
  const result = economy.buyWeapon(playerAgent, id);
  if (!result.ok) {
    audio.denied();
    return;
  }
  weapon.equip(result.def);
  audio.buy();
  hud.refreshBuyMenu(playerAgent.money, weapon.state.def.id, weapon.state.grenades);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name, weapon.state.grenades);
  hud.setMoney(playerAgent.money);
}

function buyGrenade() {
  const result = economy.buyGrenade(playerAgent);
  if (!result.ok) {
    audio.denied();
    return;
  }
  weapon.state.grenades += 1;
  audio.buy();
  hud.refreshBuyMenu(playerAgent.money, weapon.state.def.id, weapon.state.grenades);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name, weapon.state.grenades);
  hud.setMoney(playerAgent.money);
}

const botContext = {
  now: 0,
  random,
  map,
  enemies: [],
  bomb: match.state.bomb,
  shoot(shooter, spread, targetEye) {
    const origin = shooter.eyePosition(new THREE.Vector3());
    const dir = targetEye.clone().sub(origin).normalize();
    shootFrom(shooter, origin, dir, spread, shooter.weapon.state.def);
    if (shooter.mover.body.position.distanceTo(playerAgent.mover.body.position) < 42) {
      audio.shot('enemy');
    }
  },
  onChannelStart(agent, kind, site) {
    match.state.bomb.channeler = agent;
    match.state.bomb.channelKind = kind;
    hud.showHint(kind === 'plant' ? `${agent.name} is planting the bomb…` : `${agent.name} is defusing the bomb!`);
    if (kind === 'plant') audio.plantBeep();
    else audio.defuseBeep();
  },
  onChannelDone(agent, kind, site) {
    match.state.bomb.channeler = null;
    match.state.bomb.channelKind = null;
    hud.hideHint();
    if (kind === 'plant') {
      plantBomb(agent, site);
    } else {
      onRoundEnd({ winner: 'revenant', reason: `Bomb defused at Site ${site}` });
    }
  },
  onPickupBomb(agent) {
    const bomb = match.state.bomb;
    bomb.state = 'carried';
    bomb.carrier = agent;
    bomb.position = null;
    agent.hasBomb = true;
    hideBombMesh();
    hud.hideHint();
  },
};

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (!playerAgent.alive) {
    camera.position.y = body.position.y + 0.5;
    camera.rotation.z = 0.35;
  }
}

function step(dt) {
  now += dt;
  elapsed += dt;
  const state = match.state;
  map.step(dt, elapsed);

  if (state.phase === 'buy') {
    state.phaseTime += dt;
    if (!buyDone) {
      buyDone = true;
      botContext.now = now;
      for (const bot of bots) bot.buy(botContext);
    }
    if (state.phaseTime >= BUY_SECONDS) deployFromBuy();
  } else if (state.phase === 'roundEnd') {
    state.phaseTime += dt;
    if (state.phaseTime >= 4 && state.phase !== 'matchEnd') {
      if (document.pointerLockElement) document.exitPointerLock();
      match.startBuy();
      resetRound();
      hud.showBuyMenu(playerAgent.money, weapon.state.def.id, weapon.state.grenades);
    }
  }

  if (state.phase === 'round' || state.phase === 'buy') {
    if (playerAgent.alive) player.step(dt, input.state.keys);
    weapon.step(dt);
  }

  if (state.phase === 'round') {
    // Bots, each with its own view of the enemy team.
    for (const bot of bots) {
      botContext.now = now;
      botContext.enemies = agents.filter((a) => a.team !== bot.agent.team);
      bot.update(dt, botContext);
      // A bot with a grenade lobs it at a mid-range target now and then.
      const b = bot.agent;
      if (b.weapon.state.grenades > 0 && bot.target && b.alive) {
        const dist = b.mover.body.position.distanceTo(bot.target.mover.body.position);
        if (dist > 8 && dist < 25 && random() < dt * 0.12) {
          b.weapon.state.grenades -= 1;
          const dir = bot.target.eyePosition(new THREE.Vector3()).sub(b.eyePosition(new THREE.Vector3())).normalize();
          throwGrenade(b, dir);
        }
      }
    }

    // The player's bomb work: pick up, plant.
    const bomb = state.bomb;
    if (playerAgent.alive) {
      if (bomb.state === 'dropped' && bomb.position) {
        const d = player.state.position.distanceTo(bomb.position);
        if (d < 1.6) {
          hud.showHint('Press E to pick up the bomb');
          if (input.consume('KeyE')) {
            botContext.onPickupBomb(playerAgent);
            hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name, weapon.state.grenades);
          }
        }
      }
      if (playerAgent.hasBomb) {
        const site = match.siteById('A').center.distanceTo(player.state.position) < match.siteById('A').radius
          ? match.siteById('A') : match.siteById('B').center.distanceTo(player.state.position) < match.siteById('B').radius
            ? match.siteById('B') : null;
        if (site) {
          hud.showHint('Hold E to plant the bomb');
          if (input.state.keys.has('KeyE')) {
            plantProgress += dt / 3;
            hud.setChannel(plantProgress, `PLANTING — SITE ${site.id}`);
            if (plantProgress >= 1) {
              plantProgress = 0;
              hud.setChannel(null);
              playerAgent.hasBomb = false;
              plantBomb(playerAgent, site.id);
            }
          } else {
            plantProgress = 0;
            hud.setChannel(null);
          }
        } else {
          plantProgress = 0;
          hud.setChannel(null);
        }
      }
    }

    // Planted bomb: beeps that quicken, and the HUD countdown.
    if (bomb.state === 'planted') {
      const left = BOMB_SECONDS - (now - bomb.plantedAt);
      hud.setBombTimer(left);
      const interval = Math.max(0.22, left / BOMB_SECONDS);
      if (now - lastBeepAt >= interval) {
        lastBeepAt = now;
        audio.bombBeep();
      }
      if (bombLight) bombLight.material.color.setHex(Math.sin(now * 10) > 0 ? 0xe5484d : 0x331111);
    } else {
      hud.setBombTimer(null);
    }

    const result = match.step(dt, agents, now);
    if (result) onRoundEnd(result);
  }

  for (const agent of agents) agent.step(dt);
  stepGrenades(dt);
  stepTracers(dt);

  // HUD, every step (the setters cache, so this is cheap).
  hud.setHealth(playerAgent.health);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name, weapon.state.grenades);
  hud.setMoney(playerAgent.money);
  hud.setTimer(state.phase === 'buy' ? BUY_SECONDS - state.phaseTime : state.roundTimeLeft, state.phase);
  hud.setScore(state.score.vanguard, state.score.revenant, Math.max(1, state.round));
  hud.setAlive(
    agents.filter((a) => a.team === 'vanguard' && a.alive).length,
    agents.filter((a) => a.team === 'revenant' && a.alive).length,
  );
  hud.crosshairGap(Math.min(40, 4 + weapon.spread(player.groundSpeed()) * 700));
}

function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const phase = match.state.phase;

    if (phase === 'buy') {
      for (let i = 0; i < BUY_ORDER.length; i += 1) {
        if (input.consume('Digit' + (i + 1))) buyWeapon(BUY_ORDER[i]);
      }
      if (input.consume('Digit5')) buyGrenade();
      if (input.consume('Enter') || input.consume('KeyB')) deployFromBuy();
    }

    if (phase === 'round' && playerAgent.alive) {
      const firing = input.state.firing;
      const edge = firing && !prevFiring;
      prevFiring = firing;
      const def = weapon.state.def;
      if (firing && weapon.ready() && (def.auto || edge)) playerShoot();
      if (input.consume('KeyR') && weapon.reload()) audio.reload();
      if (input.consume('KeyG') && weapon.state.grenades > 0) {
        weapon.state.grenades -= 1;
        camera.getWorldDirection(tmpB);
        throwGrenade(playerAgent, tmpB);
        hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name, weapon.state.grenades);
      }
      // Sniper zoom on right mouse.
      const targetFov = input.state.aiming && def.kind === 'sniper' ? 74 / def.zoom : 74;
      if (Math.abs(camera.fov - targetFov) > 0.1) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
        camera.updateProjectionMatrix();
      }
    }

    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  const phase = match.state.phase;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuyMenu();
    if (phase === 'buy') deployFromBuy();
  } else if (phase === 'round' && playerAgent.alive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  const phase = match.state.phase;
  if (phase === 'menu') {
    startMatch();
  } else if (phase === 'matchEnd') {
    startMatch();
  } else if (phase === 'roundEnd') {
    // The next buy phase starts on its own timer; just re-lock.
    input.requestLock();
  } else {
    input.requestLock();
  }
});

hud.onBuy((choice) => {
  if (choice.weapon) buyWeapon(choice.weapon);
  else if (choice.grenade) buyGrenade();
});
hud.onBuyClose(() => deployFromBuy());

// Clicking the canvas during a round (after lock was lost) re-locks the mouse.
renderer.domElement.addEventListener('click', () => {
  if (!shot && match.state.phase === 'round' && playerAgent.alive && !document.pointerLockElement) {
    input.requestLock();
  }
});

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
  // Shots run before the first render, so push the staged positions into the
  // meshes' world matrices — otherwise raycasts test them at their spawn.
  scene.updateMatrixWorld(true);
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function placeAgent(agent, x, z, yaw) {
  agent.reset(new THREE.Vector3(x, 0, z), yaw);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuyMenu();
  const state = match.state;
  if (name === 'start') {
    player.teleport(0, 11.5, 0);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.6, -8));
    hud.showOverlay('menu');
  } else if (name === 'buy') {
    startMatch();
    player.teleport(-2, 11, 0.15);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    hud.showBuyMenu(2400, 'pistol', 0);
    hud.setMoney(2400);
  } else if (name === 'combat') {
    startMatch();
    match.state.score.vanguard = 1;
    match.state.score.revenant = 0;
    match.state.round = 2;
    deployFromBuy();
    placeAgent(playerAgent, 19, 4, 0.15);
    player.teleport(19, 4, 0.15);
    const enemy = agents.find((a) => a.name === 'Vex');
    placeAgent(enemy, 17, -2, Math.PI);
    enemy.weapon.equip(WEAPONS.rifle);
    const mate = agents.find((a) => a.name === 'Rook');
    placeAgent(mate, 14, 4, 0.4);
    const down = agents.find((a) => a.name === 'Moss');
    placeAgent(down, 15, -5, 2.6);
    down.damage(500);
    down.fall = 1;
    down.step(0.5);
    settle(30);
    weapon.equip(WEAPONS.rifle);
    weapon.state.mag = 18;
    aimAt(enemy.eyePosition(new THREE.Vector3()));
    shootFrom(playerAgent, playerAgent.eyePosition(new THREE.Vector3()), camera.getWorldDirection(new THREE.Vector3()), 0, WEAPONS.rifle);
    weapon.state.mag = 18;
    hud.killfeed('Rook', 'Moss', true, 'vanguard');
    hud.setAmmo(18, 75, 'AR-77 Longshot', 1);
    hud.setScore(1, 0, 2);
    hud.setTimer(78, 'round');
  } else if (name === 'plant') {
    startMatch();
    match.state.score.vanguard = 2;
    match.state.score.revenant = 1;
    match.state.round = 4;
    deployFromBuy();
    const bomb = match.state.bomb;
    bomb.state = 'planted';
    bomb.site = 'A';
    bomb.plantedAt = now - 20;
    bomb.position = match.siteById('A').center.clone();
    bomb.position.y = 0.15;
    showBombMesh(bomb.position);
    placeAgent(playerAgent, -9, -11.5, -0.5);
    player.teleport(-9, -11.5, -0.5);
    const defuser = agents.find((a) => a.name === 'Vex');
    placeAgent(defuser, -14.8, -9.2, 0.9);
    const guard = agents.find((a) => a.name === 'Rook');
    placeAgent(guard, -18, -6, -0.8);
    settle(30);
    aimAt(new THREE.Vector3(-14.8, 1.2, -9.2));
    hud.setChannel(0.55, 'DEFUSING — SITE A');
    hud.setBombTimer(15);
    hud.setScore(2, 1, 4);
    hud.showHint('Vex is defusing the bomb!');
  } else if (name === 'end') {
    startMatch();
    match.state.score.vanguard = 3;
    match.state.score.revenant = 1;
    match.state.round = 5;
    deployFromBuy();
    placeAgent(playerAgent, -2, 6, -0.2);
    player.teleport(-2, 6, -0.2);
    const down = agents.find((a) => a.name === 'Pike');
    placeAgent(down, 3, 2, Math.PI);
    down.damage(500);
    down.fall = 1;
    down.step(0.5);
    settle(30);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    hud.banner('VANGUARD WINS THE ROUND', 'Revenant eliminated  ·  3 — 1', 'vanguard');
    hud.setScore(3, 1, 5);
  }
  hud.setHealth(playerAgent.health);
  hud.setMoney(playerAgent.money);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setHealth(100);
hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.def.name, 0);
hud.setMoney(START_MONEY);
hud.setScore(0, 0, 1);
hud.setAlive(5, 5);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
window.__gameReady = true;
