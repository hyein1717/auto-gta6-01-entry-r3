// missions.js — Madame Ora's work. A chain of three story jobs for Rey
// Salmar (a timed package run, a stolen gold Vantara, a three-star getaway
// to the lighthouse hideout), then endlessly repeatable courier errands.
// Each job is a list of stages; a stage is a place to reach (sometimes in a
// specific car, sometimes against a clock) watched over by a golden marker
// pillar that also appears on the minimap.

import * as THREE from 'three';

const CAFE_PICKUP = { x: -121, z: -50 };
const PIER_DELIVERY = { x: 268, z: 108 };
const GOLD_CAR_SPOT = { x: 82.9, z: -120 }; // kerbside on the x=76 street
const GARAGE_DROPOFF = { x: -163, z: 38 };
const HIDEOUT = { x: 272, z: -148 };

export function goldCarSpot() {
  return GOLD_CAR_SPOT;
}

function buildMarker() {
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 34, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffc81e, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  pillar.position.y = 17;
  group.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.85),
    new THREE.MeshStandardMaterial({ color: 0xffc81e, emissive: 0xffa812, emissiveIntensity: 1.8, roughness: 0.3 }),
  );
  diamond.position.y = 5.4;
  group.add(diamond);
  group.userData = { diamond, ring };
  group.visible = false;
  return group;
}

export class MissionSystem {
  // hooks: { onCash(amount, label), onWantedAtLeast(n), onCrime(kind), sound }
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.marker = buildMarker();
    scene.add(this.marker);
    this.goldCar = null; // wired in by main.js once the car exists
    this.chainIndex = 0;
    this.stageIndex = 0;
    this.state = 'idle'; // 'idle' | 'active' | 'between'
    this.betweenTime = 0;
    this.timer = null;
    this.jobsDone = 0;
    this.errandCount = 0;
    this.currentJob = null;
  }

  setGoldCar(car) {
    this.goldCar = car;
  }

  chainJobs() {
    return [
      {
        title: 'JOB 1 — FIRST RUN',
        reward: 450,
        stages: [
          { target: CAFE_PICKUP, radius: 6.5, text: 'Pick up the package outside Café Marina', arrive: 'pickup' },
          { target: PIER_DELIVERY, radius: 8, text: 'Deliver the package to the pier warehouse', timer: 150, arrive: 'dropoff' },
        ],
        intro: 'Madame Ora: "A package, Rey. Café Marina to the pier. Don\'t open it."',
      },
      {
        title: 'JOB 2 — BORROWED WHEELS',
        reward: 800,
        stages: [
          { target: GOLD_CAR_SPOT, radius: 6, text: 'Steal the gold Vantara by the Meridian Hotel', needGoldCar: true, arrive: 'steal' },
          { target: GARAGE_DROPOFF, radius: 8.5, text: 'Bring the Vantara to Ora\'s garage', needGoldCar: true, arrive: 'dropoff' },
        ],
        intro: 'Madame Ora: "A gold Vantara, parked by the Meridian. It wants a new home."',
      },
      {
        title: 'JOB 3 — HOT EXIT',
        reward: 1500,
        stages: [
          { target: HIDEOUT, radius: 10, text: 'Reach the lighthouse hideout — the whole bay is watching', timer: 130, arrive: 'dropoff', heatOnStart: 3 },
        ],
        intro: 'Madame Ora: "Last one, Rey. Every cop in Ember Bay knows your face tonight."',
      },
    ];
  }

  makeErrand(rng) {
    const spots = [
      { x: -152, z: -140 }, { x: 8, z: -68 }, { x: 160, z: -8 }, { x: -68, z: 84 },
      { x: 84, z: 160 }, { x: -228, z: 12 }, { x: 236, z: -60 }, { x: 20, z: 168 },
    ];
    const a = spots[rng.int(0, spots.length - 1)];
    let b = spots[rng.int(0, spots.length - 1)];
    if (b === a) b = spots[(spots.indexOf(a) + 3) % spots.length];
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    return {
      title: `ORA'S ERRAND #${this.errandCount + 1}`,
      reward: Math.round(180 + dist * 1.15),
      stages: [
        { target: a, radius: 7, text: 'Pick up the package', arrive: 'pickup' },
        { target: b, radius: 8, text: 'Deliver the package', timer: Math.round(50 + dist / 3.4), arrive: 'dropoff' },
      ],
      intro: 'Madame Ora: "One more little run, Rey. The bay provides."',
    };
  }

  startNextJob(rng) {
    if (this.chainIndex < 3) {
      this.currentJob = this.chainJobs()[this.chainIndex];
    } else {
      this.currentJob = this.makeErrand(rng);
      this.errandCount++;
    }
    this.stageIndex = 0;
    this.state = 'active';
    this.beginStage();
    this.hooks.toast(this.currentJob.intro, 4200);
  }

  beginStage() {
    const stage = this.currentJob.stages[this.stageIndex];
    this.timer = stage.timer ?? null;
    if (stage.heatOnStart) this.hooks.onWantedAtLeast(stage.heatOnStart);
    this.marker.visible = true;
    this.placeMarker(stage);
  }

  placeMarker(stage) {
    const target = stage.needGoldCar && this.stageIndex === 0 && this.goldCar
      ? this.goldCar.mesh.position
      : stage.target;
    this.marker.position.set(target.x, 0, target.z);
    const s = stage.radius / 3.2;
    this.marker.scale.set(s, 1, s);
  }

  currentStage() {
    return this.currentJob ? this.currentJob.stages[this.stageIndex] : null;
  }

  objectiveForHud() {
    if (this.state !== 'active' || !this.currentJob) return null;
    const stage = this.currentStage();
    return { title: this.currentJob.title, text: stage.text, timer: this.timer };
  }

  targetForMinimap() {
    if (this.state !== 'active') return null;
    const stage = this.currentStage();
    if (stage.needGoldCar && this.stageIndex === 0 && this.goldCar) {
      return { x: this.goldCar.x, z: this.goldCar.z };
    }
    return stage.target;
  }

  completeJob() {
    const reward = this.currentJob.reward;
    this.jobsDone++;
    if (this.chainIndex < 3) this.chainIndex++;
    this.hooks.onCash(reward, `Job complete: +$${reward.toLocaleString('en-US')}`);
    this.hooks.sound.cashFanfare();
    this.state = 'between';
    this.betweenTime = 3.6;
    this.marker.visible = false;
    this.currentJob = null;
  }

  failJob(reason) {
    this.hooks.toast(reason, 3400);
    this.hooks.sound.failSting();
    this.state = 'between';
    this.betweenTime = 4.5;
    this.marker.visible = false;
    this.currentJob = null;
    // The chain does not advance on a failure: the same job is offered again.
  }

  // playerCtx: { pos:{x,z}, vehicle } — returns nothing; progress is via hooks.
  update(dt, playerCtx, rng) {
    // Bob and spin the marker diamond either way.
    if (this.marker.visible) {
      const t = performance.now() * 0.001;
      this.marker.userData.diamond.position.y = 5.4 + Math.sin(t * 2.2) * 0.5;
      this.marker.userData.diamond.rotation.y = t * 1.6;
    }
    if (this.state === 'between') {
      this.betweenTime -= dt;
      if (this.betweenTime <= 0) this.startNextJob(rng);
      return;
    }
    if (this.state !== 'active') return;
    const stage = this.currentStage();

    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.failJob('Out of time. Madame Ora is not pleased.');
        return;
      }
    }

    // The gold-car stage follows the car until Rey is actually driving it.
    if (stage.needGoldCar && this.stageIndex === 0) {
      this.placeMarker(stage);
      if (playerCtx.vehicle && playerCtx.vehicle === this.goldCar) {
        this.hooks.onWantedAtLeast(2);
        this.hooks.toast('The Vantara is yours. Ora\'s garage — go!', 3000);
        this.advanceStage();
      }
      return;
    }
    if (stage.needGoldCar && this.stageIndex > 0) {
      if (!(playerCtx.vehicle && playerCtx.vehicle === this.goldCar)) return; // must stay in the car
    }

    const dist = Math.hypot(playerCtx.pos.x - stage.target.x, playerCtx.pos.z - stage.target.z);
    if (dist <= stage.radius) {
      if (stage.arrive === 'pickup') this.hooks.sound.pickupChime();
      this.advanceStage();
    }
  }

  advanceStage() {
    this.stageIndex++;
    if (this.stageIndex >= this.currentJob.stages.length) {
      this.completeJob();
    } else {
      this.beginStage();
    }
  }

  // Used by screenshot mode to pose a job mid-flight.
  poseForShot(rng) {
    this.chainIndex = 0;
    this.startNextJob(rng);
  }
}
