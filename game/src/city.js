// city.js — builds Ember Bay itself: a sun-soaked peninsula city on a street
// grid, with the bay to the east. The ground (roads, markings, sidewalks,
// beach, painted water) is drawn once onto a big canvas texture so the whole
// street plan costs a single draw call; buildings, palms and streetlights sit
// on top. Every solid building registers an AABB collider that the player and
// the cars test against.

import * as THREE from 'three';

export const LAYOUT = {
  pitch: 76, // distance between street centre lines
  roadHalf: 9, // half the width of a street
  streetX: [-228, -152, -76, 0, 76, 152, 228], // vertical streets (run along z)
  streetZ: [-152, -76, 0, 76, 152], // horizontal streets (run along x)
  cityMinX: -266,
  cityMaxX: 266,
  cityMinZ: -190,
  cityMaxZ: 190,
  beachX: 306, // water starts here
  groundSize: 880, // the ground plane is a square of this size, centred at x=60
  groundCenterX: 60,
};

// World -> ground-canvas pixel helpers (the plane is rotated flat; with the
// default texture flip, canvas x grows with world x and canvas y with world z).
function makeGroundMapper(canvasSize) {
  const half = LAYOUT.groundSize / 2;
  return {
    px: (x) => ((x - LAYOUT.groundCenterX + half) / LAYOUT.groundSize) * canvasSize,
    py: (z) => ((z + half) / LAYOUT.groundSize) * canvasSize,
    scale: canvasSize / LAYOUT.groundSize,
  };
}

function paintGroundTexture(rng) {
  const S = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  const m = makeGroundMapper(S);
  const rect = (x0, z0, x1, z1, fill) => {
    g.fillStyle = fill;
    g.fillRect(m.px(x0), m.py(z0), (x1 - x0) * m.scale, (z1 - z0) * m.scale);
  };

  // Painted water everywhere first; the landmass is drawn over it.
  rect(-380, -440, 940, 440, '#17455e');
  // Landmass: a peninsula. West of the city it runs off the map; the bay
  // bites in from the east and the shore curves along the north and south.
  rect(-380, LAYOUT.cityMinZ, LAYOUT.beachX, LAYOUT.cityMaxZ, '#4c4a44');
  // Beach sand along the bay shore.
  rect(LAYOUT.cityMaxX, LAYOUT.cityMinZ, LAYOUT.beachX, LAYOUT.cityMaxZ, '#d9b77c');
  // Promenade: a pale walking strip between the city and the sand.
  rect(256, LAYOUT.cityMinZ, 268, LAYOUT.cityMaxZ, '#c9b18a');

  // City blocks: sidewalk pads, with a few park cells left green.
  const parkCells = new Set(['1,1', '4,3', '2,4']);
  for (let i = 0; i < LAYOUT.streetX.length - 1; i++) {
    for (let j = 0; j < LAYOUT.streetZ.length - 1; j++) {
      const x0 = LAYOUT.streetX[i] + LAYOUT.roadHalf;
      const x1 = LAYOUT.streetX[i + 1] - LAYOUT.roadHalf;
      const z0 = LAYOUT.streetZ[j] + LAYOUT.roadHalf;
      const z1 = LAYOUT.streetZ[j + 1] - LAYOUT.roadHalf;
      const isPark = parkCells.has(`${i},${j}`);
      rect(x0 - 3, z0 - 3, x1 + 3, z1 + 3, isPark ? '#3f7a3a' : '#75726c');
      if (!isPark) rect(x0, z0, x1, z1, '#83807a');
    }
  }

  // Streets: asphalt over the pads' edges, then lane markings.
  g.fillStyle = '#2f3338';
  for (const sx of LAYOUT.streetX) rect(sx - LAYOUT.roadHalf, LAYOUT.cityMinZ, sx + LAYOUT.roadHalf, LAYOUT.cityMaxZ, '#2f3338');
  for (const sz of LAYOUT.streetZ) rect(LAYOUT.cityMinX, sz - LAYOUT.roadHalf, LAYOUT.cityMaxX, sz + LAYOUT.roadHalf, '#2f3338');
  // Edge lines.
  g.fillStyle = '#cfd3d6';
  for (const sx of LAYOUT.streetX) {
    rect(sx - LAYOUT.roadHalf + 0.6, LAYOUT.cityMinZ, sx - LAYOUT.roadHalf + 1.1, LAYOUT.cityMaxZ, '#cfd3d6');
    rect(sx + LAYOUT.roadHalf - 1.1, LAYOUT.cityMinZ, sx + LAYOUT.roadHalf - 0.6, LAYOUT.cityMaxZ, '#cfd3d6');
  }
  for (const sz of LAYOUT.streetZ) {
    rect(LAYOUT.cityMinX, sz - LAYOUT.roadHalf + 0.6, LAYOUT.cityMaxX, sz - LAYOUT.roadHalf + 1.1, '#cfd3d6');
    rect(LAYOUT.cityMinX, sz + LAYOUT.roadHalf - 1.1, LAYOUT.cityMaxX, sz + LAYOUT.roadHalf - 0.6, '#cfd3d6');
  }
  // Dashed centre lines.
  g.fillStyle = '#e8b93e';
  for (const sx of LAYOUT.streetX) {
    for (let z = LAYOUT.cityMinZ; z < LAYOUT.cityMaxZ; z += 12) rect(sx - 0.35, z, sx + 0.35, z + 6, '#e8b93e');
  }
  for (const sz of LAYOUT.streetZ) {
    for (let x = LAYOUT.cityMinX; x < LAYOUT.cityMaxX; x += 12) rect(x, sz - 0.35, x + 6, sz + 0.35, '#e8b93e');
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(230,230,230,0.75)';
  for (const sx of LAYOUT.streetX) {
    for (const sz of LAYOUT.streetZ) {
      for (let k = -3; k <= 3; k++) {
        rect(sx - 7.5, sz + k * 2.2 - 0.7, sx - 5.2, sz + k * 2.2 + 0.7, 'rgba(230,230,230,0.75)');
        rect(sx + 5.2, sz + k * 2.2 - 0.7, sx + 7.5, sz + k * 2.2 + 0.7, 'rgba(230,230,230,0.75)');
      }
    }
  }
  // A little noise so the asphalt does not look like plastic.
  for (let i = 0; i < 2600; i++) {
    const x = rng.range(-380, 500);
    const z = rng.range(-440, 440);
    g.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.07)})`;
    g.fillRect(m.px(x), m.py(z), rng.range(2, 9), rng.range(2, 9));
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A building skin: wall colour plus a grid of windows, some lit for the dusk.
function makeBuildingSkin(rng, wallColor, floors, cols) {
  const W = 128;
  const H = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = W;
  colorCanvas.height = H;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = W;
  glowCanvas.height = H;
  const c = colorCanvas.getContext('2d');
  const e = glowCanvas.getContext('2d');
  c.fillStyle = wallColor;
  c.fillRect(0, 0, W, H);
  e.fillStyle = '#000000';
  e.fillRect(0, 0, W, H);
  const winW = W / cols;
  const winH = H / floors;
  for (let y = 0; y < floors; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.chance(0.42);
      const wx = x * winW + winW * 0.22;
      const wy = y * winH + winH * 0.24;
      const ww = winW * 0.56;
      const wh = winH * 0.5;
      if (lit) {
        const warm = rng.pick(['#ffd27a', '#ffc46b', '#fff0b3', '#ffb36b']);
        c.fillStyle = warm;
        c.fillRect(wx, wy, ww, wh);
        e.fillStyle = warm;
        e.fillRect(wx, wy, ww, wh);
      } else {
        c.fillStyle = rng.pick(['#1d2733', '#232c38', '#182028']);
        c.fillRect(wx, wy, ww, wh);
      }
    }
  }
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(glowCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

function makePalmFrondTexture() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#2e7d32';
  g.lineCap = 'round';
  const cx = S / 2;
  const cy = S / 2;
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + 0.3;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(cx, cy);
    g.quadraticCurveTo(
      cx + Math.cos(ang) * S * 0.3,
      cy + Math.sin(ang) * S * 0.3 - 12,
      cx + Math.cos(ang) * S * 0.48,
      cy + Math.sin(ang) * S * 0.48 + 26,
    );
    g.stroke();
    g.lineWidth = 3;
    g.strokeStyle = '#43a047';
    g.beginPath();
    g.moveTo(cx, cy);
    g.quadraticCurveTo(
      cx + Math.cos(ang + 0.2) * S * 0.3,
      cy + Math.sin(ang + 0.2) * S * 0.3 - 8,
      cx + Math.cos(ang + 0.2) * S * 0.44,
      cy + Math.sin(ang + 0.2) * S * 0.44 + 20,
    );
    g.stroke();
    g.strokeStyle = '#2e7d32';
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWaterTexture() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = '#1d6a8a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = `rgba(255,190,120,${0.05 + (i % 5) * 0.02})`;
    g.lineWidth = 2;
    const y = (i / 46) * S;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.11 + i) * 2.4);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSkyDome() {
  const geo = new THREE.SphereGeometry(1500, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: new THREE.Vector3(0.82, 0.16, 0.35).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 sunDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.12, 1.0);
        vec3 top = vec3(0.13, 0.24, 0.45);
        vec3 mid = vec3(0.85, 0.42, 0.32);
        vec3 low = vec3(1.0, 0.62, 0.28);
        vec3 col = mix(low, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, top, smoothstep(0.18, 0.65, h));
        float sun = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.55, 0.22) * pow(sun, 90.0) * 1.4;
        col += vec3(1.0, 0.45, 0.18) * pow(sun, 7.0) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// Push a circle (x, z, radius) out of every AABB collider. Returns the
// strongest impact speed absorbed (0 when nothing was hit).
export function collideCircle(pos, radius, colliders, prevPos) {
  let impact = 0;
  for (const b of colliders) {
    const nx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const nz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 0.0001;
      const push = radius - d;
      if (d2 > 0.000001) {
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        // Centre inside the box: push out along the smallest exit.
        const exits = [
          { a: pos.x - b.minX, x: b.minX - radius, z: pos.z },
          { a: b.maxX - pos.x, x: b.maxX + radius, z: pos.z },
          { a: pos.z - b.minZ, x: pos.x, z: b.minZ - radius },
          { a: b.maxZ - pos.z, x: pos.x, z: b.maxZ + radius },
        ];
        exits.sort((p, q) => p.a - q.a);
        pos.x = exits[0].x;
        pos.z = exits[0].z;
      }
      if (prevPos) {
        const moved = Math.hypot(pos.x - prevPos.x, pos.z - prevPos.z);
        impact = Math.max(impact, moved);
      } else {
        impact = Math.max(impact, push);
      }
    }
  }
  return impact;
}

export function buildCity(scene, rng) {
  const colliders = [];

  scene.add(makeSkyDome());
  scene.fog = new THREE.Fog(0xe8906a, 150, 780);

  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2c3e55, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffab5e, 2.4);
  sun.position.set(420, 130, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -340;
  sun.shadow.camera.right = 340;
  sun.shadow.camera.top = 300;
  sun.shadow.camera.bottom = -300;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x604a38, 0.5));

  // Ground.
  const groundTex = paintGroundTexture(rng);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(LAYOUT.groundSize, LAYOUT.groundSize),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(LAYOUT.groundCenterX, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // Animated bay water.
  const waterTex = makeWaterTexture();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(660, LAYOUT.groundSize),
    new THREE.MeshPhongMaterial({
      map: waterTex, color: 0x9fc8dd, shininess: 160,
      specular: 0xffc38a, transparent: true, opacity: 0.93,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(LAYOUT.beachX + 330, 0.06, 0);
  scene.add(water);

  // ---- Buildings ----
  const wallPalette = ['#c96f4a', '#b8b0a4', '#8fa3b8', '#d9c8a9', '#a8574a', '#7d8fa3', '#e0b48c', '#98a8b0', '#c98d5f'];
  const skins = [];
  for (let i = 0; i < 6; i++) {
    skins.push(makeBuildingSkin(rng, wallPalette[i % wallPalette.length], 14 + i * 3, 7 + (i % 3)));
  }
  const skinMats = skins.map((s) => new THREE.MeshStandardMaterial({
    map: s.map, emissiveMap: s.emissiveMap, emissive: 0xffc27a, emissiveIntensity: 1.15, roughness: 0.92,
  }));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 1 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);

  const parkCells = new Set(['1,1', '4,3', '2,4']);
  const garageCell = '0,2'; // Madame Ora's garage block, west side
  for (let i = 0; i < LAYOUT.streetX.length - 1; i++) {
    for (let j = 0; j < LAYOUT.streetZ.length - 1; j++) {
      const key = `${i},${j}`;
      const x0 = LAYOUT.streetX[i] + LAYOUT.roadHalf + 3;
      const x1 = LAYOUT.streetX[i + 1] - LAYOUT.roadHalf - 3;
      const z0 = LAYOUT.streetZ[j] + LAYOUT.roadHalf + 3;
      const z1 = LAYOUT.streetZ[j + 1] - LAYOUT.roadHalf - 3;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (parkCells.has(key)) continue; // green space; palms come later
      if (key === garageCell) {
        // Ora's garage: one low, wide block with a burnt-orange roof band.
        const w = x1 - x0;
        const d = z1 - z0;
        const garage = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.9 }));
        garage.scale.set(w, 7, d);
        garage.position.set(cx, 0, cz);
        garage.castShadow = true;
        garage.receiveShadow = true;
        scene.add(garage);
        const band = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xd8641e, roughness: 0.8 }));
        band.scale.set(w + 1.5, 1.6, d + 1.5);
        band.position.set(cx, 6.4, cz);
        scene.add(band);
        colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
        continue;
      }
      // One to four towers per block; downtown (near the middle) grows tall.
      const downtown = 1 - Math.min(1, Math.hypot(cx, cz) / 320);
      const lots = rng.chance(0.45) ? 4 : rng.chance(0.6) ? 2 : 1;
      const lotW = (x1 - x0) / (lots === 4 ? 2 : 1);
      const lotD = (z1 - z0) / (lots === 4 ? 2 : lots === 2 ? 2 : 1);
      for (let l = 0; l < lots; l++) {
        const lx = lots === 1 ? cx : x0 + lotW * ((l % 2) + 0.5);
        const lz = lots === 1 ? cz : z0 + lotD * (Math.floor(l / (lots === 4 ? 2 : 1)) + 0.5);
        const w = lotW * rng.range(0.68, 0.9);
        const d = lotD * rng.range(0.68, 0.9);
        const h = rng.range(11, 22) + downtown * rng.range(8, 38);
        const tower = new THREE.Mesh(boxGeo, skinMats[rng.int(0, skinMats.length - 1)]);
        tower.scale.set(w, h, d);
        tower.position.set(lx, 0, lz);
        tower.castShadow = true;
        tower.receiveShadow = true;
        scene.add(tower);
        const cap = new THREE.Mesh(boxGeo, roofMat);
        cap.scale.set(w * 0.4, 1.4, d * 0.4);
        cap.position.set(lx, h, lz);
        scene.add(cap);
        colliders.push({ minX: lx - w / 2, maxX: lx + w / 2, minZ: lz - d / 2, maxZ: lz + d / 2 });
      }
    }
  }

  // Café Marina: a low café with a striped awning near the first pickup.
  const cafe = new THREE.Group();
  const cafeBody = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xf0e2c8, roughness: 0.9 }));
  cafeBody.scale.set(13, 4.4, 9);
  cafeBody.castShadow = true;
  cafe.add(cafeBody);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(13.6, 0.3, 4.4),
    new THREE.MeshStandardMaterial({ color: 0xd84f35, roughness: 0.85 }),
  );
  awning.position.set(0, 3.6, 5.4);
  awning.rotation.x = 0.28;
  cafe.add(awning);
  cafe.position.set(-133, 0, -58);
  scene.add(cafe);
  colliders.push({ minX: -139.5, maxX: -126.5, minZ: -62.5, maxZ: -53.5 });

  // The pier warehouse the first package is delivered to.
  const warehouse = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x707a72, roughness: 0.95 }));
  warehouse.scale.set(20, 8, 14);
  warehouse.position.set(288, 0, 121);
  warehouse.castShadow = true;
  scene.add(warehouse);
  colliders.push({ minX: 278, maxX: 298, minZ: 114, maxZ: 128 });
  // Wooden pier reaching into the bay.
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(64, 0.8, 7), pierMat);
  pier.position.set(336, 0.5, 121);
  scene.add(pier);
  for (let px = 312; px <= 362; px += 10) {
    for (const pz of [118.4, 123.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 6), pierMat);
      post.position.set(px, -0.4, pz);
      scene.add(post);
    }
  }

  // The hideout lighthouse on the north shore.
  const lightGroup = new THREE.Group();
  const stripeMatA = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.8 });
  const stripeMatB = new THREE.MeshStandardMaterial({ color: 0xc73e2e, roughness: 0.8 });
  for (let s = 0; s < 4; s++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6 - s * 0.32, 2.9 - s * 0.32, 3.4, 12),
      s % 2 === 0 ? stripeMatA : stripeMatB,
    );
    seg.position.y = 1.7 + s * 3.4;
    seg.castShadow = true;
    lightGroup.add(seg);
  }
  const lampRoom = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 2.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c3138, emissive: 0xffc46b, emissiveIntensity: 1.6 }),
  );
  lampRoom.position.y = 15.2;
  lightGroup.add(lampRoom);
  lightGroup.position.set(288, 0, -158);
  scene.add(lightGroup);
  colliders.push({ minX: 284.8, maxX: 291.2, minZ: -161.2, maxZ: -154.8 });

  // ---- Palms (instanced) ----
  const palmSpots = [];
  for (let z = LAYOUT.cityMinZ + 8; z < LAYOUT.cityMaxZ; z += 17) {
    palmSpots.push({ x: 261 + rng.range(-1.5, 1.5), z: z + rng.range(-4, 4) });
  }
  for (const key of parkCells) {
    const [i, j] = key.split(',').map(Number);
    const cx = (LAYOUT.streetX[i] + LAYOUT.streetX[i + 1]) / 2;
    const cz = (LAYOUT.streetZ[j] + LAYOUT.streetZ[j + 1]) / 2;
    for (let k = 0; k < 7; k++) palmSpots.push({ x: cx + rng.range(-22, 22), z: cz + rng.range(-22, 22) });
  }
  for (let k = 0; k < 26; k++) {
    const sx = rng.pick(LAYOUT.streetX);
    const sz = rng.pick(LAYOUT.streetZ);
    palmSpots.push({ x: sx + rng.pick([-1, 1]) * (LAYOUT.roadHalf + 2.2), z: sz + rng.range(-30, 30) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 5.6, 6);
  trunkGeo.translate(0, 2.8, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const frondTex = makePalmFrondTexture();
  const frondGeo = new THREE.PlaneGeometry(6.4, 6.4);
  frondGeo.translate(0, 5.9, 0);
  const frondMat = new THREE.MeshStandardMaterial({
    map: frondTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1,
  });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 2);
  const dummy = new THREE.Object3D();
  palmSpots.forEach((spot, idx) => {
    const lean = rng.range(-0.07, 0.07);
    dummy.position.set(spot.x, 0, spot.z);
    dummy.rotation.set(lean, rng.range(0, Math.PI * 2), lean);
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);
    dummy.updateMatrix();
    fronds.setMatrixAt(idx * 2, dummy.matrix);
    dummy.rotation.y += Math.PI / 2;
    dummy.updateMatrix();
    fronds.setMatrixAt(idx * 2 + 1, dummy.matrix);
  });
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(fronds);

  // ---- Streetlights (instanced poles + emissive heads) ----
  const lightSpots = [];
  for (const sx of LAYOUT.streetX) {
    for (let z = LAYOUT.cityMinZ + 20; z < LAYOUT.cityMaxZ; z += 38) {
      lightSpots.push({ x: sx - LAYOUT.roadHalf - 1.2, z });
      lightSpots.push({ x: sx + LAYOUT.roadHalf + 1.2, z: z + 19 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6.4, 5);
  poleGeo.translate(0, 3.2, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7, metalness: 0.5 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const headGeo = new THREE.SphereGeometry(0.34, 8, 6);
  headGeo.translate(0, 6.5, 0);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffd9a0, emissive: 0xffbe78, emissiveIntensity: 2.4,
  });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lightSpots.length);
  lightSpots.forEach((spot, idx) => {
    dummy.position.set(spot.x, 0, spot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(idx, dummy.matrix);
    heads.setMatrixAt(idx, dummy.matrix);
  });
  scene.add(poles);
  scene.add(heads);

  return { colliders, waterTex, sun };
}
