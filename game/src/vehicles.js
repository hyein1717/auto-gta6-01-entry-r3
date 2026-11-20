// vehicles.js — the car factory and the arcade driving model shared by the
// player, traffic and the police. A car is a THREE.Group built from boxes and
// cylinders (body, cabin, wheels, lights) plus a small physics state: heading
// and signed speed. Steering follows the classic arcade rule — the faster you
// go the less the wheel bites, and the handbrake trades grip for rotation.

import * as THREE from 'three';
import { collideCircle } from './city.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8e4da, 0x30343c, 0x3fae6a, 0xe0a52a, 0x7a4fc2, 0xc26a9e, 0x9fb4c2];

export function randomCarColor(rng) {
  return CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)];
}

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
wheelGeo.rotateZ(Math.PI / 2); // axle along the car's width (x)
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2733, roughness: 0.25, metalness: 0.6 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.7 });
const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a8, emissiveIntensity: 2.2 });
const taillightMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xdd2222, emissiveIntensity: 1.4 });

// Builds the visual mesh for a car. kind: 'sedan' | 'sport' | 'taxi' | 'police'.
export function buildCarMesh(color, kind = 'sedan') {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const sport = kind === 'sport';
  const bodyH = sport ? 0.52 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.86, bodyH, sport ? 4.3 : 4.05), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.5, sport ? 1.9 : 2.1), glassMat);
  cabin.position.set(0, 0.55 + bodyH / 2 + 0.22, sport ? -0.25 : -0.1);
  cabin.castShadow = true;
  car.add(cabin);

  if (sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.42), trimMat);
    spoiler.position.set(0, 1.02, -1.95);
    car.add(spoiler);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.8), paint);
    snout.position.set(0, 0.42, 2.15);
    car.add(snout);
  }

  const wheelPositions = [
    [-0.86, 1.32], [0.86, 1.32], [-0.86, -1.32], [0.86, -1.32],
  ];
  const wheels = [];
  for (const [wx, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.36, wz);
    car.add(wheel);
    wheels.push(wheel);
  }
  car.userData.wheels = wheels;

  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), headlightMat);
    head.position.set(side * 0.58, 0.62, 2.04);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.06), taillightMat);
    tail.position.set(side * 0.56, 0.66, -2.04);
    car.add(tail);
  }

  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xffc81e, emissiveIntensity: 0.9 }),
    );
    sign.position.set(0, 1.32, -0.1);
    car.add(sign);
  }

  if (kind === 'police') {
    // White doors on a dark body read as a patrol car at any distance.
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 1.7), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
      door.position.set(side * 0.94, 0.58, 0);
      car.add(door);
    }
    const bar = new THREE.Group();
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.34), trimMat);
    bar.add(barBase);
    const redLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.6 }),
    );
    redLamp.position.set(-0.28, 0.12, 0);
    bar.add(redLamp);
    const blueLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 2.6 }),
    );
    blueLamp.position.set(0.28, 0.12, 0);
    bar.add(blueLamp);
    bar.position.set(0, 1.32, -0.1);
    car.add(bar);
    car.userData.lightBar = { redLamp, blueLamp };
  }
  return car;
}

// A drivable car: mesh + physics state. x/z live on the mesh position.
export class Car {
  constructor(scene, color, kind = 'sedan', opts = {}) {
    this.mesh = buildCarMesh(color, kind);
    this.kind = kind;
    this.heading = opts.heading ?? 0;
    this.speed = 0;
    this.steerVisual = 0;
    this.radius = 1.75;
    this.maxSpeed = kind === 'sport' ? 46 : kind === 'police' ? 43 : 37;
    this.maxReverse = 11;
    this.accel = kind === 'sport' ? 17 : 14;
    this.driver = null; // 'player' | 'traffic' | 'police' | null (parked)
    this.wrecked = false;
    this.wheelSpin = 0;
    this.mesh.position.set(opts.x ?? 0, 0, opts.z ?? 0);
    this.syncMesh();
    scene.add(this.mesh);
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  get pos() { return this.mesh.position; }

  // Direction the nose points: heading 0 faces +z (south), turning east with +.
  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  syncMesh() {
    this.mesh.rotation.y = this.heading;
    for (const wheel of this.mesh.userData.wheels) wheel.rotation.x = this.wheelSpin;
    if (this.mesh.userData.lightBar) {
      const t = performance.now() * 0.012;
      const on = Math.sin(t) > 0;
      this.mesh.userData.lightBar.redLamp.material.emissiveIntensity = on ? 3.2 : 0.25;
      this.mesh.userData.lightBar.blueLamp.material.emissiveIntensity = on ? 0.25 : 3.2;
    }
  }

  // Arcade drive step. input: {throttle [-1..1], steer [-1..1], handbrake}.
  // Returns impact speed if the car slammed a building this step, else 0.
  drive(dt, input, colliders) {
    if (this.wrecked) {
      this.speed = 0;
      return 0;
    }
    const throttle = input.throttle ?? 0;
    const steer = input.steer ?? 0;
    if (throttle > 0) {
      this.speed += this.accel * throttle * dt * (1 - Math.max(0, this.speed) / (this.maxSpeed * 1.25));
    } else if (throttle < 0) {
      if (this.speed > 0.6) {
        this.speed = Math.max(0, this.speed - 26 * dt); // braking, never past a stop
      } else {
        this.speed += 9 * throttle * dt;
        this.speed = Math.max(this.speed, -this.maxReverse);
      }
    }
    // Drag and rolling resistance.
    const dragK = input.handbrake ? 1.6 : 0.35;
    this.speed -= this.speed * dragK * dt;
    if (throttle === 0 && Math.abs(this.speed) < 0.12) this.speed = 0;
    this.speed = Math.min(this.speed, this.maxSpeed);

    // Steering: less bite at speed, more with the handbrake, none standing still.
    const speedFactor = Math.min(1, Math.abs(this.speed) / 6);
    const bite = (input.handbrake ? 2.3 : 1.55) / (1 + Math.abs(this.speed) * 0.045);
    this.heading += steer * bite * speedFactor * dt * Math.sign(this.speed || 1);
    this.steerVisual = steer;

    const f = this.forward();
    this.mesh.position.x += f.x * this.speed * dt;
    this.mesh.position.z += f.z * this.speed * dt;
    this.wheelSpin += (this.speed * dt) / 0.36;

    let impact = 0;
    if (colliders) {
      const before = { x: this.x, z: this.z };
      collideCircle(this.mesh.position, this.radius, colliders, null);
      const shove = Math.hypot(this.x - before.x, this.z - before.z);
      if (shove > 0.02) {
        impact = Math.abs(this.speed) * Math.min(1, shove * 2.2);
        if (Math.abs(this.speed) > 3) this.speed = -this.speed * 0.28;
        else this.speed = 0;
      }
    }
    // Keep cars inside the playable peninsula.
    this.mesh.position.x = Math.max(-262, Math.min(300, this.x));
    this.mesh.position.z = Math.max(-186, Math.min(186, this.z));
    this.syncMesh();
    return impact;
  }
}

// Circle-vs-circle shove between two cars; returns closing impact speed.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const minDist = a.radius + b.radius - 0.35;
  if (dist === 0 || dist >= minDist) return 0;
  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = (minDist - dist) / 2;
  const aMovable = a.driver !== null && !a.wrecked;
  const bMovable = b.driver !== null && !b.wrecked;
  if (aMovable || !bMovable) a.mesh.position.x -= nx * overlap, a.mesh.position.z -= nz * overlap;
  if (bMovable || !aMovable) b.mesh.position.x += nx * overlap, b.mesh.position.z += nz * overlap;
  const closing = Math.abs(a.speed - b.speed);
  if (a.driver) a.speed *= 0.72;
  if (b.driver) b.speed *= 0.72;
  a.syncMesh();
  b.syncMesh();
  return closing;
}
