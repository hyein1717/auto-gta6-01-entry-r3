// police.js — the Ember Bay PD. Patrol units spawn on streets near the
// player when the wanted level rises, chase and ram, and give up when the
// player stays out of sight long enough for the wanted level to cool. If they
// pin a stationary player — in a car or on foot — the bust timer fills and
// the run ends.

import { Car } from './vehicles.js';
import { steerToward } from './traffic.js';
import { LAYOUT } from './city.js';

const SIGHT_RANGE = 64;
const GIVE_UP_AFTER = 8; // seconds unseen before the heat starts cooling

export class PoliceSystem {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.units = [];
    this.unseenTime = 0;
    this.bustTime = 0;
    this.flashPhase = 0;
  }

  desiredUnits(wanted) {
    if (wanted < 0.6) return 0;
    return Math.min(4, Math.max(1, Math.round(wanted)));
  }

  spawnUnit(playerPos) {
    // Come from a street intersection a good distance away, never on top of
    // the player.
    let best = null;
    let bestScore = -Infinity;
    for (const sx of LAYOUT.streetX) {
      for (const sz of LAYOUT.streetZ) {
        const d = Math.hypot(sx - playerPos.x, sz - playerPos.z);
        const score = -Math.abs(d - 88) + this.rng.range(0, 14);
        if (d > 45 && score > bestScore) {
          bestScore = score;
          best = { x: sx, z: sz };
        }
      }
    }
    if (!best) best = { x: 0, z: -152 };
    const unit = new Car(this.scene, 0x1d2126, 'police', { x: best.x, z: best.z, heading: this.rng.range(0, Math.PI * 2) });
    unit.driver = 'police';
    this.units.push(unit);
    return unit;
  }

  removeUnit(unit) {
    this.scene.remove(unit.mesh);
    this.units.splice(this.units.indexOf(unit), 1);
  }

  // wanted is a mutable { level } box owned by main.js so decay here is
  // visible everywhere. Returns 'busted' when the bust timer completes.
  update(dt, player, wanted) {
    const playerPos = player.vehicle ? player.vehicle.mesh.position : player.mesh.position;
    const want = this.desiredUnits(wanted.level);
    while (this.units.length < want) this.spawnUnit(playerPos);
    while (this.units.length > want && this.units.length > 0) {
      // Retire the farthest unit once it is well away; otherwise let it leave.
      const far = this.units[this.units.length - 1];
      if (Math.hypot(far.x - playerPos.x, far.z - playerPos.z) > 120) this.removeUnit(far);
      else break;
    }

    let nearest = Infinity;
    let anySeen = false;
    for (const unit of this.units) {
      const dist = Math.hypot(unit.x - playerPos.x, unit.z - playerPos.z);
      nearest = Math.min(nearest, dist);
      if (dist < SIGHT_RANGE) anySeen = true;
      const cruise = unit.kind === 'police' ? 41 : 38;
      // Aim slightly ahead of a moving target so intercepts actually happen.
      const lead = player.vehicle ? Math.min(0.55, dist / 90) : 0.15;
      const tx = playerPos.x + player.velocity.x * lead * 10 * 0.1;
      const tz = playerPos.z + player.velocity.z * lead * 10 * 0.1;
      const input = steerToward(unit, tx, tz, cruise, 1.25);
      unit.drive(dt, input, this.colliders);
      if (dist > 340) this.removeUnit(unit);
    }

    if (anySeen || wanted.level === 0) {
      this.unseenTime = 0;
    } else if (this.units.length > 0) {
      this.unseenTime += dt;
      if (this.unseenTime > GIVE_UP_AFTER) {
        wanted.level = Math.max(0, wanted.level - dt * 0.085);
      }
    }

    // Bust: a unit right on top of a nearly stationary player.
    const playerSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    if (wanted.level >= 1 && nearest < 4.6 && playerSpeed < 1.1 && this.units.length > 0) {
      this.bustTime += dt;
      if (this.bustTime > 2.6) {
        this.bustTime = 0;
        return 'busted';
      }
    } else {
      this.bustTime = Math.max(0, this.bustTime - dt * 1.6);
    }
    return null;
  }

  nearestDistance(playerPos) {
    let nearest = Infinity;
    for (const unit of this.units) {
      nearest = Math.min(nearest, Math.hypot(unit.x - playerPos.x, unit.z - playerPos.z));
    }
    return nearest;
  }
}
