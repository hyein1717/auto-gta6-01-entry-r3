// player.js — Rey Salmar himself: a low-poly wheelman who walks, sprints,
// and drives. On foot he is moved by the camera-relative input axes and
// collides with buildings and cars; in a car he hands the arcade drive model
// his throttle and steering and hides inside it. `velocity` always reflects
// his real movement (foot or car) because the police aim by it.

import * as THREE from 'three';
import { collideCircle } from './city.js';

const WALK_SPEED = 5.4;
const SPRINT_SPEED = 8.8;

function buildReyMesh() {
  const rey = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xd8622a, roughness: 0.85 }); // burnt-orange jacket
  const skin = new THREE.MeshStandardMaterial({ color: 0xa06a3b, roughness: 0.75 });
  const denim = new THREE.MeshStandardMaterial({ color: 0x2e4055, roughness: 0.95 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.6, 3, 8), jacket);
  torso.position.y = 1.02;
  torso.castShadow = true;
  rey.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
  head.position.y = 1.66;
  rey.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0x20303c, roughness: 0.9 }));
  cap.position.y = 1.79;
  rey.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.16), cap.material);
  brim.position.set(0, 1.76, 0.2);
  rey.add(brim);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.11), jacket);
  armL.position.set(-0.33, 1.08, 0);
  rey.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.33;
  rey.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), denim);
  legL.position.set(-0.11, 0.28, 0);
  rey.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.11;
  rey.add(legR);
  rey.userData = { legL, legR, armL, armR };
  return rey;
}

export class Player {
  constructor(scene, x, z) {
    this.mesh = buildReyMesh();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.heading = Math.PI; // face north, toward the café district
    this.vehicle = null;
    this.velocity = { x: 0, z: 0 };
    this.walkPhase = 0;
    this.radius = 0.55;
    this.health = 100;
  }

  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  get onFoot() { return this.vehicle === null; }

  enterVehicle(car) {
    this.vehicle = car;
    car.driver = 'player';
    this.mesh.visible = false;
  }

  exitVehicle() {
    if (!this.vehicle) return;
    const car = this.vehicle;
    car.driver = null;
    car.speed = 0;
    this.vehicle = null;
    // Step out on the car's left side.
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.mesh.position.set(car.x + sideX * -2.1, 0, car.z + sideZ * -2.1);
    this.mesh.visible = true;
    this.heading = car.heading;
  }

  // On-foot movement. Returns nothing; collisions resolve inside.
  updateOnFoot(dt, input, camYaw, colliders, cars) {
    const axes = input.moveAxes();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    let mx = 0;
    let mz = 0;
    if (axes.forward !== 0 || axes.strafe !== 0) {
      // Camera-relative: the camera looks along (-sinYaw, -cosYaw), so W
      // walks away from the camera and D walks to the screen's right.
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      mx = -sin * axes.forward + cos * axes.strafe;
      mz = -cos * axes.forward - sin * axes.strafe;
      const len = Math.hypot(mx, mz) || 1;
      mx = (mx / len) * speed;
      mz = (mz / len) * speed;
      const desired = Math.atan2(mx, mz);
      let diff = desired - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 11);
    }
    this.velocity.x = mx;
    this.velocity.z = mz;
    this.mesh.position.x += mx * dt;
    this.mesh.position.z += mz * dt;
    collideCircle(this.mesh.position, this.radius, colliders, null);
    // Cars are solid to a pedestrian.
    for (const car of cars) {
      const dx = this.x - car.x;
      const dz = this.z - car.z;
      const dist = Math.hypot(dx, dz);
      const minDist = car.radius + this.radius - 0.3;
      if (dist > 0.001 && dist < minDist) {
        this.mesh.position.x += (dx / dist) * (minDist - dist);
        this.mesh.position.z += (dz / dist) * (minDist - dist);
      }
    }
    this.mesh.position.x = Math.max(-262, Math.min(302, this.x));
    this.mesh.position.z = Math.max(-186, Math.min(186, this.z));
    this.mesh.rotation.y = this.heading;

    const moving = Math.hypot(mx, mz) > 0.1;
    if (moving) {
      this.walkPhase += dt * (sprint ? 11 : 8.4);
      const swing = Math.sin(this.walkPhase) * 0.55;
      this.mesh.userData.legL.rotation.x = swing;
      this.mesh.userData.legR.rotation.x = -swing;
      this.mesh.userData.armL.rotation.x = -swing * 0.7;
      this.mesh.userData.armR.rotation.x = swing * 0.7;
      this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05;
    } else {
      this.mesh.userData.legL.rotation.x *= 0.8;
      this.mesh.userData.legR.rotation.x *= 0.8;
      this.mesh.userData.armL.rotation.x *= 0.8;
      this.mesh.userData.armR.rotation.x *= 0.8;
      this.mesh.position.y = 0;
    }
  }

  // While driving, keep the (hidden) player state in sync with the car.
  syncToVehicle() {
    if (!this.vehicle) return;
    const f = this.vehicle.forward();
    this.velocity.x = f.x * this.vehicle.speed;
    this.velocity.z = f.z * this.vehicle.speed;
    this.heading = this.vehicle.heading;
  }
}
