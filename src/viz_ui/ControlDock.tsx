import {
  Atom,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  Hand,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Square,
  StepForward,
  Video,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { getExhaustVelocity, getMaxThrust } from '../physics/propulsion';
import type {
  EnvironmentParams,
  FidelityMode,
  FlightMode,
  ManualInputs,
  RocketParams,
  SimulationConfig,
  TelemetrySnapshot,
} from '../physics/types';
import type { InteractionMode } from './types';

export type PhysicsPresetId =
  | 'earth_landing'
  | 'crash_test'
  | 'vacuum_drop'
  | 'mars_landing'
  | 'moon_drop';

interface ControlDockProps {
  isPlaying: boolean;
  timeScale: number;
  config: SimulationConfig;
  params: RocketParams;
  env: EnvironmentParams;
  manualInputs: ManualInputs;
  telemetry: TelemetrySnapshot;
  interactionMode: InteractionMode;
  showVectors: boolean;
  showTrajectory: boolean;
  soundEnabled: boolean;
  isCollapsed: boolean;
  isRecording: boolean;
  recordSeconds: number;
  onToggleCollapse: () => void;
  onTogglePlay: () => void;
  onStepFrame: () => void;
  onReset: () => void;
  onChangeTimeScale: (scale: number) => void;
  onChangeFlightMode: (mode: FlightMode) => void;
  onChangeFidelity: (fidelity: FidelityMode) => void;
  onChangeInteractionMode: (mode: InteractionMode) => void;
  onToggleVectors: () => void;
  onToggleTrajectory: () => void;
  onToggleSound: () => void;
  onToggleRecord: () => void;
  onApplyPreset: (presetId: PhysicsPresetId) => void;
  onUpdateManual: (patch: Partial<ManualInputs>) => void;
  onUpdateParams: (patch: Partial<RocketParams>) => void;
  onUpdateEnv: (patch: Partial<EnvironmentParams>) => void;
  onUpdateInitialAltitude: (alt: number) => void;
}

const FLIGHT_MODES: { id: FlightMode; label: string }[] = [
  { id: 'landing', label: 'Propulsive Landing' },
  { id: 'freefall', label: 'Free-Fall Drop' },
  { id: 'ascent', label: 'Launch & Gravity Turn' },
  { id: 'manual', label: 'Manual Sandbox' },
];

const INTERACTION_MODES: {
  id: InteractionMode;
  label: string;
  hint: string;
  Icon: typeof Orbit;
}[] = [
  { id: 'orbit', label: 'Camera Orbit', hint: 'Drag to orbit, pinch/scroll to zoom', Icon: Orbit },
  { id: 'grab', label: 'Grab Rocket', hint: 'Drag rocket in 3D space and release', Icon: Hand },
  { id: 'poke', label: 'Impulse Poke', hint: 'Tap or drag rocket to apply disturbance force', Icon: Zap },
  { id: 'target', label: 'Set Target', hint: 'Tap desert floor to relocate landing pad', Icon: Crosshair },
];

const PHYSICS_PRESETS: { id: PhysicsPresetId; label: string; summary: string }[] = [
  { id: 'earth_landing', label: 'Earth Hover-Slam', summary: '120 m · g=9.81 · Crosswind' },
  { id: 'crash_test', label: 'Crash Impact Lab', summary: '200 m · Unpowered · Debris & Blast' },
  { id: 'vacuum_drop', label: 'Vacuum Free-Fall', summary: '180 m · ρ=0 · Pure y=½gt²' },
  { id: 'mars_landing', label: 'Mars Landing', summary: '140 m · g=3.72 · Thin CO₂' },
  { id: 'moon_drop', label: 'Lunar Descent', summary: '120 m · g=1.62 · Vacuum' },
];

export function ControlDock({
  isPlaying,
  timeScale,
  config,
  params,
  env,
  manualInputs,
  telemetry,
  interactionMode,
  showVectors,
  showTrajectory,
  soundEnabled,
  isCollapsed,
  isRecording,
  recordSeconds,
  onToggleCollapse,
  onTogglePlay,
  onStepFrame,
  onReset,
  onChangeTimeScale,
  onChangeFlightMode,
  onChangeFidelity,
  onChangeInteractionMode,
  onToggleVectors,
  onToggleTrajectory,
  onToggleSound,
  onToggleRecord,
  onApplyPreset,
  onUpdateManual,
  onUpdateParams,
  onUpdateEnv,
  onUpdateInitialAltitude,
}: ControlDockProps) {
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'tuning' | 'physics'>('none');

  const exhaustVel = getExhaustVelocity(params, env);
  const maxThrustKn = getMaxThrust(params, env) / 1000;
  const activeHint =
    INTERACTION_MODES.find((m) => m.id === interactionMode)?.hint ?? '';

  const totalEnergyMJ = (telemetry.kineticEnergyJ + telemetry.potentialEnergyJ) / 1e6;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center px-3 pb-3 sm:pb-4">
      {/* Collapse / Expand Drawer Handle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? 'Show Controls' : 'Hide Controls'}
        className="pointer-events-auto mb-1.5 flex items-center gap-1.5 rounded-t-lg border border-b-0 border-slate-700/80 bg-slate-950/92 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
      >
        {isCollapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
            <span>Show Controls (H)</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
            <span>Hide Controls (H)</span>
          </>
        )}
      </button>

      {/* Collapsible Unified Bottom Dock */}
      {!isCollapsed && (
        <div className="pointer-events-auto w-full max-w-[1080px] rounded-xl border border-slate-700/80 bg-slate-950/92 p-3 text-slate-100 shadow-xl">
          {/* Physics Lab Drawer: Experiment Presets & Live Conservation Equations */}
          {activeDrawer === 'physics' && (
            <div className="mb-3 space-y-3 border-b border-slate-800 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200">
                  Physics Experiment Presets
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PHYSICS_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onApplyPreset(p.id)}
                      title={p.summary}
                      className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                        p.id === 'crash_test'
                          ? 'border-rose-500/60 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                          : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
                <PhysicsStat
                  label="Kinetic Energy (Ek)"
                  value={`${(telemetry.kineticEnergyJ / 1e6).toFixed(3)} MJ`}
                  formula="½mv² + ½Iω²"
                />
                <PhysicsStat
                  label="Potential Energy (Ep)"
                  value={`${(telemetry.potentialEnergyJ / 1e6).toFixed(3)} MJ`}
                  formula="m·g(y)·h"
                />
                <PhysicsStat
                  label="Mechanical (Ek + Ep)"
                  value={`${totalEnergyMJ.toFixed(3)} MJ`}
                  formula="Work-Energy"
                />
                <PhysicsStat
                  label="Thrust Power (P)"
                  value={`${(telemetry.thrustPowerW / 1e6).toFixed(2)} MW`}
                  formula="F_T · v"
                />
                <PhysicsStat
                  label="Net Force ||F||"
                  value={`${(telemetry.netForceMag / 1000).toFixed(1)} kN`}
                  formula="m·a = ΣF"
                />
                <PhysicsStat
                  label="Torque (TVC / Aero)"
                  value={`${(telemetry.tvcTorqueMag / 1000).toFixed(1)} / ${(telemetry.aeroTorqueMag / 1000).toFixed(1)} kN·m`}
                  formula="r × F"
                />
              </div>
            </div>
          )}

          {/* Expandable Physics Parameter Sliders Drawer */}
          {activeDrawer === 'tuning' && (
            <div className="mb-3 space-y-3 border-b border-slate-800 pb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-2.5">
                <SliderRow
                  label={`Exhaust Vel (Isp ${params.isp.toFixed(0)} s)`}
                  valueLabel={`${exhaustVel.toFixed(0)} m/s (${maxThrustKn.toFixed(0)} kN)`}
                  min={200}
                  max={380}
                  step={5}
                  value={params.isp}
                  onChange={(v) => onUpdateParams({ isp: v })}
                />
                <SliderRow
                  label="Propellant Mass"
                  valueLabel={`${params.propellantMassInitial.toFixed(0)} kg`}
                  min={3000}
                  max={22000}
                  step={500}
                  value={params.propellantMassInitial}
                  onChange={(v) => onUpdateParams({ propellantMassInitial: v })}
                />
                <SliderRow
                  label="Drag Coefficient (Cd)"
                  valueLabel={params.dragCoeff.toFixed(2)}
                  min={0.0}
                  max={1.4}
                  step={0.05}
                  value={params.dragCoeff}
                  onChange={(v) => onUpdateParams({ dragCoeff: v })}
                />
                <SliderRow
                  label="Crosswind X"
                  valueLabel={`${env.windSpeedX.toFixed(1)} m/s`}
                  min={-15}
                  max={15}
                  step={0.5}
                  value={env.windSpeedX}
                  onChange={(v) => onUpdateEnv({ windSpeedX: v })}
                />
                <SliderRow
                  label="Initial Altitude"
                  valueLabel={`${config.initialAltitude.toFixed(0)} m`}
                  min={30}
                  max={300}
                  step={10}
                  value={config.initialAltitude}
                  onChange={onUpdateInitialAltitude}
                />
                <SliderRow
                  label="CoP Offset (r_CoP)"
                  valueLabel={`${params.copOffset >= 0 ? '+' : ''}${params.copOffset.toFixed(2)} m`}
                  min={-3.0}
                  max={3.0}
                  step={0.1}
                  value={params.copOffset}
                  onChange={(v) => onUpdateParams({ copOffset: v })}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Gravity:</span>
                  <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800">
                    {[
                      { label: 'Earth 9.81', g0: 9.80665, r: 6371000 },
                      { label: 'Mars 3.72', g0: 3.721, r: 3389500 },
                      { label: 'Moon 1.62', g0: 1.62, r: 1737400 },
                    ].map((body) => (
                      <button
                        key={body.label}
                        type="button"
                        onClick={() => onUpdateEnv({ g0: body.g0, earthRadius: body.r })}
                        className={`min-h-[30px] px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          Math.abs(env.g0 - body.g0) < 0.05
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {body.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateEnv({ rho0: env.rho0 > 0.01 ? 0 : 1.225 })}
                    className={`min-h-[34px] px-3 text-xs font-medium rounded-lg border whitespace-nowrap cursor-pointer ${
                      env.rho0 === 0
                        ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                        : 'border-slate-700 bg-slate-900 text-slate-200'
                    }`}
                  >
                    {env.rho0 === 0 ? 'Vacuum (ρ=0)' : `Atmo (ρ=${env.rho0.toFixed(2)})`}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">Fidelity:</span>
                  <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800">
                    {(['1d', '2d', '3d'] as FidelityMode[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => onChangeFidelity(f)}
                        className={`min-h-[30px] px-2.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                          config.fidelity === f
                            ? 'bg-sky-500 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manual Flight Sandbox Direct Controls */}
          {config.flightMode === 'manual' && (
            <div className="mb-3 grid grid-cols-1 sm:grid-cols-4 gap-3 border-b border-slate-800 pb-3 items-center">
              <SliderRow
                label="Manual Throttle"
                valueLabel={`${(manualInputs.throttle * 100).toFixed(0)}%`}
                min={0}
                max={1}
                step={0.02}
                value={manualInputs.throttle}
                onChange={(v) => onUpdateManual({ throttle: v })}
              />
              <SliderRow
                label="TVC Pitch (W/S)"
                valueLabel={`${(manualInputs.pitch * 12).toFixed(1)}°`}
                min={-1}
                max={1}
                step={0.05}
                value={manualInputs.pitch}
                onChange={(v) => onUpdateManual({ pitch: v })}
              />
              <SliderRow
                label="TVC Yaw (A/D)"
                valueLabel={`${(manualInputs.yaw * 12).toFixed(1)}°`}
                min={-1}
                max={1}
                step={0.05}
                value={manualInputs.yaw}
                onChange={(v) => onUpdateManual({ yaw: v })}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateManual({ pitch: 0, yaw: 0, roll: 0 })}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                >
                  Center Trim
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateManual({ deployLegs: !manualInputs.deployLegs })}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap cursor-pointer ${
                    manualInputs.deployLegs
                      ? 'border-sky-500 bg-sky-500/20 text-sky-300'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  {manualInputs.deployLegs ? 'Legs Deployed' : 'Legs Stowed'}
                </button>
              </div>
            </div>
          )}

          {/* Primary Row 1: Flight Modes + Transport Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800 overflow-x-auto max-w-full">
              {FLIGHT_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChangeFlightMode(m.id)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    config.flightMode === m.id
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onTogglePlay}
                className="flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                onClick={onStepFrame}
                title="Advance 1 RK4 frame (20ms)"
                className="flex items-center gap-1 min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <StepForward className="w-3.5 h-3.5" />
                <span>Step</span>
              </button>

              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeTimeScale(timeScale === 1 ? 0.5 : timeScale === 0.5 ? 2 : 1)
                }
                className="min-h-[40px] px-2.5 py-2 font-mono-tabular text-xs font-semibold rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {timeScale}x
              </button>
            </div>
          </div>

          {/* Primary Row 2: 3D Touch Interaction Mode + Visuals, Physics Lab & Tuning Toggle */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800 overflow-x-auto max-w-full">
                {INTERACTION_MODES.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChangeInteractionMode(id)}
                    className={`flex items-center gap-1.5 min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      interactionMode === id
                        ? 'bg-emerald-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <span className="hidden xl:inline text-xs text-slate-400">{activeHint}</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleVectors}
                className={`flex items-center gap-1.5 min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showVectors
                    ? 'border-sky-500/70 bg-sky-500/15 text-sky-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Vectors</span>
              </button>

              <button
                type="button"
                onClick={onToggleTrajectory}
                className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showTrajectory
                    ? 'border-sky-500/70 bg-sky-500/15 text-sky-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                Path
              </button>

              <button
                type="button"
                onClick={onToggleSound}
                title={soundEnabled ? 'Mute crash audio' : 'Enable crash audio'}
                className={`flex items-center justify-center min-h-[38px] w-9 rounded-lg border transition-colors cursor-pointer ${
                  soundEnabled
                    ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-800 bg-slate-900/60 text-slate-500'
                }`}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={onToggleRecord}
                title="Record 60fps 3D simulation clip (.webm)"
                className={`flex items-center gap-1.5 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isRecording
                    ? 'border-rose-500 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    <span className="font-mono-tabular">
                      REC {Math.floor(recordSeconds / 60).toString().padStart(2, '0')}:
                      {(recordSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5 text-rose-400" />
                    <span>Record</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveDrawer((d) => (d === 'physics' ? 'none' : 'physics'))
                }
                className={`flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeDrawer === 'physics'
                    ? 'border-sky-400 bg-sky-500/20 text-sky-300'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Atom className="w-3.5 h-3.5" />
                <span>Physics Lab</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveDrawer((d) => (d === 'tuning' ? 'none' : 'tuning'))
                }
                className={`flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeDrawer === 'tuning'
                    ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Parameters</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PhysicsStat({
  label,
  value,
  formula,
}: {
  label: string;
  value: string;
  formula: string;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] font-medium text-slate-400 truncate">{label}</span>
      <span className="font-mono-tabular text-xs font-semibold text-sky-300 truncate">
        {value}
      </span>
      <span className="font-mono-tabular text-[10px] text-slate-500 truncate">{formula}</span>
    </div>
  );
}

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-300 truncate">{label}</span>
        <span className="font-mono-tabular font-semibold text-sky-300 whitespace-nowrap">
          {valueLabel}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="sim-slider w-full"
      />
    </label>
  );
}
