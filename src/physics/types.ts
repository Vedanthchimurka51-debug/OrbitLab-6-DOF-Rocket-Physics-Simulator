import type { Quat, Vec3 } from './math';

export type FlightMode = 'landing' | 'freefall' | 'ascent' | 'manual';
export type FidelityMode = '3d' | '2d' | '1d';

export type TouchdownStatus =
  | 'in_flight'
  | 'on_pad'
  | 'safe_landing'
  | 'hard_landing'
  | 'crash_tipover';

export interface RocketParams {
  /** Empty dry mass (kg) */
  dryMass: number;
  /** Initial propellant mass (kg) */
  propellantMassInitial: number;
  /** Specific impulse (s), v_e = Isp * g0 */
  isp: number;
  /** Maximum propellant mass flow rate (kg/s) */
  maxMassFlowRate: number;
  /** Aerodynamic drag coefficient (dimensionless) */
  dragCoeff: number;
  /** Reference aerodynamic cross-section area (m^2) */
  referenceArea: number;
  /** Total rocket fuselage height (m) */
  height: number;
  /** Rocket body radius (m) */
  radius: number;
  /** Distance from CoM down to TVC gimbal pivot (m) */
  nozzleArm: number;
  /** Signed body-Y offset of Center of Pressure relative to CoM (m) */
  copOffset: number;
  /** Max TVC gimbal deflection angle (rad), e.g. 12 deg */
  maxGimbalRad: number;
  /** TVC actuator slew rate limit (rad/s) */
  gimbalSlewRateRad: number;
  /** Rotational damping coefficient (N*m*s/rad) */
  angularDamping: number;
  /** Extra height below aft skirt when landing legs are fully deployed (m) */
  legVerticalOffset: number;
  /** Horizontal footprint radius of deployed landing legs (m) */
  legFootprintRadius: number;
}

export interface EnvironmentParams {
  /** Standard surface gravity g0 (m/s^2) */
  g0: number;
  /** Planetary radius R_E (m) */
  earthRadius: number;
  /** Sea-level atmospheric density rho0 (kg/m^3) */
  rho0: number;
  /** Atmospheric scale height H_scale (m) */
  scaleHeight: number;
  /** Toggle inverse-square gravity vs constant surface g0 */
  useInverseSquareGravity: boolean;
  /** Constant surface crosswind X (m/s) */
  windSpeedX: number;
  /** Constant surface crosswind Z (m/s) */
  windSpeedZ: number;
  /** Altitude wind shear gradient (m/s per km of altitude) */
  windShearPerKm: number;
}

export interface SimulationConfig {
  flightMode: FlightMode;
  fidelity: FidelityMode;
  initialAltitude: number;
  initialOffsetX: number;
  initialOffsetZ: number;
  initialVy: number;
  initialTiltDeg: number;
  targetPadX: number;
  targetPadZ: number;
}

export interface RocketState {
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  angularVelocity: Vec3;
  propellantMass: number;
  gimbalPitch: number;
  gimbalYaw: number;
  throttle: number;
  legDeployment: number;
  flightTime: number;
  touchdownStatus: TouchdownStatus;
  impactSpeed: number;
  crashIntensity: number;
  crashPoint: Vec3 | null;
  isGrounded: boolean;
  isGrabbed: boolean;
}

export interface ControlCommands {
  throttle: number;
  gimbalPitchCmd: number;
  gimbalYawCmd: number;
  rcsRollTorque: number;
  deployLegs: boolean;
}

export interface ManualInputs {
  throttle: number; // 0..1
  pitch: number; // -1..1
  yaw: number; // -1..1
  roll: number; // -1..1
  deployLegs: boolean;
}

export interface ForceBreakdown {
  gravityWorld: Vec3;
  dragWorld: Vec3;
  thrustWorld: Vec3;
  userTouchWorld: Vec3;
  aeroTorqueBody: Vec3;
  tvcTorqueBody: Vec3;
  userTorqueBody: Vec3;
  dynamicPressure: number;
  airDensity: number;
  windWorld: Vec3;
  gravityMag: number;
  thrustMag: number;
}

export interface TelemetrySnapshot {
  altitudeAGL: number;
  altitudeCom: number;
  verticalSpeed: number;
  horizontalSpeed: number;
  totalSpeed: number;
  tiltDeg: number;
  throttlePct: number;
  gimbalPitchDeg: number;
  gimbalYawDeg: number;
  propellantMass: number;
  propellantPct: number;
  totalMass: number;
  dynamicPressure: number;
  remainingDeltaV: number;
  flightTime: number;
  touchdownStatus: TouchdownStatus;
  padDistance: number;
  legDeployment: number;
  isGrounded: boolean;
  impactSpeed: number;
  crashIntensity: number;
  crashPoint: Vec3 | null;
  kineticEnergyJ: number;
  potentialEnergyJ: number;
  thrustPowerW: number;
  twr: number;
  netForceMag: number;
  aeroTorqueMag: number;
  tvcTorqueMag: number;
  forces: ForceBreakdown;
}

export const DEFAULT_ROCKET_PARAMS: RocketParams = {
  dryMass: 12000,
  propellantMassInitial: 10000,
  isp: 290,
  maxMassFlowRate: 160,
  dragCoeff: 0.55,
  referenceArea: Math.PI * 1.2 * 1.2,
  height: 18.0,
  radius: 1.2,
  nozzleArm: 8.4,
  copOffset: 1.1,
  maxGimbalRad: (12 * Math.PI) / 180,
  gimbalSlewRateRad: (140 * Math.PI) / 180,
  angularDamping: 8000,
  legVerticalOffset: 1.4,
  legFootprintRadius: 4.2,
};

export const DEFAULT_ENV_PARAMS: EnvironmentParams = {
  g0: 9.80665,
  earthRadius: 6371000,
  rho0: 1.225,
  scaleHeight: 8500,
  useInverseSquareGravity: true,
  windSpeedX: 3.5,
  windSpeedZ: -1.5,
  windShearPerKm: 4.0,
};

export const DEFAULT_SIM_CONFIG: SimulationConfig = {
  flightMode: 'landing',
  fidelity: '3d',
  initialAltitude: 120,
  initialOffsetX: 12,
  initialOffsetZ: -8,
  initialVy: -12,
  initialTiltDeg: 6,
  targetPadX: 0,
  targetPadZ: 0,
};
