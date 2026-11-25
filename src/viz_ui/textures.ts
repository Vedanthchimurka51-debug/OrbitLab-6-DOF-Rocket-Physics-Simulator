import * as THREE from 'three';

export interface ProceduralTextures {
  fuselageAlbedo: THREE.CanvasTexture;
  desertAlbedo: THREE.CanvasTexture;
  padAlbedo: THREE.CanvasTexture;
  plumeSprite: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  const safeAniso = Math.max(1, Math.min(8, maxAnisotropy));

  // 1. Orbital booster fuselage hull texture (panel seams, thermal soot gradient, vertical raceway)
  const fCanvas = document.createElement('canvas');
  fCanvas.width = 512;
  fCanvas.height = 1024;
  const fCtx = fCanvas.getContext('2d')!;

  const hullGrad = fCtx.createLinearGradient(0, 0, 0, 1024);
  hullGrad.addColorStop(0.0, '#1e293b'); // dark carbon interstage top
  hullGrad.addColorStop(0.18, '#1e293b');
  hullGrad.addColorStop(0.185, '#f1f5f9'); // crisp cryogenic tank white
  hullGrad.addColorStop(0.68, '#e2e8f0');
  hullGrad.addColorStop(0.88, '#cbd5e1'); // subtle atmospheric reentry soot
  hullGrad.addColorStop(1.0, '#475569'); // dark aft heatshield skirt
  fCtx.fillStyle = hullGrad;
  fCtx.fillRect(0, 0, 512, 1024);

  // Circumferential ring seams
  fCtx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
  fCtx.lineWidth = 2;
  for (let y = 190; y < 900; y += 72) {
    fCtx.beginPath();
    fCtx.moveTo(0, y);
    fCtx.lineTo(512, y);
    fCtx.stroke();
  }

  // Vertical raceway & instrumentation stripe
  fCtx.fillStyle = '#334155';
  fCtx.fillRect(240, 185, 28, 740);
  fCtx.fillStyle = '#0ea5e9';
  fCtx.fillRect(110, 220, 16, 48);
  fCtx.fillStyle = '#f59e0b';
  fCtx.fillRect(110, 276, 16, 18);

  // Subtle reentry streaking along lower half
  for (let i = 0; i < 65; i++) {
    const x = (i * 47) % 512;
    const h = 140 + ((i * 31) % 240);
    const g = fCtx.createLinearGradient(0, 1024 - h, 0, 1024);
    g.addColorStop(0, 'rgba(30, 41, 59, 0)');
    g.addColorStop(1, 'rgba(30, 41, 59, 0.22)');
    fCtx.fillStyle = g;
    fCtx.fillRect(x, 1024 - h, 5, h);
  }

  const fuselageAlbedo = new THREE.CanvasTexture(fCanvas);
  fuselageAlbedo.colorSpace = THREE.SRGBColorSpace;
  fuselageAlbedo.anisotropy = safeAniso;

  // 2. Desert terrain texture (sun-baked Mojave sand, pebbles, wind ripples)
  const dCanvas = document.createElement('canvas');
  dCanvas.width = 512;
  dCanvas.height = 512;
  const dCtx = dCanvas.getContext('2d')!;
  dCtx.fillStyle = '#cbb392';
  dCtx.fillRect(0, 0, 512, 512);

  // Subtle wind-swept strata
  for (let y = 0; y < 512; y += 6) {
    const alpha = 0.03 + 0.03 * Math.sin(y * 0.14);
    dCtx.fillStyle = `rgba(138, 104, 66, ${alpha.toFixed(3)})`;
    dCtx.fillRect(0, y, 512, 3);
  }
  // Fine desert grit speckles
  for (let i = 0; i < 3200; i++) {
    const x = (i * 197 + 13) % 512;
    const y = (i * 331 + 29) % 512;
    dCtx.fillStyle = i % 2 === 0 ? 'rgba(92, 68, 42, 0.18)' : 'rgba(245, 232, 210, 0.22)';
    dCtx.fillRect(x, y, 2, 2);
  }

  const desertAlbedo = new THREE.CanvasTexture(dCanvas);
  desertAlbedo.colorSpace = THREE.SRGBColorSpace;
  desertAlbedo.wrapS = THREE.RepeatWrapping;
  desertAlbedo.wrapT = THREE.RepeatWrapping;
  desertAlbedo.repeat.set(42, 42);
  desertAlbedo.anisotropy = safeAniso;

  // 3. Concrete launch/landing pad texture with concentric rings and scorch center
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 1024;
  pCanvas.height = 1024;
  const pCtx = pCanvas.getContext('2d')!;
  pCtx.fillStyle = '#94a3b8';
  pCtx.fillRect(0, 0, 1024, 1024);

  // Concrete slab grid seams
  pCtx.strokeStyle = 'rgba(30, 41, 59, 0.22)';
  pCtx.lineWidth = 3;
  for (let i = 128; i < 1024; i += 128) {
    pCtx.beginPath();
    pCtx.moveTo(i, 0);
    pCtx.lineTo(i, 1024);
    pCtx.stroke();
    pCtx.beginPath();
    pCtx.moveTo(0, i);
    pCtx.lineTo(1024, i);
    pCtx.stroke();
  }

  // Central exhaust scorch mark
  const scorch = pCtx.createRadialGradient(512, 512, 20, 512, 512, 320);
  scorch.addColorStop(0, 'rgba(15, 23, 42, 0.62)');
  scorch.addColorStop(0.45, 'rgba(30, 41, 59, 0.28)');
  scorch.addColorStop(1, 'rgba(30, 41, 59, 0)');
  pCtx.fillStyle = scorch;
  pCtx.beginPath();
  pCtx.arc(512, 512, 320, 0, Math.PI * 2);
  pCtx.fill();

  // Calibrated landing target rings & hazard border
  const drawRing = (r: number, color: string, width: number, dashed = false) => {
    pCtx.save();
    pCtx.strokeStyle = color;
    pCtx.lineWidth = width;
    if (dashed) pCtx.setLineDash([22, 16]);
    pCtx.beginPath();
    pCtx.arc(512, 512, r, 0, Math.PI * 2);
    pCtx.stroke();
    pCtx.restore();
  };
  drawRing(440, '#f59e0b', 14, true);
  drawRing(300, '#f8fafc', 10, false);
  drawRing(160, '#0ea5e9', 10, false);
  drawRing(54, '#f8fafc', 8, false);

  // Crosshair ticks
  pCtx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
  pCtx.lineWidth = 8;
  const ticks = [
    [512, 80, 512, 210],
    [512, 814, 512, 944],
    [80, 512, 210, 512],
    [814, 512, 944, 512],
  ];
  for (const [x1, y1, x2, y2] of ticks) {
    pCtx.beginPath();
    pCtx.moveTo(x1, y1);
    pCtx.lineTo(x2, y2);
    pCtx.stroke();
  }

  const padAlbedo = new THREE.CanvasTexture(pCanvas);
  padAlbedo.colorSpace = THREE.SRGBColorSpace;
  padAlbedo.anisotropy = safeAniso;

  // 4. Soft radial plume smoke sprite
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 128;
  sCanvas.height = 128;
  const sCtx = sCanvas.getContext('2d')!;
  const sg = sCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
  sg.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  sg.addColorStop(0.4, 'rgba(241, 245, 249, 0.55)');
  sg.addColorStop(1, 'rgba(226, 232, 240, 0)');
  sCtx.fillStyle = sg;
  sCtx.fillRect(0, 0, 128, 128);

  const plumeSprite = new THREE.CanvasTexture(sCanvas);
  plumeSprite.colorSpace = THREE.SRGBColorSpace;

  return {
    fuselageAlbedo,
    desertAlbedo,
    padAlbedo,
    plumeSprite,
    dispose: () => {
      fuselageAlbedo.dispose();
      desertAlbedo.dispose();
      padAlbedo.dispose();
      plumeSprite.dispose();
    },
  };
}
