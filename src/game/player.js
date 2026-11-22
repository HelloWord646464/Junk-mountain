import * as THREE from 'three';
import { BELT_HEIGHT, BELT_SPEED } from '../config.js';

const STEP = 1.1, RADIUS = 0.35, HEIGHT = 1.78, EYE = 1.62;

// First-person walker that can climb the heap, stand on belts and bump into things.
export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(0, 0, 50);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = -0.08;
    this.onGround = true;
    this.eyeY = EYE;
    this.bob = 0; this.bobAmt = 0;
    this.shake = 0;
    this.fovKick = 0;
  }

  ground(x, z, feet) {
    const P = this.game.pile;
    let g = 0;
    const s = P.surfaceAt(x, z);
    if (s <= feet + STEP) g = s;
    for (const b of this.game.yard.colliders) {
      if (x + RADIUS * 0.5 < b.min.x || x - RADIUS * 0.5 > b.max.x || z + RADIUS * 0.5 < b.min.z || z - RADIUS * 0.5 > b.max.z) continue;
      if (b.max.y <= feet + 0.6) g = Math.max(g, b.max.y);
    }
    return g;
  }

  blockedByHeap(x, z, feet) {
    const P = this.game.pile;
    for (const [ox, oz] of [[0, 0], [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) if (P.surfaceAt(x + ox, z + oz) > feet + STEP) return true;
    return false;
  }

  update(dt, input, enabled) {
    if (enabled) {
      const sens = 0.0022 * input.sensitivity;
      this.yaw -= input.mouse.dx * sens;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - input.mouse.dy * sens));
    }
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (enabled) {
      if (input.down('KeyW')) wish.add(fwd);
      if (input.down('KeyS')) wish.sub(fwd);
      if (input.down('KeyD')) wish.add(right);
      if (input.down('KeyA')) wish.sub(right);
    }
    const sprint = enabled && input.down('ShiftLeft');
    const speed = sprint ? 7.2 : 4.4;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const accel = this.onGround ? 12 : 3;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, accel * dt);
    if (enabled && this.onGround && input.hit('Space')) { this.vel.y = 6.2; this.onGround = false; }

    // carried along by a powered belt
    const belt = this.game.machines.at(Math.floor(this.pos.x), Math.floor(this.pos.z));
    if (belt && belt.def.id === 'belt' && this.onGround && Math.abs(this.pos.y - BELT_HEIGHT) < 0.05 && belt.factor > 0) {
      this.pos.x += belt.dir[0] * BELT_SPEED * belt.factor * dt; this.pos.z += belt.dir[1] * BELT_SPEED * belt.factor * dt;
    }

    this.vel.y -= 18 * dt;
    const feet = this.pos.y;
    // horizontal move, axis by axis so we slide along walls
    for (const axis of ['x', 'z']) {
      const old = this.pos[axis];
      this.pos[axis] += this.vel[axis] * dt;
      if (this.blockedByHeap(this.pos.x, this.pos.z, feet)) { this.pos[axis] = old; this.vel[axis] = 0; }
    }
    for (const b of this.game.yard.colliders) {
      if (b.max.y <= feet + 0.6 || b.min.y > feet + HEIGHT) continue;
      const cx = Math.max(b.min.x, Math.min(this.pos.x, b.max.x)), cz = Math.max(b.min.z, Math.min(this.pos.z, b.max.z));
      const dx = this.pos.x - cx, dz = this.pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), push = RADIUS - d; this.pos.x += dx / d * push; this.pos.z += dz / d * push; }
      else { // centre inside the box: push out the shortest way
        const opts = [[b.min.x - RADIUS - this.pos.x, 0], [b.max.x + RADIUS - this.pos.x, 0], [0, b.min.z - RADIUS - this.pos.z], [0, b.max.z + RADIUS - this.pos.z]];
        opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
        this.pos.x += opts[0][0]; this.pos.z += opts[0][1];
      }
    }
    // vertical
    this.pos.y += this.vel.y * dt;
    const g = this.ground(this.pos.x, this.pos.z, Math.max(feet, this.pos.y));
    if (this.pos.y <= g) {
      if (!this.onGround && this.vel.y < -9) this.game.audio.impact('rubber', this.pos, 0.5);
      if (g - this.pos.y > 0.05) this.eyeY -= (g - this.pos.y); // smooth step-ups
      this.pos.y = g; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > g + 0.05) this.onGround = false;

    // camera
    this.eyeY += (EYE - this.eyeY) * Math.min(1, dt * 10);
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmt += ((this.onGround && moving > 0.5 ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 8);
    this.bob += dt * moving * 1.9;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.fovKick += ((sprint && moving > 5 ? 6 : 0) - this.fovKick) * Math.min(1, dt * 5);
  }

  applyCamera(cam, baseFov) {
    const s = this.shake * this.shake;
    cam.position.set(
      this.pos.x + Math.cos(this.bob) * 0.03 * this.bobAmt + (Math.random() - 0.5) * s * 0.15,
      this.pos.y + this.eyeY + Math.abs(Math.sin(this.bob)) * 0.05 * this.bobAmt + (Math.random() - 0.5) * s * 0.15,
      this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, Math.cos(this.bob) * 0.004 * this.bobAmt, 'YXZ');
    const fov = baseFov + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')); }
}
