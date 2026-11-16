// The player's body: the shared mover plus the keyboard state. main.js reads
// the keys and drives the mover; the camera follows the body in main.js.
import { createMover } from './mover.js';

export function createPlayer(colliders, spawn, yaw) {
  const mover = createMover(colliders, spawn.x, spawn.z, yaw);

  return {
    mover,
    get state() { return mover.body; },
    look(dx, dy) { mover.look(dx, dy); },
    recoil(pitchKick, yawKick) { mover.recoil(pitchKick, yawKick); },
    groundSpeed() { return mover.groundSpeed(); },
    step(dt, keys) {
      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
      const jump = keys.has('Space');
      mover.step(dt, forward, strafe, crouch, jump);
    },
    teleport(x, z, newYaw) { mover.teleport(x, z, newYaw); },
  };
}
