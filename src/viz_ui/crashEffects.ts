import * as THREE from 'three';
import type { ProceduralTextures } from './textures';

const DEBRIS_COUNT = 36;
const SMOKE_COUNT = 140;

export interface CrashEffectsSystem {
  trigger: (impactPoint: { x: number; y: number; z: number }, intensity: number, soundEnabled: boolean) => void;
  reset: () => void;
  update: (dt: number, gravityMag: number) => void;
  getCameraShakeOffset: (out: THREE.Vector3) => void;
  dispose: () => void;
}

export function createCrashEffects(
  scene: THREE.Scene,
  textures: ProceduralTextures
): CrashEffectsSystem {
  const disposables: { dispose: () => void }[] = [];

  // 1. Expanding Fireball Core & Outer Blast Sphere
  const fireballGroup = new THREE.Group();
  fireballGroup.visible = false;
  scene.add(fireballGroup);

  const coreGeo = new THREE.SphereGeometry(1, 24, 18);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfff3b0,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const outerGeo = new THREE.SphereGeometry(1, 24, 18);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xff5a1f,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  disposables.push(coreGeo, coreMat, outerGeo, outerMat);

  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  fireballGroup.add(coreMesh, outerMesh);

  // 2. Ground Shockwave Blast Ring
  const ringGeo = new THREE.RingGeometry(0.78, 1.0, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposables.push(ringGeo, ringMat);
  const shockRing = new THREE.Mesh(ringGeo, ringMat);
  shockRing.position.y = 0.16;
  shockRing.visible = false;
  scene.add(shockRing);

  // 3. Ballistic 3D Debris Fragments (InstancedMesh)
  const debrisGeo = new THREE.BoxGeometry(0.65, 0.22, 0.45);
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.45,
    metalness: 0.75,
  });
  disposables.push(debrisGeo, debrisMat);

  const debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, DEBRIS_COUNT);
  debrisMesh.castShadow = true;
  debrisMesh.frustumCulled = false;
  debrisMesh.visible = false;
  scene.add(debrisMesh);

  const debrisPos = new Float32Array(DEBRIS_COUNT * 3);
  const debrisVel = new Float32Array(DEBRIS_COUNT * 3);
  const debrisRot = new Float32Array(DEBRIS_COUNT * 3);
  const debrisAngVel = new Float32Array(DEBRIS_COUNT * 3);
  const debrisScale = new Float32Array(DEBRIS_COUNT);

  const _dummy = new THREE.Object3D();
  const _color = new THREE.Color();

  // 4. Persistent Billowing Crash Fire & Black Smoke Plume (Points)
  const smokePositions = new Float32Array(SMOKE_COUNT * 3);
  const smokeColors = new Float32Array(SMOKE_COUNT * 3);
  const smokeVel = new Float32Array(SMOKE_COUNT * 3);
  const smokeLife = new Float32Array(SMOKE_COUNT);
  for (let i = 0; i < SMOKE_COUNT; i++) {
    smokeLife[i] = 0;
    smokePositions[i * 3 + 1] = -999;
  }

  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
  smokeGeo.setAttribute('color', new THREE.BufferAttribute(smokeColors, 3));
  const smokeMat = new THREE.PointsMaterial({
    size: 5.5,
    map: textures.plumeSprite,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
  });
  disposables.push(smokeGeo, smokeMat);

  const smokePoints = new THREE.Points(smokeGeo, smokeMat);
  smokePoints.frustumCulled = false;
  scene.add(smokePoints);

  let active = false;
  let elapsed = 0;
  let crashIntensity = 0;
  let origin = new THREE.Vector3();
  let smokeCursor = 0;
  let smokeTimer = 0;
  let audioCtx: AudioContext | null = null;

  const playCrashAudio = (intensity: number) => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (!audioCtx) audioCtx = new Ctor();
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume();
      }
      const now = audioCtx.currentTime;

      // Sub-bass impact thump
      const osc = audioCtx.createOscillator();
      const oscGain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
      oscGain.gain.setValueAtTime(0.45 * intensity, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(oscGain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.72);

      // Filtered white noise explosion roar
      const duration = 1.4;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.42));
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buf;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + duration);

      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.55 * intensity, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter).connect(noiseGain).connect(audioCtx.destination);
      noise.start(now);
      noise.stop(now + duration);
    } catch {
      // Ignore audio errors if blocked by browser autoplay policy
    }
  };

  const spawnSmokePuff = (isInitialBurst: boolean) => {
    const idx = smokeCursor;
    smokeCursor = (smokeCursor + 1) % SMOKE_COUNT;
    smokeLife[idx] = 1.0;

    const spread = isInitialBurst ? 4.5 : 2.6;
    smokePositions[idx * 3] = origin.x + (Math.random() - 0.5) * spread;
    smokePositions[idx * 3 + 1] = 0.6 + Math.random() * (isInitialBurst ? 3.5 : 1.4);
    smokePositions[idx * 3 + 2] = origin.z + (Math.random() - 0.5) * spread;

    const speed = isInitialBurst ? 10 + Math.random() * 14 : 2.5 + Math.random() * 4.5;
    const angle = Math.random() * Math.PI * 2;
    smokeVel[idx * 3] = Math.cos(angle) * (isInitialBurst ? speed * 0.65 : 1.4);
    smokeVel[idx * 3 + 1] = isInitialBurst ? 5 + Math.random() * 12 : 4.2 + Math.random() * 3.8;
    smokeVel[idx * 3 + 2] = Math.sin(angle) * (isInitialBurst ? speed * 0.65 : 1.4);

    // Hot orange ember near base on burst, dark soot gray smoke otherwise
    if (isInitialBurst && Math.random() < 0.55) {
      smokeColors[idx * 3] = 1.0;
      smokeColors[idx * 3 + 1] = 0.42;
      smokeColors[idx * 3 + 2] = 0.1;
    } else if (!isInitialBurst && Math.random() < 0.25) {
      smokeColors[idx * 3] = 0.92;
      smokeColors[idx * 3 + 1] = 0.36;
      smokeColors[idx * 3 + 2] = 0.08;
    } else {
      const g = 0.14 + Math.random() * 0.12;
      smokeColors[idx * 3] = g;
      smokeColors[idx * 3 + 1] = g;
      smokeColors[idx * 3 + 2] = g;
    }
  };

  const trigger = (
    impactPoint: { x: number; y: number; z: number },
    intensity: number,
    soundEnabled: boolean
  ) => {
    active = true;
    elapsed = 0;
    crashIntensity = Math.max(0.35, Math.min(1, intensity));
    origin.set(impactPoint.x, Math.max(0.5, impactPoint.y), impactPoint.z);

    fireballGroup.visible = true;
    fireballGroup.position.set(origin.x, 1.4, origin.z);
    shockRing.visible = true;
    shockRing.position.set(origin.x, 0.16, origin.z);
    debrisMesh.visible = true;

    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const a = (i / DEBRIS_COUNT) * Math.PI * 2 + Math.random() * 0.4;
      const radialSpeed = (6 + Math.random() * 18) * (0.6 + 0.6 * crashIntensity);
      const upSpeed = (8 + Math.random() * 19) * (0.6 + 0.6 * crashIntensity);

      debrisPos[i * 3] = origin.x + (Math.random() - 0.5) * 2.2;
      debrisPos[i * 3 + 1] = 1.0 + Math.random() * 3.5;
      debrisPos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 2.2;

      debrisVel[i * 3] = Math.cos(a) * radialSpeed;
      debrisVel[i * 3 + 1] = upSpeed;
      debrisVel[i * 3 + 2] = Math.sin(a) * radialSpeed;

      debrisRot[i * 3] = Math.random() * Math.PI;
      debrisRot[i * 3 + 1] = Math.random() * Math.PI;
      debrisRot[i * 3 + 2] = Math.random() * Math.PI;

      debrisAngVel[i * 3] = (Math.random() - 0.5) * 14;
      debrisAngVel[i * 3 + 1] = (Math.random() - 0.5) * 14;
      debrisAngVel[i * 3 + 2] = (Math.random() - 0.5) * 14;

      debrisScale[i] = 0.55 + Math.random() * 1.15;

      // Mix charred titanium, white hull, and amber strut shards
      if (i % 4 === 0) _color.setHex(0xe2e8f0);
      else if (i % 4 === 1) _color.setHex(0x1e293b);
      else if (i % 4 === 2) _color.setHex(0xd97706);
      else _color.setHex(0x475569);
      debrisMesh.setColorAt(i, _color);
    }
    if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;

    for (let i = 0; i < 42; i++) {
      spawnSmokePuff(true);
    }

    if (soundEnabled) {
      playCrashAudio(crashIntensity);
    }
  };

  const reset = () => {
    active = false;
    elapsed = 0;
    fireballGroup.visible = false;
    shockRing.visible = false;
    debrisMesh.visible = false;
    for (let i = 0; i < SMOKE_COUNT; i++) {
      smokeLife[i] = 0;
      smokePositions[i * 3 + 1] = -999;
    }
    (smokeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  };

  const update = (dt: number, gravityMag: number) => {
    if (!active || dt <= 0) return;
    elapsed += dt;

    // 1. Fireball expansion & fade over 1.6s
    if (elapsed < 1.8) {
      const t = elapsed / 1.8;
      const scale = (2.5 + 14.5 * Math.pow(t, 0.42)) * (0.7 + 0.5 * crashIntensity);
      outerMesh.scale.set(scale, scale * 0.85, scale);
      coreMesh.scale.setScalar(scale * 0.58 * Math.max(0.05, 1 - t * 1.1));
      fireballGroup.position.y = 1.2 + t * 5.0;

      outerMat.opacity = Math.max(0, 0.9 * (1 - t));
      coreMat.opacity = Math.max(0, 0.95 * (1 - t * 1.35));
      outerMat.color.setHex(t < 0.35 ? 0xff7b29 : 0xc2410c);
      fireballGroup.visible = true;
    } else {
      fireballGroup.visible = false;
    }

    // 2. Ground shockwave ring expansion over 1.2s
    if (elapsed < 1.3) {
      const t = elapsed / 1.3;
      const rScale = 2.0 + 36.0 * Math.pow(t, 0.6) * (0.7 + 0.4 * crashIntensity);
      shockRing.scale.setScalar(rScale);
      ringMat.opacity = Math.max(0, 0.72 * (1 - t));
      shockRing.visible = true;
    } else {
      shockRing.visible = false;
    }

    // 3. Ballistic debris fragments with gravity & desert floor bounce
    const g = Math.max(0.5, gravityMag);
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      debrisVel[i * 3 + 1] -= g * dt;
      debrisPos[i * 3] += debrisVel[i * 3] * dt;
      debrisPos[i * 3 + 1] += debrisVel[i * 3 + 1] * dt;
      debrisPos[i * 3 + 2] += debrisVel[i * 3 + 2] * dt;

      if (debrisPos[i * 3 + 1] < 0.14) {
        debrisPos[i * 3 + 1] = 0.14;
        if (Math.abs(debrisVel[i * 3 + 1]) > 1.2) {
          debrisVel[i * 3 + 1] = Math.abs(debrisVel[i * 3 + 1]) * 0.32;
        } else {
          debrisVel[i * 3 + 1] = 0;
        }
        debrisVel[i * 3] *= Math.exp(-5.0 * dt);
        debrisVel[i * 3 + 2] *= Math.exp(-5.0 * dt);
        debrisAngVel[i * 3] *= Math.exp(-6.0 * dt);
        debrisAngVel[i * 3 + 1] *= Math.exp(-6.0 * dt);
        debrisAngVel[i * 3 + 2] *= Math.exp(-6.0 * dt);
      }

      debrisRot[i * 3] += debrisAngVel[i * 3] * dt;
      debrisRot[i * 3 + 1] += debrisAngVel[i * 3 + 1] * dt;
      debrisRot[i * 3 + 2] += debrisAngVel[i * 3 + 2] * dt;

      _dummy.position.set(debrisPos[i * 3], debrisPos[i * 3 + 1], debrisPos[i * 3 + 2]);
      _dummy.rotation.set(debrisRot[i * 3], debrisRot[i * 3 + 1], debrisRot[i * 3 + 2]);
      _dummy.scale.setScalar(debrisScale[i]);
      _dummy.updateMatrix();
      debrisMesh.setMatrixAt(i, _dummy.matrix);
    }
    debrisMesh.instanceMatrix.needsUpdate = true;

    // 4. Persistent smoldering fire & dark smoke plume for 16 seconds
    smokeTimer += dt;
    if (elapsed < 16 && smokeTimer >= 0.06) {
      smokeTimer = 0;
      spawnSmokePuff(false);
    }

    for (let i = 0; i < SMOKE_COUNT; i++) {
      if (smokeLife[i] <= 0) continue;
      smokeLife[i] -= dt * 0.28;
      if (smokeLife[i] <= 0) {
        smokePositions[i * 3 + 1] = -999;
        continue;
      }
      smokePositions[i * 3] += smokeVel[i * 3] * dt;
      smokePositions[i * 3 + 1] += smokeVel[i * 3 + 1] * dt;
      smokePositions[i * 3 + 2] += smokeVel[i * 3 + 2] * dt;
      smokeVel[i * 3] *= Math.exp(-0.5 * dt);
      smokeVel[i * 3 + 2] *= Math.exp(-0.5 * dt);
    }
    (smokeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (smokeGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  };

  const getCameraShakeOffset = (out: THREE.Vector3) => {
    if (!active || elapsed > 0.65) {
      out.set(0, 0, 0);
      return;
    }
    const amp = 0.85 * crashIntensity * Math.exp(-6.5 * elapsed);
    out.set(
      (Math.random() - 0.5) * 2 * amp,
      (Math.random() - 0.5) * 2 * amp,
      (Math.random() - 0.5) * 2 * amp
    );
  };

  return {
    trigger,
    reset,
    update,
    getCameraShakeOffset,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      if (audioCtx) {
        void audioCtx.close();
      }
    },
  };
}
