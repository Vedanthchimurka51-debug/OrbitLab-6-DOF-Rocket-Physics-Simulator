import { ChevronLeft, ChevronRight, Film, RotateCcw, Square, Video, X } from 'lucide-react';
import type { TelemetrySnapshot } from '../physics/types';

export interface TourChapter {
  id: 'hover_slam' | 'pid_recovery' | 'crash_physics' | 'gravity_turn';
  title: string;
  subtitle: string;
  description: string;
  equation: string;
  watchFor: string;
}

export const TOUR_CHAPTERS: TourChapter[] = [
  {
    id: 'hover_slam',
    title: '1. Hover-Slam & TVC Landing',
    subtitle: 'Closed-Loop PID Guidance · Earth Gravity',
    description:
      'Cascaded PID guidance computes target deceleration from altitude and velocity, throttling the variable-mass engine while gimballing the nozzle (±12°) to cancel tilt and pad drift.',
    equation: 'F_T = ṁ · (I_sp · g₀)   |   τ_TVC = r_nozzle × F_thrust',
    watchFor: 'Watch the four landing legs deploy below 35 m AGL and green thrust vector trim tilt.',
  },
  {
    id: 'pid_recovery',
    title: '2. Mid-Air Disturbance & Recovery',
    subtitle: 'Automated 28 kN Lateral Impulse at T+1.4 s',
    description:
      'An external lateral wind-gust impulse strikes the booster mid-descent, injecting angular momentum. The 6-DOF RK4 integrator propagates quaternion attitude while TVC stabilizes the vehicle.',
    equation: 'q̇ = ½ q ⊗ [0, ω]   |   Iω̇ + ω × (Iω) = τ_TVC + τ_aero',
    watchFor: 'Watch the nozzle kick sharply right after T+1.4 s to arrest spin and re-center on the pad.',
  },
  {
    id: 'crash_physics',
    title: '3. Ballistic Free-Fall & Crash Impact',
    subtitle: 'Unpowered Descent · Energy & Debris Dynamics',
    description:
      'With thrust cut to zero, gravitational potential energy converts into translational and rotational kinetic energy against quadratic aerodynamic drag until inelastic ground impact.',
    equation: 'E_k = ½mv² + ½Iω²   |   F_d = -½ρ(y) C_d A ||v_rel|| v_rel',
    watchFor: 'Watch kinetic energy peak just before ground impact triggers fireball, shockwave, and 36 debris shards.',
  },
  {
    id: 'gravity_turn',
    title: '4. Gravity-Turn Orbital Ascent',
    subtitle: 'Pad Liftoff · Tsiolkovsky Mass Depletion',
    description:
      'Starting from rest at TWR > 1.0, the booster clears the desert gantry tower and pitches smoothly downrange. As propellant burns off, decreasing mass increases acceleration.',
    equation: 'Δv = v_e ln(m₀ / m_dry)   |   dm/dt = -throttle · ṁ_max',
    watchFor: 'Watch the orange trajectory arc bend downrange as velocity builds and propellant drops.',
  },
];

interface HowItWorksTourProps {
  isOpen: boolean;
  chapterIndex: number;
  telemetry: TelemetrySnapshot;
  disturbanceFired: boolean;
  isRecording: boolean;
  recordSeconds: number;
  onSelectChapter: (index: number) => void;
  onReplayChapter: () => void;
  onToggleRecord: () => void;
  onClose: () => void;
}

export function HowItWorksTour({
  isOpen,
  chapterIndex,
  telemetry,
  disturbanceFired,
  isRecording,
  recordSeconds,
  onSelectChapter,
  onReplayChapter,
  onToggleRecord,
  onClose,
}: HowItWorksTourProps) {
  if (!isOpen) return null;

  const chapter = TOUR_CHAPTERS[chapterIndex] ?? TOUR_CHAPTERS[0];
  const hasPrev = chapterIndex > 0;
  const hasNext = chapterIndex < TOUR_CHAPTERS.length - 1;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <aside
      aria-label="How It Works Interactive Physics Tour"
      className="fixed left-3 sm:left-4 top-[148px] lg:top-[128px] z-20 w-[min(380px,calc(100vw-24px))] rounded-xl border border-slate-700/90 bg-slate-950/92 p-3.5 text-slate-100 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-400">
            <Film className="w-3.5 h-3.5 shrink-0" />
            <span>Live 3D Physics Tour · {chapterIndex + 1}/{TOUR_CHAPTERS.length}</span>
          </div>
          <h2 className="mt-0.5 text-sm font-bold text-white leading-snug">
            {chapter.title}
          </h2>
          <p className="text-[11px] font-medium text-amber-300/90">
            {chapter.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Exit Physics Tour"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Chapter Segmented Progress */}
      <div className="mt-2.5 grid grid-cols-4 gap-1">
        {TOUR_CHAPTERS.map((c, idx) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectChapter(idx)}
            title={c.title}
            className={`h-1.5 rounded-full transition-colors cursor-pointer ${
              idx === chapterIndex
                ? 'bg-sky-400'
                : idx < chapterIndex
                  ? 'bg-sky-700'
                  : 'bg-slate-800 hover:bg-slate-700'
            }`}
          />
        ))}
      </div>

      {/* Explanation & Governing Equations */}
      <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
        {chapter.description}
      </p>

      <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 font-mono-tabular text-[11px] text-sky-300">
        {chapter.equation}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        <span className="font-semibold text-slate-200">Cue:</span> {chapter.watchFor}
      </p>

      {/* Live Event Callout for Chapter 2 or Telemetry Snapshot */}
      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-slate-900/70 px-2.5 py-1.5 text-[11px] font-mono-tabular">
        {chapter.id === 'pid_recovery' ? (
          <span className={disturbanceFired ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
            {disturbanceFired
              ? 'Impulse Applied: 28 kN Lateral Gust'
              : `Disturbance Armed (T+${telemetry.flightTime.toFixed(1)}s / 1.4s)`}
          </span>
        ) : (
          <span className="text-slate-300">
            Ek {(telemetry.kineticEnergyJ / 1e6).toFixed(2)} MJ · Tilt {telemetry.tiltDeg.toFixed(1)}°
          </span>
        )}
        <span className="text-slate-400">Alt {telemetry.altitudeAGL.toFixed(0)}m</span>
      </div>

      {/* Controls */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => hasPrev && onSelectChapter(chapterIndex - 1)}
            disabled={!hasPrev}
            className="flex items-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <button
            type="button"
            onClick={onReplayChapter}
            className="flex items-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Replay</span>
          </button>

          <button
            type="button"
            onClick={() => (hasNext ? onSelectChapter(chapterIndex + 1) : onClose())}
            className="flex items-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 cursor-pointer"
          >
            <span>{hasNext ? 'Next' : 'Finish'}</span>
            {hasNext && <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleRecord}
          className={`flex items-center gap-1.5 min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-lg border whitespace-nowrap cursor-pointer ${
            isRecording
              ? 'border-rose-500 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
              : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-3 h-3 fill-current" />
              <span className="font-mono-tabular">Stop {formatTimer(recordSeconds)}</span>
            </>
          ) : (
            <>
              <Video className="w-3.5 h-3.5 text-rose-400" />
              <span>Record Clip</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
