import { useCallback, useEffect, useRef, useState } from 'react';
import { rotateVecByQuatConj, vecCross } from './physics/math';
import { FIXED_PHYSICS_DT, RocketSimulator } from './physics/simulator';
import {
  DEFAULT_ENV_PARAMS,
  DEFAULT_ROCKET_PARAMS,
  DEFAULT_SIM_CONFIG,
  type EnvironmentParams,
  type FidelityMode,
  type FlightMode,
  type ManualInputs,
  type RocketParams,
  type SimulationConfig,
  type TelemetrySnapshot,
} from './physics/types';
import { ControlDock, type PhysicsPresetId } from './viz_ui/ControlDock';
import { HowItWorksTour, TOUR_CHAPTERS } from './viz_ui/HowItWorksTour';
import { RocketViewport } from './viz_ui/RocketViewport';
import { TelemetryRibbon } from './viz_ui/TelemetryRibbon';
import type { CameraPreset, InteractionMode } from './viz_ui/types';
import { useCanvasRecorder } from './viz_ui/useCanvasRecorder';
import { VerificationModal } from './viz_ui/VerificationModal';

export default function App() {
  const simulatorRef = useRef<RocketSimulator>(new RocketSimulator());

  const [isPlaying, setIsPlaying] = useState(true);
  const [timeScale, setTimeScale] = useState(1);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('orbit');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('follow');
  const cameraPresetRef = useRef<CameraPreset>('follow');
  cameraPresetRef.current = cameraPreset;
  const [showVectors, setShowVectors] = useState(true);
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState(false);
  const [isVerificationOpen, setIsVerificationOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [tourChapterIndex, setTourChapterIndex] = useState(0);
  const [disturbanceFired, setDisturbanceFired] = useState(false);
  const disturbanceFiredRef = useRef(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [webglCanvas, setWebglCanvas] = useState<HTMLCanvasElement | null>(null);
  const [frameRocketToken, setFrameRocketToken] = useState(0);

  const [config, setConfig] = useState<SimulationConfig>({ ...DEFAULT_SIM_CONFIG });
  const [params, setParams] = useState<RocketParams>({ ...DEFAULT_ROCKET_PARAMS });
  const [env, setEnv] = useState<EnvironmentParams>({ ...DEFAULT_ENV_PARAMS });
  const [manualInputs, setManualInputs] = useState<ManualInputs>({
    ...simulatorRef.current.manualInputs,
  });
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(() =>
    simulatorRef.current.getTelemetry()
  );

  const {
    isRecording,
    recordSeconds,
    recorderError,
    clearRecorderError,
    toggleRecording,
  } = useCanvasRecorder(webglCanvas);

  const handleTelemetry = useCallback((snap: TelemetrySnapshot) => {
    setTelemetry(snap);
  }, []);

  const handleCameraPresetRelease = useCallback(() => {
    setCameraPreset('free');
  }, []);

  const handleTargetChanged = useCallback((x: number, z: number) => {
    setConfig((prev) => ({ ...prev, targetPadX: x, targetPadZ: z }));
  }, []);

  const handleWebglError = useCallback((msg: string) => {
    setWebglError(msg);
  }, []);

  // Automatically trigger lateral disturbance during Tour Chapter 2 ("pid_recovery")
  useEffect(() => {
    if (!isTourOpen) return;
    const chapter = TOUR_CHAPTERS[tourChapterIndex];
    if (
      chapter?.id === 'pid_recovery' &&
      !disturbanceFiredRef.current &&
      telemetry.flightTime >= 1.4 &&
      telemetry.touchdownStatus === 'in_flight'
    ) {
      disturbanceFiredRef.current = true;
      setDisturbanceFired(true);
      const sim = simulatorRef.current;
      const forceWorld = { x: 28000, y: 1500, z: -9000 };
      const forceBody = rotateVecByQuatConj(forceWorld, sim.state.orientation);
      const torqueBody = vecCross({ x: 0, y: 5.5, z: 0 }, forceBody);
      sim.applyUserImpulse(forceWorld, torqueBody, 0.35);
    }
  }, [isTourOpen, tourChapterIndex, telemetry.flightTime, telemetry.touchdownStatus]);

  const applyTourChapter = useCallback((index: number) => {
    const chapter = TOUR_CHAPTERS[index] ?? TOUR_CHAPTERS[0];
    setTourChapterIndex(index);
    disturbanceFiredRef.current = false;
    setDisturbanceFired(false);

    const nextEnv: EnvironmentParams = { ...DEFAULT_ENV_PARAMS };
    const nextParams: RocketParams = { ...DEFAULT_ROCKET_PARAMS };
    let nextConfig: SimulationConfig = { ...DEFAULT_SIM_CONFIG };
    let nextCamera: CameraPreset = 'follow';

    if (chapter.id === 'hover_slam') {
      nextConfig = {
        ...DEFAULT_SIM_CONFIG,
        flightMode: 'landing',
        initialAltitude: 120,
        initialOffsetX: 16,
        initialOffsetZ: -10,
        initialVy: -12,
        initialTiltDeg: 9,
      };
      nextCamera = 'follow';
    } else if (chapter.id === 'pid_recovery') {
      nextConfig = {
        ...DEFAULT_SIM_CONFIG,
        flightMode: 'landing',
        initialAltitude: 115,
        initialOffsetX: 4,
        initialOffsetZ: 0,
        initialVy: -10,
        initialTiltDeg: 2,
      };
      nextCamera = 'follow';
    } else if (chapter.id === 'crash_physics') {
      nextConfig = {
        ...DEFAULT_SIM_CONFIG,
        flightMode: 'freefall',
        initialAltitude: 190,
        initialOffsetX: 6,
        initialOffsetZ: -4,
        initialVy: -22,
        initialTiltDeg: 18,
      };
      nextCamera = 'follow';
    } else if (chapter.id === 'gravity_turn') {
      nextConfig = {
        ...DEFAULT_SIM_CONFIG,
        flightMode: 'ascent',
      };
      nextCamera = 'side';
    } else if (chapter.id === 'free_cam_grab') {
      nextConfig = {
        ...DEFAULT_SIM_CONFIG,
        flightMode: 'landing',
        initialAltitude: 100,
        initialOffsetX: 10,
        initialOffsetZ: -6,
        initialVy: -4,
        initialTiltDeg: 6,
      };
      nextCamera = 'free';
    }

    setEnv(nextEnv);
    setParams(nextParams);
    setConfig(nextConfig);
    setCameraPreset(nextCamera);
    setInteractionMode('orbit');
    setShowVectors(true);
    setShowTrajectory(true);
    setTimeScale(1);
    simulatorRef.current.env = nextEnv;
    simulatorRef.current.params = nextParams;
    simulatorRef.current.reset(nextConfig);
    if (chapter.id === 'free_cam_grab') {
      setFrameRocketToken((t) => t + 1);
    }
    setTelemetry(simulatorRef.current.getTelemetry());
    setIsPlaying(true);
  }, []);

  const handleOpenTour = () => {
    if (isTourOpen) {
      setIsTourOpen(false);
    } else {
      setIsTourOpen(true);
      applyTourChapter(0);
    }
  };

  // Keyboard shortcuts: H to collapse dock, P (or Space outside Free Cam) to play/pause, R to reset, WASD/Shift/Ctrl for manual flight
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const inFreeCam = cameraPresetRef.current === 'free';

      if (e.key === 'h' || e.key === 'H') {
        setIsDockCollapsed((v) => !v);
      } else if (e.key === 'p' || e.key === 'P') {
        setIsPlaying((p) => !p);
      } else if (e.code === 'Space') {
        if (inFreeCam) {
          e.preventDefault();
          if (document.activeElement instanceof HTMLButtonElement) {
            document.activeElement.blur();
          }
        } else {
          e.preventDefault();
          setIsPlaying((p) => !p);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        simulatorRef.current.reset();
        setTelemetry(simulatorRef.current.getTelemetry());
      } else if (simulatorRef.current.config.flightMode === 'manual' && !inFreeCam) {
        const patch: Partial<ManualInputs> = {};
        if (e.key === 'w' || e.key === 'W') patch.pitch = 0.6;
        if (e.key === 's' || e.key === 'S') patch.pitch = -0.6;
        if (e.key === 'a' || e.key === 'A') patch.yaw = 0.6;
        if (e.key === 'd' || e.key === 'D') patch.yaw = -0.6;
        if (e.key === 'Shift') {
          patch.throttle = Math.min(1, simulatorRef.current.manualInputs.throttle + 0.08);
        }
        if (e.key === 'Control') {
          patch.throttle = Math.max(0, simulatorRef.current.manualInputs.throttle - 0.08);
        }
        if (Object.keys(patch).length > 0) {
          simulatorRef.current.manualInputs = {
            ...simulatorRef.current.manualInputs,
            ...patch,
          };
          setManualInputs({ ...simulatorRef.current.manualInputs });
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (cameraPresetRef.current === 'free' && e.code === 'Space') {
        e.preventDefault();
      }
      if (simulatorRef.current.config.flightMode !== 'manual' || cameraPresetRef.current === 'free') return;
      const patch: Partial<ManualInputs> = {};
      if (e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S') patch.pitch = 0;
      if (e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') patch.yaw = 0;
      if (Object.keys(patch).length > 0) {
        simulatorRef.current.manualInputs = {
          ...simulatorRef.current.manualInputs,
          ...patch,
        };
        setManualInputs({ ...simulatorRef.current.manualInputs });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleStepFrame = () => {
    setIsPlaying(false);
    for (let i = 0; i < 4; i++) {
      simulatorRef.current.stepFixed(FIXED_PHYSICS_DT);
    }
    setTelemetry(simulatorRef.current.getTelemetry());
  };

  const handleReset = () => {
    disturbanceFiredRef.current = false;
    setDisturbanceFired(false);
    simulatorRef.current.reset();
    setTelemetry(simulatorRef.current.getTelemetry());
    setIsPlaying(true);
  };

  const handleChangeFlightMode = (flightMode: FlightMode) => {
    const nextConfig: SimulationConfig = { ...config, flightMode };
    setConfig(nextConfig);
    simulatorRef.current.reset(nextConfig);
    setTelemetry(simulatorRef.current.getTelemetry());
    setIsPlaying(true);
  };

  const handleChangeFidelity = (fidelity: FidelityMode) => {
    const nextConfig: SimulationConfig = { ...config, fidelity };
    setConfig(nextConfig);
    simulatorRef.current.reset(nextConfig);
    setTelemetry(simulatorRef.current.getTelemetry());
  };

  const handleUpdateParams = (patch: Partial<RocketParams>) => {
    const next = { ...params, ...patch };
    setParams(next);
    simulatorRef.current.params = next;
  };

  const handleUpdateEnv = (patch: Partial<EnvironmentParams>) => {
    const next = { ...env, ...patch };
    setEnv(next);
    simulatorRef.current.env = next;
  };

  const handleUpdateManual = (patch: Partial<ManualInputs>) => {
    const next = { ...manualInputs, ...patch };
    setManualInputs(next);
    simulatorRef.current.manualInputs = next;
  };

  const handleUpdateInitialAltitude = (initialAltitude: number) => {
    const nextConfig = { ...config, initialAltitude };
    setConfig(nextConfig);
    simulatorRef.current.reset(nextConfig);
    setTelemetry(simulatorRef.current.getTelemetry());
  };

  const handleApplyPreset = (presetId: PhysicsPresetId) => {
    let nextEnv: EnvironmentParams = { ...DEFAULT_ENV_PARAMS };
    const nextParams: RocketParams = { ...DEFAULT_ROCKET_PARAMS };
    let nextConfig: SimulationConfig = { ...DEFAULT_SIM_CONFIG };

    if (presetId === 'crash_test') {
      nextConfig = {
        ...DEFAULT_SIM_CONFIG,
        flightMode: 'freefall',
        initialAltitude: 190,
        initialOffsetX: 6,
        initialOffsetZ: -4,
        initialVy: -22,
        initialTiltDeg: 18,
      };
    } else if (presetId === 'vacuum_drop') {
      nextEnv = { ...DEFAULT_ENV_PARAMS, rho0: 0, windSpeedX: 0, windSpeedZ: 0 };
      nextConfig = {
        ...DEFAULT_SIM_CONFIG,
        flightMode: 'freefall',
        initialAltitude: 180,
        initialOffsetX: 0,
        initialOffsetZ: 0,
        initialVy: 0,
        initialTiltDeg: 0,
      };
    } else if (presetId === 'mars_landing') {
      nextEnv = {
        ...DEFAULT_ENV_PARAMS,
        g0: 3.721,
        earthRadius: 3389500,
        rho0: 0.02,
        scaleHeight: 11100,
        windSpeedX: 4.5,
        windSpeedZ: -2.0,
      };
      nextConfig = {
        ...DEFAULT_SIM_CONFIG,
        flightMode: 'landing',
        initialAltitude: 140,
        initialOffsetX: 16,
        initialOffsetZ: -10,
        initialVy: -10,
      };
    } else if (presetId === 'moon_drop') {
      nextEnv = {
        ...DEFAULT_ENV_PARAMS,
        g0: 1.62,
        earthRadius: 1737400,
        rho0: 0,
        windSpeedX: 0,
        windSpeedZ: 0,
      };
      nextConfig = {
        ...DEFAULT_SIM_CONFIG,
        flightMode: 'landing',
        initialAltitude: 120,
        initialOffsetX: 14,
        initialOffsetZ: 8,
        initialVy: -6,
      };
    }

    setEnv(nextEnv);
    setParams(nextParams);
    setConfig(nextConfig);
    simulatorRef.current.env = nextEnv;
    simulatorRef.current.params = nextParams;
    simulatorRef.current.reset(nextConfig);
    setTelemetry(simulatorRef.current.getTelemetry());
    setIsPlaying(true);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#d6e4f0] select-none">
      {/* 100% Unobstructed 3D Viewport */}
      {webglError ? (
        <div className="flex h-full w-full items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-slate-300 bg-white p-6 text-slate-900 shadow-lg">
            <h1 className="text-lg font-bold">3D WebGL Renderer Unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">{webglError}</p>
            <button
              type="button"
              onClick={() => setIsVerificationOpen(true)}
              className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer"
            >
              Run Headless Physics Verification
            </button>
          </div>
        </div>
      ) : (
        <RocketViewport
          simulatorRef={simulatorRef}
          isPlaying={isPlaying}
          timeScale={timeScale}
          showVectors={showVectors}
          showTrajectory={showTrajectory}
          soundEnabled={soundEnabled}
          interactionMode={interactionMode}
          cameraPreset={cameraPreset}
          onCameraPresetRelease={handleCameraPresetRelease}
          onTelemetry={handleTelemetry}
          onTargetChanged={handleTargetChanged}
          onWebglError={handleWebglError}
          onCanvasReady={setWebglCanvas}
          frameRocketToken={frameRocketToken}
        />
      )}

      {/* Top Telemetry Ribbon */}
      <TelemetryRibbon
        telemetry={telemetry}
        cameraPreset={cameraPreset}
        isTourOpen={isTourOpen}
        isCollapsed={isTopBarCollapsed}
        onToggleCollapse={() => setIsTopBarCollapsed((v) => !v)}
        onSelectCameraPreset={setCameraPreset}
        onOpenTour={handleOpenTour}
        onOpenVerification={() => setIsVerificationOpen(true)}
      />

      {/* Interactive How It Works 3D Demo Tour */}
      <HowItWorksTour
        isOpen={isTourOpen}
        isTopBarCollapsed={isTopBarCollapsed}
        chapterIndex={tourChapterIndex}
        telemetry={telemetry}
        disturbanceFired={disturbanceFired}
        interactionMode={interactionMode}
        isRecording={isRecording}
        recordSeconds={recordSeconds}
        onSelectChapter={applyTourChapter}
        onReplayChapter={() => applyTourChapter(tourChapterIndex)}
        onChangeInteractionMode={setInteractionMode}
        onToggleRecord={toggleRecording}
        onClose={() => setIsTourOpen(false)}
      />

      {/* Non-blocking inline notice if browser lacks MediaRecorder */}
      {recorderError && (
        <div className="fixed right-4 top-[132px] z-30 flex max-w-sm items-center gap-3 rounded-xl border border-rose-500/70 bg-slate-950/95 px-3.5 py-2.5 text-xs text-rose-200 shadow-xl">
          <span>{recorderError}</span>
          <button
            type="button"
            onClick={clearRecorderError}
            className="rounded px-2 py-1 text-[11px] font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Collapsible Bottom Control Dock */}
      <ControlDock
        isPlaying={isPlaying}
        timeScale={timeScale}
        config={config}
        params={params}
        env={env}
        manualInputs={manualInputs}
        telemetry={telemetry}
        interactionMode={interactionMode}
        cameraPreset={cameraPreset}
        showVectors={showVectors}
        showTrajectory={showTrajectory}
        soundEnabled={soundEnabled}
        isCollapsed={isDockCollapsed}
        isRecording={isRecording}
        recordSeconds={recordSeconds}
        onToggleCollapse={() => setIsDockCollapsed((v) => !v)}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStepFrame={handleStepFrame}
        onReset={handleReset}
        onChangeTimeScale={setTimeScale}
        onChangeFlightMode={handleChangeFlightMode}
        onChangeFidelity={handleChangeFidelity}
        onChangeInteractionMode={setInteractionMode}
        onToggleVectors={() => setShowVectors((v) => !v)}
        onToggleTrajectory={() => setShowTrajectory((v) => !v)}
        onToggleSound={() => setSoundEnabled((s) => !s)}
        onToggleRecord={toggleRecording}
        onApplyPreset={handleApplyPreset}
        onUpdateManual={handleUpdateManual}
        onUpdateParams={handleUpdateParams}
        onUpdateEnv={handleUpdateEnv}
        onUpdateInitialAltitude={handleUpdateInitialAltitude}
      />

      {/* Headless Physics Verification Suite Modal */}
      <VerificationModal
        isOpen={isVerificationOpen}
        onClose={() => setIsVerificationOpen(false)}
      />
    </main>
  );
}
