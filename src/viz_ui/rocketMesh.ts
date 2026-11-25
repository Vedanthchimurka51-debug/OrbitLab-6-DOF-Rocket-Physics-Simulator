import * as THREE from 'three';
import type { RocketParams } from '../physics/types';
import type { ProceduralTextures } from './textures';

export interface RocketMeshAssembly {
  root: THREE.Group;
  nozzlePivot: THREE.Group;
  flameGroup: THREE.Group;
  outerFlame: THREE.Mesh;
  innerCore: THREE.Mesh;
  legPivots: THREE.Group[];
  legPistons: THREE.Mesh[];
  raycastProxy: THREE.Mesh;
  updateVisuals: (params: {
    throttle: number;
    gimbalPitch: number;
    gimbalYaw: number;
    legDeployment: number;
    time: number;
  }) => void;
  setCrashedVisual: (crashed: boolean) => void;
  dispose: () => void;
}

/**
 * Composite 10-part procedural Reusable Orbital Booster (THREE.Group)
 * Local coordinates: CoM at (0, 0, 0), +Y nose, -Y engine nozzle.
 */
export function createRocketMesh(
  params: RocketParams,
  textures: ProceduralTextures
): RocketMeshAssembly {
  const root = new THREE.Group();
  root.name = 'ReusableOrbitalBooster';

  const r = params.radius; // 1.2 m
  const h = params.height; // 18.0 m
  const halfH = h * 0.5; // 9.0 m

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // Materials with calibrated PBR roughness/metalness contrast
  const hullMat = new THREE.MeshStandardMaterial({
    map: textures.fuselageAlbedo,
    roughness: 0.42,
    metalness: 0.12,
  });
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.38,
    metalness: 0.25,
  });
  const titaniumMat = new THREE.MeshPhysicalMaterial({
    color: 0x94a3b8,
    roughness: 0.28,
    metalness: 0.88,
    anisotropy: 0.65,
  });
  const nozzleMat = new THREE.MeshPhysicalMaterial({
    color: 0x334155,
    roughness: 0.24,
    metalness: 0.92,
    emissive: new THREE.Color(0x000000),
  });
  const strutMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.35,
    metalness: 0.6,
  });
  materials.push(hullMat, carbonMat, titaniumMat, nozzleMat, strutMat);

  // 1. Primary Silhouette: Main Cylindrical Tank + Tapered Interstage via LatheGeometry
  const hullPts = [
    new THREE.Vector2(0.01, -halfH + 0.8),
    new THREE.Vector2(r * 0.98, -halfH + 0.8),
    new THREE.Vector2(r, -halfH + 1.1),
    new THREE.Vector2(r, halfH - 1.2),
    new THREE.Vector2(r * 0.96, halfH - 0.7),
    new THREE.Vector2(r * 0.72, halfH - 0.15),
    new THREE.Vector2(0.01, halfH),
  ];
  const hullGeo = new THREE.LatheGeometry(hullPts, 36);
  geometries.push(hullGeo);
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  root.add(hullMesh);

  // 2. Carbon-Fiber Interstage Collar Ring
  const collarGeo = new THREE.CylinderGeometry(r * 1.015, r * 1.015, 2.2, 32, 1, false);
  geometries.push(collarGeo);
  const collarMesh = new THREE.Mesh(collarGeo, carbonMat);
  collarMesh.position.y = halfH - 2.2;
  collarMesh.castShadow = true;
  root.add(collarMesh);

  // 3. Avionics / LOX Feed Raceway Spine
  const racewayGeo = new THREE.BoxGeometry(0.24, h * 0.74, 0.18);
  geometries.push(racewayGeo);
  const racewayMesh = new THREE.Mesh(racewayGeo, titaniumMat);
  racewayMesh.position.set(r * 0.96, -0.4, 0);
  racewayMesh.castShadow = true;
  root.add(racewayMesh);

  // 4. Four Titanium Lattice Grid Fins (45 deg azimuths near interstage)
  const finFrameGeo = new THREE.BoxGeometry(0.95, 0.08, 0.72);
  const finVaneGeo = new THREE.BoxGeometry(0.82, 0.11, 0.04);
  geometries.push(finFrameGeo, finVaneGeo);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const finGroup = new THREE.Group();
    finGroup.position.set(Math.cos(angle) * (r + 0.42), halfH - 2.6, Math.sin(angle) * (r + 0.42));
    finGroup.rotation.y = -angle;
    finGroup.rotation.z = 0.08;

    const frame = new THREE.Mesh(finFrameGeo, titaniumMat);
    frame.castShadow = true;
    finGroup.add(frame);

    for (let v = -2; v <= 2; v++) {
      const vane = new THREE.Mesh(finVaneGeo, titaniumMat);
      vane.position.z = v * 0.13;
      finGroup.add(vane);
    }
    root.add(finGroup);
  }

  // 5. Aft Engine Heatshield Skirt
  const skirtGeo = new THREE.CylinderGeometry(r * 1.02, r * 1.07, 1.4, 32);
  geometries.push(skirtGeo);
  const skirtMesh = new THREE.Mesh(skirtGeo, carbonMat);
  skirtMesh.position.y = -halfH + 0.85;
  skirtMesh.castShadow = true;
  root.add(skirtMesh);

  // 6. Gimbaled Parabolic Engine Bell Nozzle (pivoted at y = -params.nozzleArm)
  const nozzlePivot = new THREE.Group();
  nozzlePivot.position.set(0, -params.nozzleArm, 0);
  root.add(nozzlePivot);

  const bellPts = [
    new THREE.Vector2(0.18, 0.15),
    new THREE.Vector2(0.14, -0.05),
    new THREE.Vector2(0.32, -0.35),
    new THREE.Vector2(0.52, -0.78),
    new THREE.Vector2(0.62, -1.15),
  ];
  const bellGeo = new THREE.LatheGeometry(bellPts, 28);
  geometries.push(bellGeo);
  const bellMesh = new THREE.Mesh(bellGeo, nozzleMat);
  bellMesh.castShadow = true;
  nozzlePivot.add(bellMesh);

  // 7. Volumetric Exhaust Plume + Shock Diamond Core attached to gimbaled nozzle
  const flameGroup = new THREE.Group();
  flameGroup.position.set(0, -1.12, 0);
  nozzlePivot.add(flameGroup);

  const outerFlameCone = new THREE.ConeGeometry(0.62, 6.0, 24, 1, true);
  outerFlameCone.rotateX(Math.PI);
  outerFlameCone.translate(0, -3.0, 0);

  const innerCoreCone = new THREE.ConeGeometry(0.34, 3.2, 20, 1, false);
  innerCoreCone.rotateX(Math.PI);
  innerCoreCone.translate(0, -1.6, 0);
  geometries.push(outerFlameCone, innerCoreCone);

  const outerFlameMat = new THREE.MeshBasicMaterial({
    color: 0xff7b29,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const innerCoreMat = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.push(outerFlameMat, innerCoreMat);

  const outerFlame = new THREE.Mesh(outerFlameCone, outerFlameMat);
  const innerCore = new THREE.Mesh(innerCoreCone, innerCoreMat);
  flameGroup.add(outerFlame, innerCore);
  flameGroup.visible = false;

  // 8. Four Articulated Landing Legs + Telescoping Hydraulic Pistons
  const legPivots: THREE.Group[] = [];
  const legPistons: THREE.Mesh[] = [];
  const legMainGeo = new THREE.BoxGeometry(0.24, 3.8, 0.34);
  const legFootGeo = new THREE.CylinderGeometry(0.28, 0.38, 0.14, 12);
  const pistonGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8);
  geometries.push(legMainGeo, legFootGeo, pistonGeo);

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const mountGroup = new THREE.Group();
    mountGroup.position.set(Math.cos(angle) * (r + 0.04), -halfH + 0.45, Math.sin(angle) * (r + 0.04));
    mountGroup.rotation.y = -angle;
    root.add(mountGroup);

    const legPivot = new THREE.Group();
    mountGroup.add(legPivot);

    // Main leg strut extends upward when stowed (0) and swings out+downward when deployed (1)
    const legStrut = new THREE.Mesh(legMainGeo, carbonMat);
    legStrut.position.set(0.12, 1.85, 0);
    legStrut.castShadow = true;
    legPivot.add(legStrut);

    const footPad = new THREE.Mesh(legFootGeo, titaniumMat);
    footPad.position.set(0.18, 3.75, 0);
    legPivot.add(footPad);

    // Hydraulic telescoping actuator rod
    const piston = new THREE.Mesh(pistonGeo, strutMat);
    piston.position.set(-0.22, 1.4, 0);
    piston.rotation.z = 0.25;
    legPivot.add(piston);

    legPivots.push(legPivot);
    legPistons.push(piston);
  }

  // 9. Simplified Raycasting Collision Proxy (Layer 1)
  const proxyGeo = new THREE.CylinderGeometry(r * 2.4, r * 2.4, h + 3.6, 14);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  geometries.push(proxyGeo);
  materials.push(proxyMat);
  const raycastProxy = new THREE.Mesh(proxyGeo, proxyMat);
  raycastProxy.layers.set(1);
  raycastProxy.name = 'RocketRaycastProxy';
  root.add(raycastProxy);

  const updateVisuals = ({
    throttle,
    gimbalPitch,
    gimbalYaw,
    legDeployment,
    time,
  }: {
    throttle: number;
    gimbalPitch: number;
    gimbalYaw: number;
    legDeployment: number;
    time: number;
  }) => {
    // Nozzle bell points in opposite direction of thrust deflection:
    // Positive gimbalPitch produces -Z thrust -> exhaust shoots +Z -> rotateX(-gimbalPitch)
    // Positive gimbalYaw produces +X thrust -> exhaust shoots -X -> rotateZ(gimbalYaw)
    nozzlePivot.rotation.set(-gimbalPitch, 0, gimbalYaw);

    // Articulated leg sweep: stowed (0 rad, tucked upward along hull) -> deployed (~2.18 rad outward/downward)
    const deployAngle = legDeployment * 2.16;
    for (let i = 0; i < legPivots.length; i++) {
      legPivots[i].rotation.z = -deployAngle;
      legPistons[i].scale.y = 0.55 + 0.55 * legDeployment;
    }

    // Flame scaling + realistic Mach shock flicker
    if (throttle > 0.02) {
      flameGroup.visible = true;
      const flicker = 0.92 + 0.14 * Math.sin(time * 58) + 0.06 * Math.cos(time * 91);
      const lenScale = (0.32 + 1.05 * throttle) * flicker;
      const radScale = 0.55 + 0.45 * throttle;
      outerFlame.scale.set(radScale, lenScale, radScale);
      innerCore.scale.set(radScale * 0.95, lenScale * 0.9, radScale * 0.95);
      outerFlameMat.opacity = 0.48 + 0.36 * throttle;
      nozzleMat.emissive.setHex(0xd97706);
      nozzleMat.emissiveIntensity = 0.15 + 0.55 * throttle;
    } else {
      flameGroup.visible = false;
      if (!isCrashed) {
        nozzleMat.emissiveIntensity = 0;
      }
    }
  };

  let isCrashed = false;
  const setCrashedVisual = (crashed: boolean) => {
    if (isCrashed === crashed) return;
    isCrashed = crashed;
    if (crashed) {
      hullMat.color.setHex(0x475569);
      hullMat.roughness = 0.78;
      titaniumMat.color.setHex(0x334155);
      nozzleMat.emissive.setHex(0xea580c);
      nozzleMat.emissiveIntensity = 0.45;
      if (legPivots[0]) legPivots[0].rotation.x = 0.35;
      if (legPivots[2]) legPivots[2].rotation.x = -0.42;
    } else {
      hullMat.color.setHex(0xffffff);
      hullMat.roughness = 0.42;
      titaniumMat.color.setHex(0x94a3b8);
      nozzleMat.emissive.setHex(0x000000);
      nozzleMat.emissiveIntensity = 0;
      legPivots.forEach((p) => {
        p.rotation.x = 0;
      });
    }
  };

  return {
    root,
    nozzlePivot,
    flameGroup,
    outerFlame,
    innerCore,
    legPivots,
    legPistons,
    raycastProxy,
    updateVisuals,
    setCrashedVisual,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
