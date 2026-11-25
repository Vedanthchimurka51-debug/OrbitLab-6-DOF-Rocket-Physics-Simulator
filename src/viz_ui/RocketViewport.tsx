import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { rotateVecByQuatConj, vecCross } from '../physics/math';
import type { RocketSimulator } from '../physics/simulator';
import type { TelemetrySnapshot } from '../physics/types';
import { createCrashEffects } from './crashEffects';
import { createDesertEnvironment } from './desertScene';
import { createRocketMesh } from './rocketMesh';
import { createProceduralTextures } from './textures';
import type { CameraPreset, InteractionMode } from './types';

interface RocketViewportProps {
  simulatorRef: React.MutableRefObject<RocketSimulator>;
  isPlaying: boolean;
  timeScale: number;
  showVectors: boolean;
  showTrajectory: boolean;
  soundEnabled: boolean;
  interactionMode: InteractionMode;
  cameraPreset: CameraPreset;
  onCameraPresetRelease: () => void;
  onTelemetry: (snapshot: TelemetrySnapshot) => void;
  onTargetChanged: (x: number, z: number) => void;
  onWebglError: (msg: string) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _plane = new THREE.Plane();
const _ndc = new THREE.Vector2();

export function RocketViewport({
  simulatorRef,
  isPlaying,
  timeScale,
  showVectors,
  showTrajectory,
  soundEnabled,
  interactionMode,
  cameraPreset,
  onCameraPresetRelease,
  onTelemetry,
  onTargetChanged,
  onWebglError,
  onCanvasReady,
}: RocketViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onCanvasReadyRef = useRef(onCanvasReady);
  onCanvasReadyRef.current = onCanvasReady;

  // Store latest props in refs so WebGL lifecycle never tears down on UI updates
  const propsRef = useRef({
    isPlaying,
    timeScale,
    showVectors,
    showTrajectory,
    soundEnabled,
    interactionMode,
    cameraPreset,
    onCameraPresetRelease,
    onTelemetry,
    onTargetChanged,
  });
  propsRef.current = {
    isPlaying,
    timeScale,
    showVectors,
    showTrajectory,
    soundEnabled,
    interactionMode,
    cameraPreset,
    onCameraPresetRelease,
    onTelemetry,
    onTargetChanged,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Software WebGL probe (SwiftShader, llvmpipe, etc.)
    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      onWebglError('WebGL2 is unavailable in this browser context.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);
    onCanvasReadyRef.current?.(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      onWebglError('WebGL context lost.');
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();

    // Procedural Studio IBL Environment Map on every device
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.4, 1400);
    camera.position.set(52, 68, 86);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 8;
    controls.maxDistance = 420;
    controls.maxPolarAngle = Math.PI * 0.492;
    controls.target.set(0, 32, 0);
    controls.update();

    // Cancel automatic camera preset transition when user interacts manually
    controls.addEventListener('start', () => {
      if (propsRef.current.cameraPreset !== 'free' && propsRef.current.cameraPreset !== 'follow') {
        propsRef.current.onCameraPresetRelease();
      }
    });

    // Three-point warm/cool daylight lighting rig (only 1 shadow caster)
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0xb8956a, 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.35);
    sunLight.position.set(75, 130, 55);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 380;
    const d = 65;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.03;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
    rimLight.position.set(-70, 45, -80);
    scene.add(rimLight);

    // Procedural textures, desert environment, crash FX & composite booster mesh
    const textures = createProceduralTextures(renderer.capabilities.getMaxAnisotropy());
    const desert = createDesertEnvironment(scene, textures);
    const crashEffects = createCrashEffects(scene, textures);
    const rocketMesh = createRocketMesh(simulatorRef.current.params, textures);
    scene.add(rocketMesh.root);
    let wasCrashed = false;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycaster setup (layer 1 for simplified rocket proxy, layer 0 for desert pad)
    const rocketRaycaster = new THREE.Raycaster();
    rocketRaycaster.layers.set(1);
    const groundRaycaster = new THREE.Raycaster();
    groundRaycaster.layers.set(0);

    // Active pointer drag state
    let activePointerId: number | null = null;
    let dragKind: 'grab' | 'poke' | null = null;
    const grabOffset = new THREE.Vector3();
    const pokeHitWorld = new THREE.Vector3();
    const pokeHitLocal = new THREE.Vector3();
    const pokeCurrentWorld = new THREE.Vector3();

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      const mode = propsRef.current.interactionMode;
      if (mode === 'orbit') return;

      updateNdc(e.clientX, e.clientY);

      if (mode === 'target') {
        groundRaycaster.setFromCamera(_ndc, camera);
        const hits = groundRaycaster.intersectObject(desert.groundMesh, false);
        if (hits.length > 0) {
          const p = hits[0].point;
          const clampedX = THREE.MathUtils.clamp(p.x, -120, 120);
          const clampedZ = THREE.MathUtils.clamp(p.z, -120, 120);
          simulatorRef.current.setTargetPad(clampedX, clampedZ);
          desert.setTargetBeaconPosition(clampedX, clampedZ);
          propsRef.current.onTargetChanged(clampedX, clampedZ);
        }
        return;
      }

      if (mode === 'grab' || mode === 'poke') {
        rocketRaycaster.setFromCamera(_ndc, camera);
        const hits = rocketRaycaster.intersectObject(rocketMesh.raycastProxy, false);
        if (hits.length === 0) return;

        activePointerId = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
        controls.enabled = false;

        const sim = simulatorRef.current;
        camera.getWorldDirection(_vec3A);

        if (mode === 'grab') {
          dragKind = 'grab';
          _vec3B.set(sim.state.position.x, sim.state.position.y, sim.state.position.z);
          _plane.setFromNormalAndCoplanarPoint(_vec3A, _vec3B);
          if (rocketRaycaster.ray.intersectPlane(_plane, _vec3C)) {
            grabOffset.copy(_vec3B).sub(_vec3C);
          } else {
            grabOffset.set(0, 0, 0);
          }
          sim.setGrabbed(true);
        } else {
          dragKind = 'poke';
          pokeHitWorld.copy(hits[0].point);
          pokeCurrentWorld.copy(hits[0].point);
          pokeHitLocal.copy(hits[0].point);
          rocketMesh.root.worldToLocal(pokeHitLocal);
          _plane.setFromNormalAndCoplanarPoint(_vec3A, pokeHitWorld);
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId || !dragKind) return;
      updateNdc(e.clientX, e.clientY);
      rocketRaycaster.setFromCamera(_ndc, camera);

      if (!rocketRaycaster.ray.intersectPlane(_plane, _vec3C)) return;

      if (dragKind === 'grab') {
        _vec3C.add(grabOffset);
        simulatorRef.current.setGrabbed(true, {
          x: THREE.MathUtils.clamp(_vec3C.x, -120, 120),
          y: Math.max(10.5, _vec3C.y),
          z: THREE.MathUtils.clamp(_vec3C.z, -120, 120),
        });
      } else if (dragKind === 'poke') {
        pokeCurrentWorld.copy(_vec3C);
        _vec3B.copy(pokeCurrentWorld).sub(pokeHitWorld);
        const dragDist = _vec3B.length();
        if (dragDist > 0.2) {
          const preview = desert.forceArrows.previewPoke;
          preview.visible = true;
          preview.position.copy(pokeHitWorld);
          _vec3A.copy(_vec3B).normalize();
          preview.setDirection(_vec3A);
          const len = THREE.MathUtils.clamp(dragDist, 1.5, 18);
          preview.setLength(len, 1.2, 0.55);
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      if (dragKind === 'grab') {
        simulatorRef.current.setGrabbed(false);
      } else if (dragKind === 'poke') {
        desert.forceArrows.previewPoke.visible = false;
        _vec3B.copy(pokeCurrentWorld).sub(pokeHitWorld);
        let forceWorld: { x: number; y: number; z: number };

        if (_vec3B.length() < 0.6) {
          // Single-tap quick impulse perpendicular to camera view
          camera.getWorldDirection(_vec3A);
          _vec3C.set(-_vec3A.z, 0, _vec3A.x).normalize();
          forceWorld = { x: _vec3C.x * 20000, y: 2000, z: _vec3C.z * 20000 };
        } else {
          const scale = 3200;
          const rawMag = _vec3B.length() * scale;
          const clampedMag = Math.min(75000, rawMag);
          _vec3B.normalize().multiplyScalar(clampedMag);
          forceWorld = { x: _vec3B.x, y: _vec3B.y, z: _vec3B.z };
        }

        const sim = simulatorRef.current;
        const forceBody = rotateVecByQuatConj(forceWorld, sim.state.orientation);
        const torqueBody = vecCross(
          { x: pokeHitLocal.x, y: pokeHitLocal.y, z: pokeHitLocal.z },
          forceBody
        );
        sim.applyUserImpulse(forceWorld, torqueBody, 0.3);
      }

      activePointerId = null;
      dragKind = null;
      controls.enabled = propsRef.current.interactionMode === 'orbit';
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    // Resize observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop + Software WebGL pacing
    let frameId = 0;
    let disposed = false;
    let lastTimeMs = performance.now();
    let telemetryTimer = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;

      const nowMs = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (nowMs - lastTimeMs) / 1000));
      lastTimeMs = nowMs;

      const {
        isPlaying: playing,
        timeScale: speed,
        showVectors: vectorsOn,
        showTrajectory: trajOn,
        interactionMode: iMode,
        cameraPreset: camPreset,
      } = propsRef.current;

      // Only allow OrbitControls dragging when in Orbit mode and not actively dragging rocket
      if (!dragKind) {
        controls.enabled = iMode === 'orbit';
      }

      const sim = simulatorRef.current;
      if (playing) {
        sim.advance(rawDt * speed);
      }

      // Sync Rocket 3D transform from physics state
      const st = sim.state;
      rocketMesh.root.position.set(st.position.x, st.position.y, st.position.z);
      rocketMesh.root.quaternion.set(
        st.orientation.x,
        st.orientation.y,
        st.orientation.z,
        st.orientation.w
      );
      rocketMesh.updateVisuals({
        throttle: st.throttle,
        gimbalPitch: st.gimbalPitch,
        gimbalYaw: st.gimbalYaw,
        legDeployment: st.legDeployment,
        time: st.flightTime,
      });

      // Keep shadow frustum centered near rocket/pad horizontally
      sunLight.target.position.set(st.position.x * 0.4, 0, st.position.z * 0.4);
      sunLight.position.set(st.position.x * 0.4 + 75, 130, st.position.z * 0.4 + 55);

      // Update trajectory, target beacon, windsock, and 3D force arrows
      desert.setTargetBeaconPosition(sim.config.targetPadX, sim.config.targetPadZ);
      desert.trajectoryLine.visible = trajOn;
      if (trajOn) {
        desert.updateTrajectory(sim.trajectory);
      }
      desert.updateForces(st.position, sim.lastForces, vectorsOn);
      desert.updateWindsock(sim.env.windSpeedX, sim.env.windSpeedZ, nowMs * 0.001);

      // Detect crash transition & update 3D crash fireball/debris/smoke
      const isCrashedNow = st.touchdownStatus === 'crash_tipover';
      if (isCrashedNow && !wasCrashed) {
        wasCrashed = true;
        crashEffects.trigger(
          st.crashPoint ?? st.position,
          st.crashIntensity || 0.75,
          propsRef.current.soundEnabled
        );
        rocketMesh.setCrashedVisual(true);
      } else if (!isCrashedNow && wasCrashed) {
        wasCrashed = false;
        crashEffects.reset();
        rocketMesh.setCrashedVisual(false);
      }
      crashEffects.update(playing ? rawDt * speed : 0, sim.lastForces.gravityMag);

      // Update plume particles from nozzle world position & exhaust direction
      rocketMesh.flameGroup.getWorldPosition(_vec3A);
      _quatA.set(st.orientation.x, st.orientation.y, st.orientation.z, st.orientation.w);
      _vec3B.set(0, -1, 0).applyQuaternion(_quatA).normalize();
      desert.updatePlumeParticles(
        playing ? rawDt * speed : 0,
        playing && !st.isGrabbed && !isCrashedNow,
        _vec3A,
        _vec3B,
        st.throttle
      );

      // Smooth damped camera preset tracking
      if (camPreset === 'follow') {
        const targetY = Math.max(8, st.position.y);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, st.position.x, 5.5, rawDt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, targetY, 5.5, rawDt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, st.position.z, 5.5, rawDt);
      } else if (camPreset === 'pad') {
        controls.target.x = THREE.MathUtils.damp(controls.target.x, sim.config.targetPadX, 5, rawDt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, 10, 5, rawDt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, sim.config.targetPadZ, 5, rawDt);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, sim.config.targetPadX + 34, 4, rawDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, 18, 4, rawDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, sim.config.targetPadZ + 40, 4, rawDt);
      } else if (camPreset === 'side') {
        controls.target.x = THREE.MathUtils.damp(controls.target.x, st.position.x * 0.5, 4.5, rawDt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, Math.max(24, st.position.y * 0.6), 4.5, rawDt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, 0, 4.5, rawDt);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, st.position.x * 0.5, 4, rawDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, Math.max(36, st.position.y * 0.65), 4, rawDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, 135, 4, rawDt);
      }

      controls.update();
      crashEffects.getCameraShakeOffset(_vec3C);
      camera.position.add(_vec3C);
      renderer.render(scene, camera);
      camera.position.sub(_vec3C);

      telemetryTimer += rawDt;
      if (telemetryTimer >= 0.05) {
        telemetryTimer = 0;
        propsRef.current.onTelemetry(sim.getTelemetry());
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    // Emit initial telemetry snapshot and start loop
    onTelemetry(simulatorRef.current.getTelemetry());
    if (isSoftwareGl) {
      tick();
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      controls.dispose();
      crashEffects.dispose();
      rocketMesh.dispose();
      desert.dispose();
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      onCanvasReadyRef.current?.(null);
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, [simulatorRef, onWebglError, onTelemetry]);

  const cursorClass =
    interactionMode === 'orbit'
      ? 'cursor-grab active:cursor-grabbing'
      : interactionMode === 'grab'
        ? 'cursor-move'
        : 'cursor-crosshair';

  return <div ref={mountRef} className={`w-full h-full ${cursorClass}`} />;
}
