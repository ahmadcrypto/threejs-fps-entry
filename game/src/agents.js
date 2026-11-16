// An agent: one body, one gun, one health bar. The player and every bot share
// this, so a bullet never needs to know who it hit. The mesh is plain boxes: a
// torso in the team colour, a helmeted head, legs, and the gun in both hands.
import * as THREE from 'three';
import { createMover } from './mover.js';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';

const HEALTH = 100;

export function createBotWeapon(def) {
  const state = { def, mag: def.magSize, reserve: def.reserve, cooldown: 0, reloadLeft: 0 };
  return {
    state,
    step(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        if (state.reloadLeft === 0) {
          const need = state.def.magSize - state.mag;
          const take = Math.min(need, state.reserve);
          state.mag += take;
          state.reserve -= take;
        }
      }
    },
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    pullTrigger() { state.cooldown = state.def.fireGap; },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.magSize || state.reserve === 0) return false;
      state.reloadLeft = state.def.reloadTime;
      return true;
    },
    equip(def) {
      state.def = def;
      state.mag = def.magSize;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
    refill() {
      state.mag = state.def.magSize;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
  };
}

export function createAgent(scene, { team, name, isPlayer = false, spawn, yaw = 0, colliders }) {
  const teamColor = team === 'vanguard' ? PALETTE.vanguard : PALETTE.revenant;
  const mover = createMover(colliders, spawn.x, spawn.z, yaw);

  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.65, metalness: 0.08 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.5, metalness: 0.3 });
  const visorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), emissive: new THREE.Color(teamColor), emissiveIntensity: 0.9, roughness: 0.3 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), torsoMat);
  torso.position.y = 1.06;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), headMat);
  head.position.y = 1.58;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.05), visorMat);
  visor.position.set(0, 1.6, -0.16);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.22), darkMat);
  legL.position.set(-0.14, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
  gun.position.set(0.18, 1.12, -0.3);
  group.add(torso, head, visor, legL, legR, gun);
  // First-person: the player's own body must never render — it sits exactly
  // where the camera is and would fill the screen (visor/torso at 0.2 m).
  // Raycasts ignore visibility, so bots can still shoot the hidden player.
  if (isPlayer) group.visible = false;
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(group);

  const agent = {
    team, name, isPlayer, mover, group,
    health: HEALTH, alive: true, fall: 0,
    weapon: isPlayer ? null : createBotWeapon(WEAPONS.rifle),
    money: 800,
    kills: 0, deaths: 0,
    hasBomb: false,
    hitMeshes: [torso, head],
  };
  torso.userData.agent = agent;
  torso.userData.part = 'torso';
  head.userData.agent = agent;
  head.userData.part = 'head';

  agent.eyePosition = function eyePosition(out) {
    // Use agent.mover (the property), not the mover closed over at creation:
    // main.js replaces the player's mover with the shared player mover, and
    // the closed-over one would stay at the spawn forever.
    const b = agent.mover.body;
    out.set(b.position.x, b.position.y + b.eye, b.position.z);
    return out;
  };

  agent.aimDirection = function aimDirection(out) {
    const { yaw, pitch } = agent.mover.body;
    out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    return out;
  };

  agent.damage = function damage(amount) {
    if (!agent.alive) return false;
    agent.health -= amount;
    if (agent.health > 0) return false;
    agent.health = 0;
    agent.alive = false;
    agent.deaths += 1;
    agent.fall = 0;
    agent.hasBomb = false;
    return true;
  };

  agent.reset = function reset(spawnPoint, spawnYaw) {
    agent.health = HEALTH;
    agent.alive = true;
    agent.fall = 0;
    agent.hasBomb = false;
    agent.mover.teleport(spawnPoint.x, spawnPoint.z, spawnYaw);
    group.rotation.set(0, 0, 0);
    group.position.copy(agent.mover.body.position);
    group.visible = !isPlayer;
  };

  agent.step = function step(dt) {
    const { position, yaw } = agent.mover.body;
    group.position.set(position.x, position.y, position.z);
    group.rotation.y = yaw;
    if (!agent.alive) {
      agent.fall = Math.min(1, agent.fall + dt / 0.4);
      group.rotation.x = -agent.fall * 1.45;
      group.position.y = position.y - agent.fall * 0.1;
    } else {
      // Walk cycle: legs swing with ground speed.
      const speed = agent.mover.groundSpeed();
      const phase = (agent.mover.body.position.x * 2 + agent.mover.body.position.z * 2) % (Math.PI * 2);
      const swing = Math.min(1, speed / 5) * 0.5;
      legL.rotation.x = Math.sin(phase * 4) * swing;
      legR.rotation.x = -Math.sin(phase * 4) * swing;
    }
  };

  return agent;
}
