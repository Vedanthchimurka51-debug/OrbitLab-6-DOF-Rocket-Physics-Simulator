import { clamp, vecCross, vecScale, type Vec3 } from './math';
import type { EnvironmentParams, RocketParams } from './types';

export const STANDARD_G0 = 9.80665;

export function getExhaustVelocity(params: RocketParams, _env?: EnvironmentParams): number {
  return Math.max(100, params.isp * STANDARD_G0);
}

export function getMaxThrust(params: RocketParams, env?: EnvironmentParams): number {
  return params.maxMassFlowRate * getExhaustVelocity(params, env);
}

/**
 * Analytical Tsiolkovsky vacuum delta-v:
 * delta_v = v_e * ln((m_dry + m_prop) / m_dry)
 */
export function computeVacuumDeltaV(
  dryMass: number,
  propellantMass: number,
  isp: number,
  g0: number
): number {
  const safeDry = Math.max(1, dryMass);
  const safeProp = Math.max(0, propellantMass);
  const ve = Math.max(0, isp * g0);
  return ve * Math.log((safeDry + safeProp) / safeDry);
}

/**
 * Nozzle thrust direction vector in body frame for small/moderate gimbal deflections.
 * Positive gimbalPitch deflects nozzle around +X, creating -Z lateral thrust (pitching nose +X/-Z).
 * Positive gimbalYaw deflects nozzle around +Z, creating +X lateral thrust.
 */
export function computeNozzleUnitVector(gimbalPitch: number, gimbalYaw: number): Vec3 {
  const sinP = Math.sin(gimbalPitch);
  const cosP = Math.cos(gimbalPitch);
  const sinY = Math.sin(gimbalYaw);
  const cosY = Math.cos(gimbalYaw);

  // Rotate body +Y thrust axis by Rx(gimbalPitch) then Rz(-gimbalYaw)
  const ux = sinY * cosP;
  const uy = cosY * cosP;
  const uz = -sinP;
  const len = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  return { x: ux / len, y: uy / len, z: uz / len };
}

export interface PropulsionOutput {
  thrustMag: number;
  massFlowRate: number;
  thrustBody: Vec3;
  tvcTorqueBody: Vec3;
}

/**
 * Compute variable-mass propulsion thrust and TVC gimbal torque in body frame.
 * dm/dt = -throttle * m_dot_max
 * F_T = throttle * m_dot_max * v_e
 * tau_TVC = r_nozzle x F_thrust_body, r_nozzle = [0, -L_arm, 0]
 */
export function computePropulsion(
  throttleCmd: number,
  gimbalPitch: number,
  gimbalYaw: number,
  propellantMass: number,
  params: RocketParams,
  env: EnvironmentParams
): PropulsionOutput {
  if (propellantMass <= 1e-6 || throttleCmd <= 1e-5) {
    return {
      thrustMag: 0,
      massFlowRate: 0,
      thrustBody: { x: 0, y: 0, z: 0 },
      tvcTorqueBody: { x: 0, y: 0, z: 0 },
    };
  }

  const effectiveThrottle = clamp(throttleCmd, 0, 1);
  const ve = getExhaustVelocity(params, env);
  const massFlowRate = effectiveThrottle * params.maxMassFlowRate;
  const thrustMag = massFlowRate * ve;

  const gp = clamp(gimbalPitch, -params.maxGimbalRad, params.maxGimbalRad);
  const gy = clamp(gimbalYaw, -params.maxGimbalRad, params.maxGimbalRad);
  const uNozzle = computeNozzleUnitVector(gp, gy);
  const thrustBody = vecScale(uNozzle, thrustMag);

  const rNozzle: Vec3 = { x: 0, y: -params.nozzleArm, z: 0 };
  const tvcTorqueBody = vecCross(rNozzle, thrustBody);

  return {
    thrustMag,
    massFlowRate,
    thrustBody,
    tvcTorqueBody,
  };
}
