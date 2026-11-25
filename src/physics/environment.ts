import {
  rotateVecByQuatConj,
  vecCross,
  vecLen,
  vecScale,
  vecSub,
  type Quat,
  type Vec3,
} from './math';
import type { EnvironmentParams, RocketParams } from './types';

/**
 * Inverse-square gravity magnitude: g(y) = g0 * (R_E / (R_E + max(0, y)))^2.
 */
export function computeGravityMagnitude(y: number, env: EnvironmentParams): number {
  if (!env.useInverseSquareGravity) {
    return env.g0;
  }
  const alt = Math.max(0, y);
  const ratio = env.earthRadius / (env.earthRadius + alt);
  return env.g0 * ratio * ratio;
}

/**
 * Exponential atmospheric density: rho(y) = rho0 * exp(-max(0, y) / H_scale).
 */
export function computeAirDensity(y: number, env: EnvironmentParams): number {
  if (env.rho0 <= 0) return 0;
  const alt = Math.max(0, y);
  return env.rho0 * Math.exp(-alt / Math.max(1, env.scaleHeight));
}

/**
 * Wind velocity field with constant crosswind and altitude wind shear.
 */
export function computeWindVelocity(y: number, env: EnvironmentParams): Vec3 {
  const altKm = Math.max(0, y) * 0.001;
  const shearFactor = 1 + altKm * (env.windShearPerKm / Math.max(1, Math.hypot(env.windSpeedX, env.windSpeedZ) + 4));
  return {
    x: env.windSpeedX * shearFactor,
    y: 0,
    z: env.windSpeedZ * shearFactor,
  };
}

export interface AeroOutput {
  dragWorld: Vec3;
  aeroTorqueBody: Vec3;
  dynamicPressure: number;
  airDensity: number;
  windWorld: Vec3;
}

/**
 * Compute quadratic aerodynamic drag, dynamic pressure, and CoP-CoM offset torque.
 * tau_aero = r_CoP_to_CoM x F_aero_body
 */
export function computeAerodynamics(
  position: Vec3,
  velocity: Vec3,
  orientation: Quat,
  params: RocketParams,
  env: EnvironmentParams,
  fidelity: '3d' | '2d' | '1d'
): AeroOutput {
  const rho = computeAirDensity(position.y, env);
  const windWorld =
    fidelity === '1d'
      ? { x: 0, y: 0, z: 0 }
      : fidelity === '2d'
        ? { x: computeWindVelocity(position.y, env).x, y: 0, z: 0 }
        : computeWindVelocity(position.y, env);

  const vRel = vecSub(velocity, windWorld);
  const speed = vecLen(vRel);

  if (rho <= 1e-12 || speed < 1e-9 || params.dragCoeff <= 0) {
    return {
      dragWorld: { x: 0, y: 0, z: 0 },
      aeroTorqueBody: { x: 0, y: 0, z: 0 },
      dynamicPressure: 0,
      airDensity: rho,
      windWorld,
    };
  }

  const dynamicPressure = 0.5 * rho * speed * speed;
  const dragScalar = -0.5 * rho * params.dragCoeff * params.referenceArea * speed;
  const dragWorld = vecScale(vRel, dragScalar);

  if (fidelity === '1d') {
    return {
      dragWorld: { x: 0, y: dragWorld.y, z: 0 },
      aeroTorqueBody: { x: 0, y: 0, z: 0 },
      dynamicPressure,
      airDensity: rho,
      windWorld,
    };
  }

  // Convert aerodynamic force into body frame to compute torque from CoP offset
  const dragBody = rotateVecByQuatConj(dragWorld, orientation);
  const rCop: Vec3 = { x: 0, y: params.copOffset, z: 0 };
  const aeroTorqueBody = vecCross(rCop, dragBody);

  return {
    dragWorld,
    aeroTorqueBody,
    dynamicPressure,
    airDensity: rho,
    windWorld,
  };
}
