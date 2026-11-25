import * as THREE from 'three';
import type { ForceBreakdown } from '../physics/types';
import type { ProceduralTextures } from './textures';

export interface DesertEnvironment {
  groundMesh: THREE.Mesh;
  targetBeacon: THREE.Group;
  windsockPivot: THREE.Group;
  trajectoryLine: THREE.Line;
  forceArrows: {
    thrust: THREE.ArrowHelper;
    drag: THREE.ArrowHelper;
    gravity: THREE.ArrowHelper;
    userPoke: THREE.ArrowHelper;
    previewPoke: THREE.ArrowHelper;
  };
  updateTrajectory: (points: { x: number; y: number; z: number }[]) => void;
  updateForces: (
    rocketPos: { x: number; y: number; z: number },
    forces: ForceBreakdown,
    showVectors: boolean
  ) => void;
  updateWindsock: (windX: number, windZ: number, time: number) => void;
  updatePlumeParticles: (
    dt: number,
    active: boolean,
    nozzleWorldPos: THREE.Vector3,
    exhaustDirWorld: THREE.Vector3,
    throttle: number
  ) => void;
  setTargetBeaconPosition: (x: number, z: number) => void;
  dispose: () => void;
}

const MAX_TRAJ_POINTS = 950;
const PLUME_COUNT = 160;

export function createDesertEnvironment(
  scene: THREE.Scene,
  textures: ProceduralTextures
): DesertEnvironment {
  const disposables: { dispose: () => void }[] = [];

  // Daylight Mojave sky backdrop + horizon-matched exponential fog
  const skyColor = new THREE.Color(0xd6e4f0);
  scene.background = skyColor;
  scene.fog = new THREE.FogExp2(0xd6e4f0, 0.00145);

  // 1. Expansive Sculpted Desert Terrain (800m x 800m)
  const groundGeo = new THREE.PlaneGeometry(900, 900, 96, 96);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const dist = Math.hypot(x, z);
    // Keep pad zone (radius < 65 m) dead-flat at y = 0 for clean landing/pad target placement
    const blend = THREE.MathUtils.smoothstep(dist, 65, 190);
    const dune =
      (Math.sin(x * 0.025) * Math.cos(z * 0.021) * 4.5 +
        Math.sin(x * 0.009 + z * 0.011) * 9.0) *
      blend;
    posAttr.setY(i, Math.max(0, dune) - 0.04);
  }
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    map: textures.desertAlbedo,
    roughness: 0.92,
    metalness: 0.0,
  });
  disposables.push(groundGeo, groundMat);

  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  groundMesh.name = 'DesertTerrain';
  scene.add(groundMesh);

  // 2. Concrete Landing Pad + Concentric Range Rings (centered at origin, y = +0.02 to prevent Z-fighting)
  const padGeo = new THREE.CylinderGeometry(28, 29.5, 0.25, 48);
  const padMat = new THREE.MeshStandardMaterial({
    map: textures.padAlbedo,
    roughness: 0.82,
    metalness: 0.05,
  });
  disposables.push(padGeo, padMat);
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.position.set(0, -0.09, 0);
  padMesh.receiveShadow = true;
  scene.add(padMesh);

  // 3. Distant Sandstone Mesas / Rock Outcrops (InstancedMesh, natural perimeter)
  const mesaGeo = new THREE.CylinderGeometry(8, 18, 24, 7);
  const mesaMat = new THREE.MeshStandardMaterial({
    color: 0xb0845d,
    roughness: 0.94,
    metalness: 0.02,
  });
  disposables.push(mesaGeo, mesaMat);
  const mesaCount = 34;
  const mesas = new THREE.InstancedMesh(mesaGeo, mesaMat, mesaCount);
  mesas.castShadow = true;
  mesas.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < mesaCount; i++) {
    const theta = (i / mesaCount) * Math.PI * 2 + (i % 3) * 0.14;
    const rad = 200 + ((i * 37) % 160);
    const sx = 0.8 + ((i * 19) % 10) * 0.16;
    const sy = 0.6 + ((i * 23) % 10) * 0.18;
    dummy.position.set(Math.cos(theta) * rad, sy * 10 - 2, Math.sin(theta) * rad);
    dummy.rotation.y = i * 1.1;
    dummy.scale.set(sx, sy, sx * 0.85);
    dummy.updateMatrix();
    mesas.setMatrixAt(i, dummy.matrix);
    mesas.setColorAt(i, new THREE.Color().setHSL(0.08, 0.34, 0.46 + (i % 5) * 0.03));
  }
  mesas.instanceMatrix.needsUpdate = true;
  if (mesas.instanceColor) mesas.instanceColor.needsUpdate = true;
  mesas.computeBoundingSphere();
  scene.add(mesas);

  // 4. Launch Range Tower Gantry (offset cleanly at x = -22, z = -18 so it frames launches without obstructing landings)
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(-24, 0, -18);
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.45,
    metalness: 0.72,
  });
  const towerGeo = new THREE.BoxGeometry(2.6, 28, 2.6);
  const armGeo = new THREE.BoxGeometry(7.5, 0.9, 1.2);
  disposables.push(steelMat, towerGeo, armGeo);

  const towerMesh = new THREE.Mesh(towerGeo, steelMat);
  towerMesh.position.y = 14;
  towerMesh.castShadow = true;
  towerMesh.receiveShadow = true;
  gantryGroup.add(towerMesh);

  const armMesh = new THREE.Mesh(armGeo, steelMat);
  armMesh.position.set(4.5, 22, 0);
  armMesh.castShadow = true;
  gantryGroup.add(armMesh);
  scene.add(gantryGroup);

  // 5. Range Perimeter Floodlight Bollards (InstancedMesh)
  const bollardGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.8, 10);
  const bollardMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.4,
    metalness: 0.3,
  });
  disposables.push(bollardGeo, bollardMat);
  const bollardCount = 12;
  const bollards = new THREE.InstancedMesh(bollardGeo, bollardMat, bollardCount);
  for (let i = 0; i < bollardCount; i++) {
    const a = (i / bollardCount) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * 31, 0.9, Math.sin(a) * 31);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bollards.setMatrixAt(i, dummy.matrix);
  }
  bollards.instanceMatrix.needsUpdate = true;
  bollards.computeBoundingSphere();
  scene.add(bollards);

  // 6. Live Windsock Mast reacting to crosswind vector
  const mastGroup = new THREE.Group();
  mastGroup.position.set(22, 0, -22);
  const mastPoleGeo = new THREE.CylinderGeometry(0.08, 0.12, 8, 8);
  const sockGeo = new THREE.ConeGeometry(0.42, 2.6, 12, 1, true);
  sockGeo.rotateZ(-Math.PI / 2);
  sockGeo.translate(1.3, 0, 0);
  const sockMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  disposables.push(mastPoleGeo, sockGeo, sockMat);
  const poleMesh = new THREE.Mesh(mastPoleGeo, steelMat);
  poleMesh.position.y = 4;
  mastGroup.add(poleMesh);

  const windsockPivot = new THREE.Group();
  windsockPivot.position.set(0, 7.8, 0);
  const sockMesh = new THREE.Mesh(sockGeo, sockMat);
  windsockPivot.add(sockMesh);
  mastGroup.add(windsockPivot);
  scene.add(mastGroup);

  // 7. Movable Target Pad Beacon Ring (moves when user taps ground in Set Target mode)
  const targetBeacon = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(3.8, 4.5, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const centerDotGeo = new THREE.CircleGeometry(0.9, 24);
  centerDotGeo.rotateX(-Math.PI / 2);
  disposables.push(ringGeo, ringMat, centerDotGeo);
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.y = 0.08;
  const dotMesh = new THREE.Mesh(centerDotGeo, ringMat);
  dotMesh.position.y = 0.08;
  targetBeacon.add(ringMesh, dotMesh);
  scene.add(targetBeacon);

  // 8. 3D Trailing Trajectory Line
  const trajPositions = new Float32Array(MAX_TRAJ_POINTS * 3);
  const trajGeo = new THREE.BufferGeometry();
  trajGeo.setAttribute('position', new THREE.BufferAttribute(trajPositions, 3));
  trajGeo.setDrawRange(0, 0);
  const trajMat = new THREE.LineBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.85,
  });
  disposables.push(trajGeo, trajMat);
  const trajectoryLine = new THREE.Line(trajGeo, trajMat);
  trajectoryLine.frustumCulled = false;
  scene.add(trajectoryLine);

  // 9. Live 3D Force Vectors (Thrust, Drag, Gravity, User Poke, Preview Poke)
  const makeArrow = (color: number) => {
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      1,
      color,
      1.1,
      0.55
    );
    arrow.visible = false;
    scene.add(arrow);
    return arrow;
  };
  const forceArrows = {
    thrust: makeArrow(0xf97316),
    drag: makeArrow(0x06b6d4),
    gravity: makeArrow(0x3b82f6),
    userPoke: makeArrow(0xe11d48),
    previewPoke: makeArrow(0xf43f5e),
  };

  // 10. Exhaust Smoke / Dust Plume Particle System (Points pool)
  const plumePositions = new Float32Array(PLUME_COUNT * 3);
  const plumeColors = new Float32Array(PLUME_COUNT * 3);
  const plumeVel = new Float32Array(PLUME_COUNT * 3);
  const plumeLife = new Float32Array(PLUME_COUNT);
  for (let i = 0; i < PLUME_COUNT; i++) {
    plumeLife[i] = 0;
    plumePositions[i * 3 + 1] = -999;
  }
  const plumeGeo = new THREE.BufferGeometry();
  plumeGeo.setAttribute('position', new THREE.BufferAttribute(plumePositions, 3));
  plumeGeo.setAttribute('color', new THREE.BufferAttribute(plumeColors, 3));
  const plumeMat = new THREE.PointsMaterial({
    size: 3.4,
    map: textures.plumeSprite,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
  });
  disposables.push(plumeGeo, plumeMat);
  const plumePoints = new THREE.Points(plumeGeo, plumeMat);
  plumePoints.frustumCulled = false;
  scene.add(plumePoints);

  let plumeCursor = 0;
  const _dir = new THREE.Vector3();

  const updateTrajectory = (points: { x: number; y: number; z: number }[]) => {
    const count = Math.min(points.length, MAX_TRAJ_POINTS);
    const attr = trajGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      attr.setXYZ(i, points[i].x, points[i].y, points[i].z);
    }
    attr.needsUpdate = true;
    trajGeo.setDrawRange(0, count);
  };

  const setArrow = (
    arrow: THREE.ArrowHelper,
    origin: { x: number; y: number; z: number },
    vec: { x: number; y: number; z: number },
    scaleDivisor: number,
    minShow: number
  ) => {
    const mag = Math.hypot(vec.x, vec.y, vec.z);
    if (mag < minShow) {
      arrow.visible = false;
      return;
    }
    arrow.visible = true;
    arrow.position.set(origin.x, origin.y, origin.z);
    _dir.set(vec.x / mag, vec.y / mag, vec.z / mag);
    arrow.setDirection(_dir);
    // Smooth logarithmic-linear length so 200kN thrust & 5kN drag are both readable
    const len = THREE.MathUtils.clamp(2.2 + (mag / scaleDivisor) * 8.0, 1.8, 16.0);
    arrow.setLength(len, Math.min(1.4, len * 0.28), 0.6);
  };

  const updateForces = (
    rocketPos: { x: number; y: number; z: number },
    forces: ForceBreakdown,
    showVectors: boolean
  ) => {
    if (!showVectors) {
      forceArrows.thrust.visible = false;
      forceArrows.drag.visible = false;
      forceArrows.gravity.visible = false;
      forceArrows.userPoke.visible = false;
      return;
    }
    setArrow(forceArrows.thrust, rocketPos, forces.thrustWorld, 300000, 500);
    setArrow(forceArrows.drag, rocketPos, forces.dragWorld, 40000, 200);
    setArrow(forceArrows.gravity, rocketPos, forces.gravityWorld, 200000, 100);
    setArrow(forceArrows.userPoke, rocketPos, forces.userTouchWorld, 20000, 100);
  };

  const updateWindsock = (windX: number, windZ: number, time: number) => {
    const speed = Math.hypot(windX, windZ);
    if (speed > 0.1) {
      windsockPivot.rotation.y = Math.atan2(-windZ, windX);
    }
    const droop = THREE.MathUtils.clamp(0.85 - speed * 0.06, 0.05, 0.85);
    windsockPivot.rotation.z = -droop + Math.sin(time * 7) * 0.05;
  };

  const updatePlumeParticles = (
    dt: number,
    active: boolean,
    nozzleWorldPos: THREE.Vector3,
    exhaustDirWorld: THREE.Vector3,
    throttle: number
  ) => {
    const spawnCount = active && throttle > 0.05 ? Math.ceil(3 * throttle) : 0;
    for (let s = 0; s < spawnCount; s++) {
      const idx = plumeCursor;
      plumeCursor = (plumeCursor + 1) % PLUME_COUNT;
      plumeLife[idx] = 1.0;
      plumePositions[idx * 3] = nozzleWorldPos.x + (Math.random() - 0.5) * 0.6;
      plumePositions[idx * 3 + 1] = Math.max(0.2, nozzleWorldPos.y);
      plumePositions[idx * 3 + 2] = nozzleWorldPos.z + (Math.random() - 0.5) * 0.6;

      const ejectSpeed = 14 + 18 * throttle;
      plumeVel[idx * 3] = exhaustDirWorld.x * ejectSpeed + (Math.random() - 0.5) * 4.5;
      plumeVel[idx * 3 + 1] = exhaustDirWorld.y * ejectSpeed + (Math.random() - 0.5) * 2.0;
      plumeVel[idx * 3 + 2] = exhaustDirWorld.z * ejectSpeed + (Math.random() - 0.5) * 4.5;

      // Warm dust tint near ground, pale exhaust higher up
      const nearPad = nozzleWorldPos.y < 18;
      plumeColors[idx * 3] = nearPad ? 0.88 : 0.96;
      plumeColors[idx * 3 + 1] = nearPad ? 0.8 : 0.96;
      plumeColors[idx * 3 + 2] = nearPad ? 0.7 : 0.98;
    }

    for (let i = 0; i < PLUME_COUNT; i++) {
      if (plumeLife[i] <= 0) continue;
      plumeLife[i] -= dt * 0.85;
      if (plumeLife[i] <= 0) {
        plumePositions[i * 3 + 1] = -999;
        continue;
      }

      let px = plumePositions[i * 3] + plumeVel[i * 3] * dt;
      let py = plumePositions[i * 3 + 1] + plumeVel[i * 3 + 1] * dt;
      let pz = plumePositions[i * 3 + 2] + plumeVel[i * 3 + 2] * dt;

      // Ground blast radial deflection when exhaust hits desert pad
      if (py < 0.45) {
        py = 0.45;
        plumeVel[i * 3 + 1] = Math.abs(plumeVel[i * 3 + 1]) * 0.15 + 0.8;
        plumeVel[i * 3] += (Math.random() - 0.5) * 14 * dt;
        plumeVel[i * 3 + 2] += (Math.random() - 0.5) * 14 * dt;
      }
      plumeVel[i * 3] *= Math.exp(-1.4 * dt);
      plumeVel[i * 3 + 1] *= Math.exp(-1.4 * dt);
      plumeVel[i * 3 + 2] *= Math.exp(-1.4 * dt);

      plumePositions[i * 3] = px;
      plumePositions[i * 3 + 1] = py;
      plumePositions[i * 3 + 2] = pz;
    }

    (plumeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (plumeGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  };

  const setTargetBeaconPosition = (x: number, z: number) => {
    targetBeacon.position.set(x, 0, z);
  };

  return {
    groundMesh,
    targetBeacon,
    windsockPivot,
    trajectoryLine,
    forceArrows,
    updateTrajectory,
    updateForces,
    updateWindsock,
    updatePlumeParticles,
    setTargetBeaconPosition,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
