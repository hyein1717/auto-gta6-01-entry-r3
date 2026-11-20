// main.js — boots Ember Bay and runs the loop: builds the city, wires the
// player, traffic, pedestrians, police and Madame Ora's missions together,
// owns the wanted/health/cash state, the camera, and the deterministic
// screenshot scenes (?shot=cover|chase|mission|foot&seed=1).

import * as THREE from 'three';
import { createRng } from './rng.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { buildCity, LAYOUT } from './city.js';
import { Car, collideCars } from './vehicles.js';
import { TrafficSystem, placeParkedCar } from './traffic.js';
import { PedestrianSystem } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { Player } from './player.js';
import { MissionSystem, goldCarSpot } from './missions.js';
import { Hud } from './hud.js';

const SAVE_KEY = 'ember-bay-save-v1';
const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') ?? (shotMode ? 1 : 7)) || 1;
const rng = createRng(seed);

// ---------- renderer / scene ----------
const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(shotMode ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2600);
camera.position.set(-140, 60, -160);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- world ----------
const { colliders, waterTex } = buildCity(scene, rng);
const input = new Input(canvas);
const sound = new SoundBank();
const hud = new Hud();

const traffic = new TrafficSystem(scene, rng, colliders);
const pedestrians = new PedestrianSystem(scene, rng);
const police = new PoliceSystem(scene, rng, colliders);
const player = new Player(scene, -104, -34);
player.heading = 0;

// Rey's own sun-faded teal sedan, parked by his flat — no crime for taking it.
const ownCar = placeParkedCar(scene, { x: -96, z: -25, heading: 0.5, color: 0x2a9d8f, kind: 'sedan' });
ownCar.isOwn = true;
// The gold Vantara that job 2 revolves around.
const goldSpot = goldCarSpot();
const goldCar = placeParkedCar(scene, { x: goldSpot.x, z: goldSpot.z, heading: Math.PI, color: 0xd8a920, kind: 'sport' });
goldCar.isGold = true;
const looseCars = [ownCar, goldCar];

// ---------- game state ----------
const state = {
  mode: 'menu', // 'menu' | 'playing' | 'paused' | 'wasted'
  cash: 120,
  wanted: { level: 0 },
  elapsed: 0,
  lastDamageAt: -99,
  crimeCooldown: 0,
  hitInvulnUntil: 0,
  started: false,
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash === 'number') state.cash = save.cash;
    return save;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: Math.floor(state.cash),
      jobsDone: missions.jobsDone,
      chainIndex: missions.chainIndex,
    }));
  } catch { /* private mode: progress simply does not persist */ }
}

const missions = new MissionSystem(scene, {
  sound,
  toast: (text, ms) => hud.toast(text, ms),
  onCash: (amount, label) => {
    state.cash += amount;
    hud.toast(label, 3200);
    saveGame();
  },
  onWantedAtLeast: (n) => {
    state.wanted.level = Math.max(state.wanted.level, n);
  },
});
missions.setGoldCar(goldCar);

const save = loadSave();
if (save) {
  if (typeof save.chainIndex === 'number') missions.chainIndex = Math.min(3, save.chainIndex);
  if (typeof save.jobsDone === 'number') missions.jobsDone = save.jobsDone;
  hud.setSaveLine(`Welcome back, Rey — $${state.cash.toLocaleString('en-US')} in your pocket, ${missions.jobsDone} job${missions.jobsDone === 1 ? '' : 's'} done.`);
} else {
  hud.setSaveLine('New game — Rey starts with $120 and a full tank of nerve.');
}
hud.setCash(state.cash);

// Rey's driven car gets a real headlight beam at dusk; it is attached to
// whichever car he is driving and removed when he steps out.
const headlightBeam = new THREE.SpotLight(0xffd9a8, 0, 42, 0.62, 0.5, 1.2);
headlightBeam.position.set(0, 1.1, 1.6);
const headlightTarget = new THREE.Object3D();
headlightTarget.position.set(0, 0.2, 18);
scene.add(headlightTarget);
headlightBeam.target = headlightTarget;
scene.add(headlightBeam);
let headlightHost = null;

function syncHeadlight() {
  const car = player.vehicle;
  if (car === headlightHost) return;
  if (headlightHost) {
    headlightHost.mesh.remove(headlightBeam);
    headlightHost.mesh.remove(headlightTarget);
  }
  headlightHost = car;
  if (car) {
    car.mesh.add(headlightBeam);
    car.mesh.add(headlightTarget);
    headlightBeam.intensity = 260;
  }
}

// ---------- crimes, damage, endings ----------
function addCrime(kind) {
  if (kind === 'theft') {
    state.wanted.level = Math.min(5, state.wanted.level + 1);
    hud.toast('The bay saw that. Wanted level up.', 1800);
  } else if (kind === 'pedHit') {
    state.wanted.level = Math.min(5, state.wanted.level + 1);
  } else if (kind === 'carHit' && state.crimeCooldown <= 0) {
    state.wanted.level = Math.min(5, state.wanted.level + 0.5);
    state.crimeCooldown = 2.5;
  }
}

function damage(amount) {
  if (state.mode !== 'playing') return;
  player.health -= amount;
  state.lastDamageAt = state.elapsed;
  if (player.health <= 0) {
    player.health = 0;
    endRun('WRECKED', 'The bay spits you back out. Hospital bill: $150.', 150);
  }
}

function endRun(title, text, fine) {
  state.mode = 'wasted';
  state.cash = Math.max(0, state.cash - fine);
  hud.setCash(state.cash);
  hud.showWasted(title, text);
  sound.setEngine(0, false);
  sound.setSiren(0, false);
  saveGame();
}

function respawn() {
  hud.hideWasted();
  if (player.vehicle) player.exitVehicle();
  player.health = 100;
  state.wanted.level = 0;
  for (const unit of [...police.units]) police.removeUnit(unit);
  player.mesh.position.set(-104, 0, -34);
  player.heading = 0;
  state.mode = 'playing';
}

// ---------- overlays / starting ----------
document.getElementById('startScreen').addEventListener('click', () => {
  sound.unlock();
  if (state.mode === 'menu') startGame();
});
document.getElementById('resumeBtn').addEventListener('click', () => togglePause(false));
document.getElementById('respawnBtn').addEventListener('click', () => respawn());

function startGame() {
  state.mode = 'playing';
  state.started = true;
  hud.hideStart();
  hud.showHud();
  hud.toast('Madame Ora has work for you. Follow the gold marker.', 3600);
  missions.startNextJob(rng);
}

function togglePause(force) {
  if (state.mode !== 'playing' && state.mode !== 'paused') return;
  const toPause = force !== undefined ? force : state.mode === 'playing';
  state.mode = toPause ? 'paused' : 'playing';
  hud.setPaused(toPause);
  if (toPause) {
    sound.setEngine(0, false);
    sound.setSiren(0, false);
  }
}

// ---------- per-frame helpers ----------
function allCars() {
  const list = [...traffic.cars, ...looseCars, ...police.units];
  return list;
}

function nearestEnterableCar() {
  let best = null;
  let bestDist = 3.6;
  for (const car of allCars()) {
    if (car.driver !== null || car.wrecked) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

function carDisplayName(car) {
  if (car.isOwn) return 'your sedan';
  if (car.isGold) return 'the gold Vantara';
  if (car.kind === 'taxi') return 'the taxi';
  if (car.kind === 'sport') return 'the sports car';
  if (car.kind === 'police') return 'the patrol car';
  return 'the car';
}

function handleEnterExit() {
  if (player.onFoot) {
    const car = nearestEnterableCar();
    if (!car) return;
    if (!car.isOwn && !car.stolenByPlayer) {
      car.stolenByPlayer = true;
      addCrime('theft');
    }
    player.enterVehicle(car);
    hud.showPrompt(null);
  } else {
    player.exitVehicle();
  }
}

function updatePlayer(dt) {
  if (player.onFoot) {
    player.updateOnFoot(dt, input, input.camYaw, colliders, allCars());
    hud.setSpeed(null);
    // Context prompt for getting into a car.
    const car = nearestEnterableCar();
    hud.showPrompt(car ? `Press <b>E</b> to enter ${carDisplayName(car)}` : null);
    if (input.pressed('KeyE')) handleEnterExit();
    return;
  }
  const car = player.vehicle;
  const axes = input.moveAxes();
  const driveInput = {
    throttle: axes.forward,
    steer: -axes.strafe,
    handbrake: input.down('Space'),
  };
  const impact = car.drive(dt, driveInput, colliders);
  player.syncToVehicle();
  hud.setSpeed(Math.abs(car.speed) * 3.6);
  hud.showPrompt(Math.abs(car.speed) < 1.6 ? 'Press <b>E</b> to get out' : null);
  if (impact > 5) sound.crash(impact);
  if (impact > 9.5) damage((impact - 8.5) * 1.35);
  if (input.pressed('KeyH')) sound.horn();
  if (input.pressed('KeyE') && Math.abs(car.speed) < 2.2) handleEnterExit();
}

function updateCollisions(dt) {
  const cars = allCars();
  // Car vs car.
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.driver === null && b.driver === null) continue;
      const impact = collideCars(a, b);
      if (impact > 5) {
        const playerInvolved = player.vehicle && (a === player.vehicle || b === player.vehicle);
        if (playerInvolved) {
          sound.crash(impact);
          addCrime('carHit');
          if (impact > 10) damage((impact - 9) * 1.1);
        }
      }
    }
  }
  // Cars vs pedestrians, and cars vs Rey on foot.
  const playerCar = player.vehicle;
  for (const ped of pedestrians.peds) {
    if (ped.state === 'down') continue;
    for (const car of cars) {
      if (Math.abs(car.speed) < 5) continue;
      const d = Math.hypot(ped.x - car.x, ped.z - car.z);
      if (d < 1.5) {
        if (ped.knockDown()) {
          if (car === playerCar) {
            addCrime('pedHit');
            damage(2);
            car.speed *= 0.55;
            hud.toast('You hit a pedestrian!', 1800);
          }
        }
        break;
      }
    }
    if (player.onFoot && state.elapsed > state.hitInvulnUntil) {
      for (const car of cars) {
        if (car.driver === null || Math.abs(car.speed) < 4.5) continue;
        const d = Math.hypot(player.x - car.x, player.z - car.z);
        if (d < 1.7) {
          damage(20);
          state.hitInvulnUntil = state.elapsed + 1.2;
          const away = Math.atan2(player.x - car.x, player.z - car.z);
          player.mesh.position.x += Math.sin(away) * 2.4;
          player.mesh.position.z += Math.cos(away) * 2.4;
          sound.crash(6);
          break;
        }
      }
    }
  }
}

function updateCamera(dt) {
  if (shotCamera) {
    shotCamera.apply(camera, dt);
    return;
  }
  if (state.mode === 'menu') {
    const t = state.elapsed * 0.05;
    camera.position.set(Math.sin(t) * 150, 52, Math.cos(t) * 150);
    camera.lookAt(20, 8, 0);
    return;
  }
  const target = player.vehicle ? player.vehicle.mesh.position : player.mesh.position;
  const focusY = player.vehicle ? 1.1 : 1.7;
  if (player.vehicle && Math.abs(player.vehicle.speed) > 3 && !input.dragging) {
    const behind = player.vehicle.heading + Math.PI;
    let diff = behind - input.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    input.camYaw += diff * Math.min(1, dt * 1.5);
  }
  const dist = player.vehicle ? 11.5 : input.camDist;
  const pitch = input.camPitch;
  const desired = new THREE.Vector3(
    target.x + Math.sin(input.camYaw) * Math.cos(pitch) * dist,
    target.y + focusY + Math.sin(pitch) * dist,
    target.z + Math.cos(input.camYaw) * Math.cos(pitch) * dist,
  );
  desired.y = Math.max(desired.y, 1.2);
  const blend = 1 - Math.exp(-dt * 6.5);
  camera.position.lerp(desired, blend);
  const look = new THREE.Vector3(target.x, target.y + focusY, target.z);
  if (player.vehicle) {
    const f = player.vehicle.forward();
    look.x += f.x * 4;
    look.z += f.z * 4;
  }
  camera.lookAt(look);
}

function refreshHud() {
  hud.setCash(state.cash);
  hud.setHealth(player.health);
  hud.setWanted(state.wanted.level);
  const objective = missions.objectiveForHud();
  if (objective && state.mode === 'playing') {
    hud.setObjective(objective.title, objective.text, objective.timer);
  } else {
    hud.clearObjective();
  }
  const playerPos = player.vehicle ? player.vehicle.mesh.position : player.mesh.position;
  hud.drawMinimap({
    playerPos,
    playerHeading: player.heading,
    police: police.units,
    target: missions.targetForMinimap(),
  });
}

// ---------- screenshot scenes ----------
let shotCamera = null;
let shotDrive = null;

function setupShot(name) {
  state.mode = 'playing';
  state.started = true;
  hud.hideStart();
  hud.showHud();
  state.cash = 2750;
  hud.setCash(state.cash);

  if (name === 'cover') {
    const hero = placeParkedCar(scene, { x: 249, z: 93, heading: -0.55, color: 0xc23b2e, kind: 'sport' });
    looseCars.push(hero);
    player.mesh.position.set(244.5, 0, 88.5);
    player.heading = -2.25;
    player.mesh.rotation.y = player.heading;
    missions.startNextJob(rng);
    shotCamera = {
      apply(cam) {
        cam.position.set(235.5, 3.1, 101);
        cam.lookAt(248, 2.3, 90);
      },
    };
  } else if (name === 'chase') {
    const sedan = placeParkedCar(scene, { x: 71.5, z: 34, heading: 0, color: 0x2e6fc2, kind: 'sedan' });
    looseCars.push(sedan);
    player.enterVehicle(sedan);
    sedan.speed = 15;
    state.wanted.level = 3;
    const copA = police.spawnUnit(player.mesh.position);
    copA.mesh.position.set(74.5, 0, 12);
    copA.heading = 0;
    copA.speed = 14;
    const copB = police.spawnUnit(player.mesh.position);
    copB.mesh.position.set(67.5, 0, -4);
    copB.heading = 0.15;
    copB.speed = 13;
    shotDrive = () => ({ throttle: 0.55, steer: Math.sin(state.elapsed * 0.4) * 0.04, handbrake: false });
    shotCamera = {
      // Three-quarter view from ahead-side: Rey's car coming at the camera,
      // the patrol cars filling the road behind it.
      apply(cam) {
        const car = player.vehicle;
        const f = car.forward();
        const side = { x: f.z, z: -f.x };
        cam.position.set(
          car.x + f.x * 10 + side.x * 7,
          3.9,
          car.z + f.z * 10 + side.z * 7,
        );
        cam.lookAt(car.x - f.x * 6, 1.1, car.z - f.z * 6);
      },
    };
  } else if (name === 'mission') {
    missions.poseForShot(rng);
    ownCar.mesh.position.set(-64, 0, -6); // keep Rey's sedan out of the frame
    player.mesh.position.set(-104, 0, -40);
    player.heading = Math.atan2(-121 - -104, -50 - -40);
    player.mesh.rotation.y = player.heading;
    shotCamera = {
      apply(cam) {
        cam.position.set(-90, 2.9, -27);
        cam.lookAt(-120, 2.4, -50);
      },
    };
  } else if (name === 'foot') {
    missions.startNextJob(rng);
    player.mesh.position.set(0, 0, 66.5);
    player.heading = 2.3;
    player.mesh.rotation.y = player.heading;
    // Two locals stroll the same sidewalk so the street feels lived in.
    pedestrians.addAt(scene, rng, { i: 3, j: 2 }, 8, 65.4, 2);
    pedestrians.addAt(scene, rng, { i: 3, j: 2 }, 20, 65.4, 3);
    // Scripted traffic: a sedan rolls south past the corner while another
    // approaches head-on down the avenue, headlights lit.
    const cruiser = placeParkedCar(scene, { x: -4.5, z: 14, heading: 0, color: 0x3fae6a, kind: 'sedan' });
    cruiser.driver = 'traffic';
    cruiser.speed = 11;
    looseCars.push(cruiser);
    const oncoming = placeParkedCar(scene, { x: 55, z: 71.5, heading: -Math.PI / 2, color: 0x2e6fc2, kind: 'sedan' });
    oncoming.driver = 'traffic';
    oncoming.speed = 11;
    looseCars.push(oncoming);
    shotDrive = (car) => (car === cruiser || car === oncoming ? { throttle: 0.5, steer: 0, handbrake: false } : null);
    shotCamera = {
      // Down the avenue: Rey and the locals in front, traffic approaching.
      apply(cam) {
        cam.position.set(-14, 2.4, 79);
        cam.lookAt(16, 1.2, 69);
      },
    };
  }
}

if (shotMode) setupShot(shotMode);

// ---------- the loop ----------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.elapsed += dt;
  state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);

  if (input.pressed('KeyP') || input.pressed('Escape')) {
    if (state.mode === 'playing' || state.mode === 'paused') togglePause();
  }

  const worldLive = state.mode === 'playing' || state.mode === 'menu';
  if (worldLive) {
    waterTex.offset.x += dt * 0.01;
    waterTex.offset.y += dt * 0.004;
    traffic.update(dt, police.units);
    pedestrians.update(dt, allCars());
  }

  if (state.mode === 'playing') {
    if (shotMode === 'chase' && player.vehicle && shotDrive) {
      const impact = player.vehicle.drive(dt, shotDrive(), colliders);
      if (impact > 5) sound.crash(impact);
      player.syncToVehicle();
      hud.setSpeed(Math.abs(player.vehicle.speed) * 3.6);
    } else if (shotMode === 'foot' && shotDrive) {
      for (const car of looseCars) {
        const inputForCar = shotDrive(car);
        if (inputForCar) car.drive(dt, inputForCar, colliders);
      }
      player.updateOnFoot(0, input, input.camYaw, colliders, []);
    } else if (!shotMode) {
      updatePlayer(dt);
    } else {
      // Static posed shots: keep Rey's idle pose in sync.
      player.updateOnFoot(0, input, input.camYaw, colliders, []);
    }

    syncHeadlight();
    const bust = police.update(dt, player, state.wanted);
    if (bust === 'busted') {
      endRun('BUSTED', 'Ember Bay PD walks you to the station. Fine: $200.', 200);
    }
    missions.update(dt, {
      pos: player.vehicle ? player.vehicle.mesh.position : player.mesh.position,
      vehicle: player.vehicle,
    }, rng);
    updateCollisions(dt);

    // Slow health regen once the heat is off.
    if (player.health > 0 && player.health < 100 && state.elapsed - state.lastDamageAt > 6) {
      player.health = Math.min(100, player.health + dt * 2.6);
    }

    // Sound follows the action.
    if (player.vehicle) {
      sound.setEngine(Math.abs(player.vehicle.speed) / player.vehicle.maxSpeed, true);
    } else {
      sound.setEngine(0, false);
    }
    const playerPos = player.vehicle ? player.vehicle.mesh.position : player.mesh.position;
    sound.setSiren(police.nearestDistance(playerPos), police.units.length > 0);

    refreshHud();
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}

tick();
