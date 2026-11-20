// pedestrians.js — the citizens of Ember Bay. Each pedestrian strolls a loop
// around one city block on the sidewalk, bobbing as they walk. They dive out
// of the way of fast cars, and if a car still hits them they go down for a
// while — which the wanted system hears about from main.js.

import * as THREE from 'three';
import { LAYOUT } from './city.js';

const SKIN_TONES = [0xf2c79b, 0xd9a066, 0xa06a3b, 0x6e4525, 0xffe0bd];
const SHIRT_COLORS = [0xe8e4da, 0x3fae6a, 0x2e6fc2, 0xe0a52a, 0xc23b7a, 0x37b8b2, 0xe2703a, 0x8a93a3];

function buildPersonMesh(rng) {
  const person = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: rng.pick(SHIRT_COLORS), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: rng.pick(SKIN_TONES), roughness: 0.75 });
  const pants = new THREE.MeshStandardMaterial({ color: rng.pick([0x2c3138, 0x4a4238, 0x5d6d7e, 0x74553a]), roughness: 0.95 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.62, 3, 8), shirt);
  body.position.y = 0.98;
  body.castShadow = true;
  person.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), skin);
  head.position.y = 1.62;
  person.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.52, 0.13), pants);
  legL.position.set(-0.1, 0.26, 0);
  person.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.1;
  person.add(legR);
  person.userData = { legL, legR };
  return person;
}

class Pedestrian {
  constructor(scene, rng, block = null) {
    this.mesh = buildPersonMesh(rng);
    this.rng = rng;
    // Walk the perimeter of one block, inset onto the sidewalk.
    const i = block ? block.i : rng.int(0, LAYOUT.streetX.length - 2);
    const j = block ? block.j : rng.int(0, LAYOUT.streetZ.length - 2);
    const inset = 1.6;
    const x0 = LAYOUT.streetX[i] + LAYOUT.roadHalf + inset;
    const x1 = LAYOUT.streetX[i + 1] - LAYOUT.roadHalf - inset;
    const z0 = LAYOUT.streetZ[j] + LAYOUT.roadHalf + inset;
    const z1 = LAYOUT.streetZ[j + 1] - LAYOUT.roadHalf - inset;
    this.corners = [
      { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
    ];
    this.cornerIndex = rng.int(0, 3);
    const start = this.corners[this.cornerIndex];
    this.mesh.position.set(start.x + rng.range(-3, 3), 0, start.z + rng.range(-3, 3));
    this.speed = rng.range(1.15, 1.8);
    this.walkPhase = rng.range(0, 6);
    this.state = 'walk'; // 'walk' | 'down' | 'dive'
    this.stateTime = 0;
    this.diveDir = { x: 0, z: 0 };
    this.heading = 0;
    scene.add(this.mesh);
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }

  knockDown() {
    if (this.state === 'down') return false;
    this.state = 'down';
    this.stateTime = 0;
    return true;
  }

  update(dt, cars) {
    this.stateTime += dt;
    if (this.state === 'down') {
      this.mesh.rotation.x = Math.min(Math.PI / 2, this.mesh.rotation.x + dt * 7);
      this.mesh.position.y = 0.12;
      if (this.stateTime > 9) {
        this.state = 'walk';
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
      }
      return;
    }
    // Dive away from a fast car bearing down on us.
    if (this.state === 'walk') {
      for (const car of cars) {
        if (Math.abs(car.speed) < 6) continue;
        const dx = this.x - car.x;
        const dz = this.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 5.2 && dist > 0.01) {
          const f = car.forward();
          const toward = -(dx * f.x + dz * f.z); // positive when the car comes at us
          if (toward > 0.5) {
            this.state = 'dive';
            this.stateTime = 0;
            const side = (dx * f.z - dz * f.x) > 0 ? 1 : -1;
            this.diveDir = { x: f.z * side, z: -f.x * side };
            break;
          }
        }
      }
    }
    if (this.state === 'dive') {
      this.mesh.position.x += this.diveDir.x * 6.5 * dt;
      this.mesh.position.z += this.diveDir.z * 6.5 * dt;
      this.mesh.position.y = Math.abs(Math.sin(this.stateTime * 14)) * 0.24;
      if (this.stateTime > 0.42) {
        this.state = 'walk';
        this.mesh.position.y = 0;
      }
      return;
    }
    // Stroll to the next corner.
    const target = this.corners[this.cornerIndex];
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      this.cornerIndex = (this.cornerIndex + 1) % this.corners.length;
      return;
    }
    const desired = Math.atan2(dx, dz);
    let diff = desired - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * Math.min(1, dt * 8);
    this.mesh.position.x += Math.sin(this.heading) * this.speed * dt;
    this.mesh.position.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    this.walkPhase += dt * this.speed * 3.4;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
    this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.045;
  }
}

export class PedestrianSystem {
  constructor(scene, rng) {
    this.peds = [];
    for (let i = 0; i < 22; i++) this.peds.push(new Pedestrian(scene, rng));
  }

  // Adds one pedestrian on a chosen block's sidewalk at an exact spot,
  // already walking toward the given corner (used to dress set scenes).
  addAt(scene, rng, block, x, z, cornerIndex) {
    const ped = new Pedestrian(scene, rng, block);
    ped.mesh.position.set(x, 0, z);
    ped.cornerIndex = cornerIndex;
    this.peds.push(ped);
    return ped;
  }

  update(dt, cars) {
    for (const ped of this.peds) ped.update(dt, cars);
  }
}
