// Foundry Yard: an original dusk industrial yard, 44 x 32 m. Vanguard spawns south
// and attacks two sites in the north: A "Crane Bay" in the west, B "Silo Row" in the
// east. Three lanes (west long, mid gantry, east long) connect them. Plain geometry
// and one painted canvas floor texture only, no models and no external assets.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WIDTH = 44;
const DEPTH = 32;

export const SITES = [
  { id: 'A', name: 'Crane Bay', center: new THREE.Vector3(-15, 0, -10), radius: 3.4, color: PALETTE.siteA },
  { id: 'B', name: 'Silo Row', center: new THREE.Vector3(15, 0, -10), radius: 3.4, color: PALETTE.siteB },
];

export const SPAWNS = {
  vanguard: [
    new THREE.Vector3(-6, 0, 13.5), new THREE.Vector3(-2, 0, 13.5),
    new THREE.Vector3(2, 0, 13.5), new THREE.Vector3(6, 0, 13.5),
    new THREE.Vector3(0, 0, 11.5),
  ],
  revenant: [
    new THREE.Vector3(-6, 0, -13.5), new THREE.Vector3(-2, 0, -13.5),
    new THREE.Vector3(2, 0, -13.5), new THREE.Vector3(6, 0, -13.5),
    new THREE.Vector3(0, 0, -11.5),
  ],
};

// Waypoint graph the bots walk. Nodes sit in open lanes; every edge is a straight,
// unobstructed walk, so bots steer node to node and BFS finds their routes.
const WAYPOINTS = {
  vspawn: [0, 13], vmid: [0, 8], mid: [0, 0], midW: [-8, 0], midE: [8, 0],
  aLong: [-19, 6], aLongMid: [-19, -4], aEntry: [-14, -5], siteA: [-15, -10],
  bLong: [19, 6], bLongMid: [19, -4], bEntry: [14, -5], siteB: [15, -10],
  aMid: [-9, -8], bMid: [9, -8], rspawn: [0, -13], rmid: [0, -8],
  aHold: [-11, -12.5], bHold: [11, -12.5], midHold: [0, -5.5], yard: [-8, 6], yardE: [8, 6],
};
const EDGES = [
  ['vspawn', 'vmid'], ['vmid', 'mid'], ['vmid', 'aLong'], ['vmid', 'bLong'],
  ['vmid', 'yard'], ['vmid', 'yardE'], ['yard', 'midW'], ['yardE', 'midE'],
  ['mid', 'midW'], ['mid', 'midE'], ['mid', 'rmid'], ['midW', 'aLong'],
  ['midE', 'bLong'], ['aLong', 'aLongMid'], ['aLongMid', 'aEntry'],
  ['aEntry', 'siteA'], ['aEntry', 'aMid'], ['aMid', 'rmid'], ['aMid', 'aHold'],
  ['siteA', 'aHold'], ['bLong', 'bLongMid'], ['bLongMid', 'bEntry'],
  ['bEntry', 'siteB'], ['bEntry', 'bMid'], ['bMid', 'rmid'], ['bMid', 'bHold'],
  ['siteB', 'bHold'], ['rspawn', 'rmid'], ['rmid', 'midHold'], ['midHold', 'mid'],
  ['midHold', 'aMid'], ['midHold', 'bMid'],
];

function floorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a4440';
  ctx.fillRect(0, 0, 1024, 768);
  // Concrete speckle.
  for (let i = 0; i < 9000; i += 1) {
    const v = 60 + Math.random() * 40;
    ctx.fillStyle = `rgb(${v | 0},${(v * 0.96) | 0},${(v * 0.9) | 0})`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 768, 2, 2);
  }
  const toPx = (x, z) => [(x + WIDTH / 2) / WIDTH * 1024, (z + DEPTH / 2) / DEPTH * 768];
  // Expansion joints.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let x = -22; x <= 22; x += 5.5) {
    const [px] = toPx(x, 0);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, 768); ctx.stroke();
  }
  for (let z = -16; z <= 16; z += 5.33) {
    const [, pz] = toPx(0, z);
    ctx.beginPath(); ctx.moveTo(0, pz); ctx.lineTo(1024, pz); ctx.stroke();
  }
  // Lane dashes down mid and the longs.
  ctx.strokeStyle = 'rgba(240,168,48,0.55)';
  ctx.lineWidth = 5;
  ctx.setLineDash([26, 22]);
  for (const x of [0, -19, 19]) {
    const [px, pz1] = toPx(x, 13);
    const [, pz2] = toPx(x, -13);
    ctx.beginPath(); ctx.moveTo(px, pz1); ctx.lineTo(px, pz2); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Site circles with letters.
  for (const site of SITES) {
    const [px, pz] = toPx(site.center.x, site.center.z);
    const r = site.radius / WIDTH * 1024;
    ctx.strokeStyle = site.color;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(px, pz, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = site.color;
    ctx.font = `bold ${Math.round(r * 0.9)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(site.id, px, pz);
    ctx.font = `bold 22px system-ui, sans-serif`;
    ctx.fillText(site.name.toUpperCase(), px, pz + r + 26);
  }
  // Hazard chevrons at the site mouths.
  ctx.fillStyle = '#e5c53d';
  for (const [hx, hz] of [[-14, -5.5], [14, -5.5]]) {
    const [px, pz] = toPx(hx, hz);
    for (let i = 0; i < 5; i += 1) {
      ctx.save();
      ctx.translate(px + (i - 2) * 26, pz);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-7, -7, 14, 14);
      ctx.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10,8,6,0.72)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 236, 236);
  ctx.fillStyle = color;
  ctx.font = 'bold 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 138);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.04,
    });
  }
  materials.floor = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95, metalness: 0.02 });
  materials.glowA = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.siteA), emissive: new THREE.Color(PALETTE.siteA), emissiveIntensity: 1.6, roughness: 0.4 });
  materials.glowB = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.siteB), emissive: new THREE.Color(PALETTE.siteB), emissiveIntensity: 1.6, roughness: 0.4 });
  materials.lamp = new THREE.MeshStandardMaterial({ color: new THREE.Color('#fff2cf'), emissive: new THREE.Color('#ffdf9e'), emissiveIntensity: 2.2, roughness: 0.4 });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material] || material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(rt, rb, h, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const half = Math.max(rt, rb);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - half, y - h / 2, z - half), new THREE.Vector3(x + half, y + h / 2, z + half)));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter walls, open to a dusk sky.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3(new THREE.Vector3(-WIDTH / 2, -0.4, -DEPTH / 2), new THREE.Vector3(WIDTH / 2, 0, DEPTH / 2)));
  box(0.6, 5.2, DEPTH + 1.2, -WIDTH / 2 - 0.3, 2.6, 0, 'steel');
  box(0.6, 5.2, DEPTH + 1.2, WIDTH / 2 + 0.3, 2.6, 0, 'steel');
  box(WIDTH + 1.2, 5.2, 0.6, 0, 2.6, -DEPTH / 2 - 0.3, 'steel');
  box(WIDTH + 1.2, 5.2, 0.6, 0, 2.6, DEPTH / 2 + 0.3, 'steel');

  // Mid gantry: stacked containers forming the central fight.
  box(6, 2.4, 2.4, -2.5, 1.2, 0, 'containerA');
  box(6, 2.4, 2.4, 3.5, 1.2, -1.5, 'containerB');
  box(2.4, 1.1, 2.4, 0.5, 0.55, 3.2, 'containerC');
  box(1.2, 1.1, 1.2, -6.5, 0.55, -2.5, 'rust');
  box(1.2, 1.1, 1.2, 7, 0.55, 2.5, 'rust');
  // A raised platform you can stand on, reached from the mid crates.
  box(4.4, 0.5, 3, -11, 0.25, 1.5, 'steel');
  box(4.4, 0.5, 3, 11, 0.25, 1.5, 'steel');

  // West long: crates and a container wall.
  box(2.4, 2.4, 6, -19, 1.2, 10, 'containerC');
  box(1.2, 1.1, 1.2, -17.5, 0.55, 2, 'rust');
  box(2.4, 1.1, 2.4, -19, 0.55, -8, 'containerA');
  box(1.2, 2.2, 1.2, -16.5, 1.1, -11, 'steel');

  // East long mirrors it.
  box(2.4, 2.4, 6, 19, 1.2, 10, 'containerB');
  box(1.2, 1.1, 1.2, 17.5, 0.55, 2, 'rust');
  box(2.4, 1.1, 2.4, 19, 0.55, -8, 'containerA');
  box(1.2, 2.2, 1.2, 16.5, 1.1, -11, 'steel');

  // Site A, Crane Bay: crane legs, a top beam and a hanging hook, plus crates.
  box(0.8, 6.5, 0.8, -19.5, 3.25, -12.5, 'hazard');
  box(0.8, 6.5, 0.8, -19.5, 3.25, -7.5, 'hazard');
  box(0.8, 0.8, 6, -19.5, 6.4, -10, 'steel');
  box(0.3, 1.6, 0.3, -17, 5.2, -10, 'steel');
  box(1.2, 1.1, 1.2, -12, 0.55, -13, 'containerC');
  box(2.4, 1.1, 1.2, -17.5, 0.55, -6.5, 'containerB');
  box(1.2, 1.1, 2.4, -10.5, 0.55, -8, 'rust');

  // Site B, Silo Row: three silos and a low wall.
  cylinder(1.7, 1.7, 5.2, 18.5, 2.6, -12.5, 'steel');
  cylinder(1.7, 1.7, 5.2, 14.5, 2.6, -13.5, 'containerB');
  cylinder(1.4, 1.4, 4.2, 18, 2.1, -8.5, 'rust');
  box(4.5, 1.1, 0.8, 12, 0.55, -7, 'containerC');
  box(1.2, 1.1, 1.2, 12.5, 0.55, -12.5, 'containerA');

  // South yard cover near the Vanguard spawn.
  box(2.4, 1.1, 1.2, -4, 0.55, 8.5, 'containerA');
  box(2.4, 1.1, 1.2, 4, 0.55, 8.5, 'containerB');
  box(1.2, 1.1, 1.2, -9, 0.55, 10.5, 'rust');
  box(1.2, 1.1, 1.2, 9, 0.55, 10.5, 'rust');

  // North yard cover near the Revenant spawn.
  box(2.4, 1.1, 1.2, -4, 0.55, -6, 'containerB');
  box(2.4, 1.1, 1.2, 4, 0.55, -6, 'containerA');
  box(1.2, 2.2, 1.2, -8.5, 1.1, -11.5, 'steel');
  box(1.2, 2.2, 1.2, 8.5, 1.1, -11.5, 'steel');

  // Site markers: glowing rings on the floor and a floating letter board.
  for (const site of SITES) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.14, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.03, site.center.z);
    group.add(ring);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.7),
      new THREE.MeshBasicMaterial({ map: letterTexture(site.id, site.color), transparent: true, side: THREE.DoubleSide }),
    );
    board.position.set(site.center.x, 3.4, site.center.z);
    group.add(board);
    site.board = board;
  }

  // Lamp posts with warm light, plus a distant skyline for depth.
  for (const [x, z] of [[-10, 4], [10, 4], [-10, -4], [10, -4], [0, 11], [0, -11]]) {
    box(0.18, 4.4, 0.18, x, 2.2, z, 'steel');
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.7), materials.lamp);
    lamp.position.set(x, 4.5, z);
    group.add(lamp);
  }
  const skylineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#241d18') });
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    const r = 52 + (i % 3) * 8;
    const w = 8 + (i % 4) * 4;
    const h = 10 + (i % 5) * 7;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skylineMat);
    mesh.position.set(Math.cos(angle) * r, h / 2 - 0.5, Math.sin(angle) * r);
    group.add(mesh);
  }

  // Lighting: low dusk sun, cool sky fill, warm key.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a7a68'), new THREE.Color('#17130f'), 0.95);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.0);
  sun.position.set(18, 26, 14);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a86a8'), 0.5);
  fill.position.set(-14, 12, -16);
  scene.add(fill);

  // Waypoint lookup and BFS routing.
  const nodes = {};
  for (const [name, [x, z]] of Object.entries(WAYPOINTS)) nodes[name] = new THREE.Vector3(x, 0, z);
  const adjacency = {};
  for (const name of Object.keys(nodes)) adjacency[name] = [];
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  function nearestWaypoint(position) {
    let best = null;
    let bestDist = Infinity;
    for (const [name, point] of Object.entries(nodes)) {
      const d = (point.x - position.x) ** 2 + (point.z - position.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = name;
      }
    }
    return best;
  }

  function findPath(fromName, toName) {
    if (fromName === toName) return [nodes[toName]];
    const prev = { [fromName]: null };
    const queue = [fromName];
    while (queue.length) {
      const current = queue.shift();
      if (current === toName) break;
      for (const next of adjacency[current]) {
        if (!(next in prev)) {
          prev[next] = current;
          queue.push(next);
        }
      }
    }
    if (!(toName in prev)) return [nodes[toName]];
    const path = [];
    let node = toName;
    while (node) {
      path.unshift(nodes[node]);
      node = prev[node];
    }
    return path;
  }

  const losRaycaster = new THREE.Raycaster();
  losRaycaster.far = 120;
  const losDirection = new THREE.Vector3();

  function lineOfSight(from, to) {
    losDirection.copy(to).sub(from);
    const distance = losDirection.length();
    if (distance < 0.01) return true;
    losDirection.normalize();
    losRaycaster.set(from, losDirection);
    const hits = losRaycaster.intersectObjects(shootables, false);
    return hits.length === 0 || hits[0].distance > distance - 0.15;
  }

  return {
    colliders, shootables, group, nodes, sites: SITES,
    nearestWaypoint, findPath, lineOfSight,
    step(dt, time) {
      for (const site of SITES) {
        if (site.board) site.board.rotation.y = time * 0.4;
      }
    },
  };
}
