// Weapons: four guns plus one grenade, each with its own numbers, price and look.
// Damage is per torso hit; the head multiplier lives in main.js, the same for all.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const HEAD_MULTIPLIER = 3;

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 26, headDamage: 78, fireGap: 0.16, auto: false,
    magSize: 12, reserve: 36, reloadTime: 1.3,
    spreadStill: 0.0016, spreadMove: 0.02, bloom: 0.004, recoil: 0.006,
    range: 60, zoom: 1, tracer: 0xf0a830,
  },
  smg: {
    id: 'smg', name: 'VK-9 Hornet', kind: 'smg', price: 1200,
    damage: 21, headDamage: 63, fireGap: 0.085, auto: true,
    magSize: 30, reserve: 120, reloadTime: 1.7,
    spreadStill: 0.004, spreadMove: 0.03, bloom: 0.006, recoil: 0.005,
    range: 55, zoom: 1, tracer: 0xf0a830,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longshot', kind: 'rifle', price: 2700,
    damage: 34, headDamage: 102, fireGap: 0.105, auto: true,
    magSize: 25, reserve: 100, reloadTime: 2.1,
    spreadStill: 0.0022, spreadMove: 0.028, bloom: 0.005, recoil: 0.009,
    range: 80, zoom: 1, tracer: 0xf0a830,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Needle', kind: 'sniper', price: 4750,
    damage: 95, headDamage: 285, fireGap: 1.25, auto: false,
    magSize: 5, reserve: 15, reloadTime: 2.8,
    spreadStill: 0.0004, spreadMove: 0.06, bloom: 0.001, recoil: 0.035,
    range: 120, zoom: 3.2, tracer: 0x4dc9e5,
  },
};

export const GRENADE = {
  id: 'grenade', name: 'Sparker HE', price: 300,
  fuse: 1.6, radius: 6.5, damage: 95, throwSpeed: 13,
};

export const BUY_ORDER = ['pistol', 'smg', 'rifle', 'sniper'];

// One gun's state: magazine, reserve, cooldown, reload, bloom. The view model is
// rebuilt per weapon; main.js owns the ray and the damage.
export function createWeaponState(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.55, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });

  const model = new THREE.Group();
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  camera.add(model, flash, flashLight);

  function buildModel(def) {
    while (model.children.length) model.remove(model.children[0]);
    const add = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      model.add(mesh);
      return mesh;
    };
    if (def.kind === 'pistol') {
      add(0.05, 0.07, 0.2, 0, 0, -0.1, bodyMat);
      add(0.045, 0.11, 0.05, 0, -0.08, 0.02, grip);
      add(0.02, 0.02, 0.06, 0, 0.045, -0.16, accentMat);
    } else if (def.kind === 'smg') {
      add(0.07, 0.08, 0.34, 0, 0, -0.08, bodyMat);
      add(0.04, 0.04, 0.26, 0, 0.02, -0.32, grip);
      add(0.05, 0.12, 0.05, 0, -0.09, -0.02, grip);
      add(0.03, 0.05, 0.1, 0, -0.02, 0.14, darkMat);
    } else if (def.kind === 'rifle') {
      add(0.08, 0.09, 0.44, 0, 0, -0.08, bodyMat);
      add(0.045, 0.045, 0.4, 0, 0.025, -0.42, grip);
      add(0.06, 0.09, 0.2, 0, -0.02, 0.28, grip);
      add(0.02, 0.03, 0.16, 0, 0.06, -0.14, accentMat);
    } else {
      add(0.09, 0.1, 0.62, 0, 0, -0.1, darkMat);
      add(0.05, 0.05, 0.55, 0, 0.02, -0.5, bodyMat);
      add(0.07, 0.07, 0.1, 0, 0.07, -0.16, accentMat);
      add(0.06, 0.09, 0.22, 0, -0.02, 0.3, grip);
    }
    model.position.set(0.27, -0.24, -0.52);
    model.scale.setScalar(0.85);
    model.rotation.set(0, 0, 0);
    flash.position.set(0.24, -0.18, def.kind === 'sniper' ? -1.15 : -0.95);
    flashLight.position.set(0.24, -0.16, -0.6);
  }

  const state = {
    def: WEAPONS.pistol,
    mag: WEAPONS.pistol.magSize,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0,
    grenades: 0,
  };
  buildModel(state.def);

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.03);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = state.def.magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip(def, keepAmmo) {
      state.def = def;
      if (!keepAmmo) {
        state.mag = def.magSize;
        state.reserve = def.reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      buildModel(def);
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.03, state.bloom + state.def.bloom);
    },
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
    spread(speed) {
      const moving = Math.min(1, speed / 5.2);
      return state.def.spreadStill + moving * state.def.spreadMove + state.bloom;
    },
    refill() {
      state.mag = state.def.magSize;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
