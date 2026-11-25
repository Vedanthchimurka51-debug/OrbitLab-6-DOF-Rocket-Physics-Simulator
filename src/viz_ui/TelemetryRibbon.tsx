import { CheckSquare, ChevronDown, ChevronUp, Film } from 'lucide-react';
import type { TelemetrySnapshot, TouchdownStatus } from '../physics/types';
import type { CameraPreset } from './types';

interface TelemetryRibbonProps {
  telemetry: TelemetrySnapshot;
  cameraPreset: CameraPreset;
  isTourOpen: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  onOpenTour: () => void;
  onOpenVerification: () => void;
}

const STATUS_META: Record<
  TouchdownStatus,
  { label: string; glyph: string; toneClass: string }
> = {
  in_flight: { label: 'In Flight', glyph: '●', toneClass: 'text-sky-400' },
  on_pad: { label: 'On Launch Pad', glyph: '◆', toneClass: 'text-amber-400' },
  safe_landing: { label: 'Safe Landing', glyph: '✓', toneClass: 'text-emerald-400' },
  hard_landing: { label: 'Hard Landing', glyph: '▲', toneClass: 'text-amber-400' },
  crash_tipover: { label: 'Crash / Tip-Over', glyph: '✖', toneClass: 'text-rose-400' },
};

const CAMERA_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: 'follow', label: 'Follow' },
  { id: 'pad', label: 'Pad' },
  { id: 'side', label: 'Side' },
  { id: 'free', label: 'Free' },
];

export function TelemetryRibbon({
  telemetry,
  cameraPreset,
  isTourOpen,
  isCollapsed,
  onToggleCollapse,
  onSelectCameraPreset,
  onOpenTour,
  onOpenVerification,
}: TelemetryRibbonProps) {
  const statusInfo = STATUS_META[telemetry.touchdownStatus];

  if (isCollapsed) {
    return (
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center px-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Show OrbitLab 6-DOF Header"
          className="pointer-events-auto flex items-center gap-2 rounded-b-lg border border-t-0 border-slate-700/80 bg-slate-950/92 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition-colors shadow-lg cursor-pointer"
        >
          <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
          <span>Show OrbitLab 6-DOF</span>
        </button>
      </header>
    );
  }

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 p-3 sm:p-4">
      <div className="pointer-events-auto mx-auto flex max-w-[1400px] flex-col gap-2 rounded-xl border border-slate-700/80 bg-slate-950/92 px-4 py-2.5 text-slate-100 shadow-lg">
        {/* Top Row: Brand, Status, Camera Presets, Verification, Hide */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              OrbitLab 6-DOF
            </span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span
              className={`text-xs font-semibold whitespace-nowrap shrink-0 ${statusInfo.toneClass}`}
            >
              {statusInfo.glyph} {statusInfo.label}
            </span>
            <span className="hidden sm:inline text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline font-mono-tabular text-xs text-slate-400 whitespace-nowrap shrink-0">
              T+{telemetry.flightTime.toFixed(1)} s
            </span>
            {telemetry.touchdownStatus === 'crash_tipover' ? (
              <>
                <span className="hidden md:inline text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="hidden md:inline font-mono-tabular text-xs font-medium text-rose-400 whitespace-nowrap shrink-0">
                  Impact {telemetry.impactSpeed.toFixed(1)} m/s
                </span>
              </>
            ) : (
              <>
                <span className="hidden md:inline text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="hidden md:inline font-mono-tabular text-xs text-slate-400 whitespace-nowrap shrink-0">
                  g={telemetry.forces.gravityMag.toFixed(2)} m/s² · TWR {telemetry.twr.toFixed(2)}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 border border-slate-800">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectCameraPreset(preset.id)}
                  className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cameraPreset === preset.id
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenTour}
              className={`flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isTourOpen
                  ? 'border-sky-400 bg-sky-500/20 text-sky-300'
                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-sky-400" />
              <span>How It Works</span>
            </button>

            <button
              type="button"
              onClick={onOpenVerification}
              className="flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
              <span>Verify Physics</span>
            </button>

            <button
              type="button"
              onClick={onToggleCollapse}
              title="Hide OrbitLab 6-DOF Header"
              aria-label="Hide OrbitLab 6-DOF Header"
              className="flex items-center gap-1 min-h-[40px] px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
              <span>Hide</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Calibrated Live SI Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-4 gap-y-1.5 border-t border-slate-800/90 pt-2">
          <MetricCell
            label="Altitude AGL"
            value={`${telemetry.altitudeAGL.toFixed(1)}`}
            unit="m"
          />
          <MetricCell
            label="Vert / Horiz Vel"
            value={`${telemetry.verticalSpeed.toFixed(1)} / ${telemetry.horizontalSpeed.toFixed(1)}`}
            unit="m/s"
          />
          <MetricCell
            label="Tilt Angle"
            value={`${telemetry.tiltDeg.toFixed(1)}`}
            unit="deg"
          />
          <MetricCell
            label="Throttle"
            value={`${telemetry.throttlePct.toFixed(0)}`}
            unit="%"
            highlight={telemetry.throttlePct > 1}
          />
          <MetricCell
            label="Gimbal P / Y"
            value={`${telemetry.gimbalPitchDeg.toFixed(1)} / ${telemetry.gimbalYawDeg.toFixed(1)}`}
            unit="deg"
          />
          <MetricCell
            label="Propellant"
            value={`${telemetry.propellantMass.toFixed(0)}`}
            unit={`kg (${telemetry.propellantPct.toFixed(0)}%)`}
          />
          <MetricCell
            label="Dyn Pressure q"
            value={`${telemetry.dynamicPressure.toFixed(0)}`}
            unit="Pa"
          />
          <MetricCell
            label="Pad Offset / Δv"
            value={`${telemetry.padDistance.toFixed(1)}m`}
            unit={`${telemetry.remainingDeltaV.toFixed(0)} m/s`}
          />
        </div>
      </div>
    </header>
  );
}

function MetricCell({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] font-medium text-slate-400 truncate">{label}</span>
      <div className="flex items-baseline gap-1 font-mono-tabular">
        <span
          className={`text-sm font-semibold truncate ${
            highlight ? 'text-amber-400' : 'text-slate-100'
          }`}
        >
          {value}
        </span>
        <span className="text-[11px] text-slate-400 whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );
}
