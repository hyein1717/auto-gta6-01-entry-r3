// traffic.js — Ember Bay's ambient traffic: cars that follow the street grid
// on the correct side of the road, turning at intersections, braking for the
// car ahead; plus the parked cars that line the kerbs waiting to be borrowed.
// Drivers steer toward a moving waypoint on their lane, which produces
// natural arcs through corners without any pathfinding.

import { Car, randomCarColor } from './vehicles.js';
import { LAYOUT } from './city.js';

const LANE = 4.5; // lane offset from a street centre line (right-hand traffic)

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Shared steering controller: returns a drive input that takes `car` toward
// (tx, tz) at up to cruiseSpeed. Used by traffic and (hotter) by police.
export function steerToward(car, tx, tz, cruiseSpeed, aggression = 1) {
  const desired = Math.atan2(tx - car.x, tz - car.z);
  const diff = wrapAngle(desired - car.heading);
  const steer = Math.max(-1, Math.min(1, diff * 1.7 * aggression));
  const dist = Math.hypot(tx - car.x, tz - car.z);
  let target = cruiseSpeed * Math.max(0.3, 1.15 - Math.abs(diff) * 0.55);
  if (dist < 6) target = Math.min(target, cruiseSpeed * 0.5);
  let throttle = 0;
  if (car.speed < target) throttle = 0.9;
  else if (car.speed > target + 2.5) throttle = -0.55;
  return { throttle, steer, handbrake: false };
}

class TrafficDriver {
  constructor(car, rng) {
    this.car = car;
    this.rng = rng;
    this.cruise = rng.range(10, 13.5);
    this.target = null;
    this.leg = null;
    this.planLeg(true);
  }

  // Choose a leg: a street, a direction, and a waypoint on the correct lane.
  planLeg(first = false) {
    const { streetX, streetZ } = LAYOUT;
    const car = this.car;
    let axis;
    let line;
    let dirSign;
    if (first || !this.leg) {
      axis = this.rng.chance(0.5) ? 'z' : 'x';
      line = axis === 'z' ? this.rng.pick(streetX) : this.rng.pick(streetZ);
      dirSign = this.rng.chance(0.5) ? 1 : -1;
      // Snap the car onto its lane.
      if (axis === 'z') car.mesh.position.x = line + (dirSign > 0 ? -LANE : LANE);
      else car.mesh.position.z = line + (dirSign > 0 ? LANE : -LANE);
      car.heading = axis === 'z' ? (dirSign > 0 ? 0 : Math.PI) : (dirSign > 0 ? Math.PI / 2 : -Math.PI / 2);
    } else {
      // Continue from the intersection we just reached: maybe turn.
      const at = this.leg.endCoord;
      const crossLine = this.leg.axis === 'z'
        ? streetX.reduce((best, v) => (Math.abs(v - car.x) < Math.abs(best - car.x) ? v : best), streetX[0])
        : streetZ.reduce((best, v) => (Math.abs(v - car.z) < Math.abs(best - car.z) ? v : best), streetZ[0]);
      const roll = this.rng.next();
      if (roll < 0.45) {
        axis = this.leg.axis === 'z' ? 'x' : 'z';
        line = at; // the street we were crossing becomes the street we drive
        dirSign = this.rng.chance(0.5) ? 1 : -1;
        void crossLine;
      } else {
        axis = this.leg.axis;
        line = this.leg.line;
        dirSign = this.leg.dirSign;
      }
    }
    this.leg = { axis, line, dirSign };
    this.leg.endCoord = this.findLegEnd();
    this.updateTarget();
  }

  findLegEnd() {
    const car = this.car;
    const crosses = this.leg.axis === 'z' ? LAYOUT.streetZ : LAYOUT.streetX;
    const pos = this.leg.axis === 'z' ? car.z : car.x;
    let best = null;
    let bestAhead = Infinity;
    for (const c of crosses) {
      const ahead = (c - pos) * this.leg.dirSign;
      if (ahead > 14 && ahead < bestAhead) {
        best = c;
        bestAhead = ahead;
      }
    }
    if (best === null) best = this.leg.dirSign > 0 ? 178 : -178;
    return best;
  }

  updateTarget() {
    const car = this.car;
    const { axis, line, dirSign, endCoord } = this.leg;
    if (axis === 'z') {
      this.target = { x: line + (dirSign > 0 ? -LANE : LANE), z: endCoord };
    } else {
      this.target = { x: endCoord, z: line + (dirSign > 0 ? LANE : -LANE) };
    }
  }

  update(dt, allCars, colliders) {
    const car = this.car;
    const pos = this.leg.axis === 'z' ? car.z : car.x;
    if ((this.leg.endCoord - pos) * this.leg.dirSign < 7) {
      this.planLeg();
    }
    let input = steerToward(car, this.target.x, this.target.z, this.cruise);
    // Brake for a slower vehicle ahead in our lane.
    const f = car.forward();
    for (const other of allCars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (ahead > 0 && ahead < 8.5 && side < 1.9) {
        if (car.speed > other.speed + 0.5) input = { throttle: -0.7, steer: input.steer, handbrake: false };
        else input = { throttle: 0, steer: input.steer, handbrake: false };
        break;
      }
    }
    return car.drive(dt, input, colliders);
  }
}

export class TrafficSystem {
  constructor(scene, rng, colliders) {
    this.cars = [];
    this.drivers = [];
    this.colliders = colliders;
    const kinds = ['sedan', 'sedan', 'sedan', 'taxi', 'sport'];
    for (let i = 0; i < 9; i++) {
      const kind = kinds[i % kinds.length];
      const color = kind === 'taxi' ? 0xf2b705 : randomCarColor(rng);
      const car = new Car(scene, color, kind, {
        x: rng.range(-200, 200),
        z: rng.range(-160, 160),
      });
      car.driver = 'traffic';
      this.cars.push(car);
      this.drivers.push(new TrafficDriver(car, rng));
    }
    // Parked cars along the kerbs.
    for (let i = 0; i < 13; i++) {
      const vertical = rng.chance(0.55);
      const kind = rng.chance(0.16) ? 'sport' : 'sedan';
      const color = randomCarColor(rng);
      let x;
      let z;
      let heading;
      if (vertical) {
        const sx = rng.pick(LAYOUT.streetX);
        const side = rng.chance(0.5) ? -1 : 1;
        x = sx + side * (LAYOUT.roadHalf - 2.1);
        z = rng.range(LAYOUT.cityMinZ + 24, LAYOUT.cityMaxZ - 24);
        heading = side < 0 ? Math.PI : 0;
      } else {
        const sz = rng.pick(LAYOUT.streetZ);
        const side = rng.chance(0.5) ? -1 : 1;
        z = sz + side * (LAYOUT.roadHalf - 2.1);
        x = rng.range(LAYOUT.cityMinX + 24, LAYOUT.cityMaxX - 24);
        heading = side < 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      const car = new Car(scene, color, kind, { x, z, heading });
      car.driver = null;
      this.cars.push(car);
    }
  }

  update(dt, extraCars) {
    const all = extraCars ? this.cars.concat(extraCars) : this.cars;
    for (const driver of this.drivers) {
      driver.update(dt, all, this.colliders);
    }
  }
}

// Places one specific parked car (used for Rey's own sedan and the gold
// Vantara that mission 2 revolves around).
export function placeParkedCar(scene, { x, z, heading, color, kind = 'sedan' }) {
  const car = new Car(scene, color, kind, { x, z, heading });
  car.driver = null;
  return car;
}
