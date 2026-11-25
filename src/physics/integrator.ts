import { computeAerodynamics, computeGravityMagnitude } from './environment';
import {
  clamp,
  getTiltAngleRad,
  quatDerivative,
  quatNormalize,
  rotateVecByQuat,
  vecAdd,
  vecCross,
  vecScale,
  type Quat,
  type Vec3,
} from './math';
import { computePropulsion } from './propulsion';
import type {
  ControlCommands,
  EnvironmentParams,
  FidelityMode,
  ForceBreakdown,
  RocketParams,
  RocketState,
} from './types';

interface StateDerivative {
  dp: Vec3;
  dv: Vec3;
  dq: Quat;
  dOmega: Vec3;
  dPropMass: number;
}

export function getInertiaTensor(totalMass: number, params: RocketParams): Vec3 {
  const r2 = params.radius * params.radius;
  const h2 = params.height * params.height;
  const iTransverse = Math.max(1000, (1 / 12) * totalMass * (3 * r2 + h2));
  const iAxial = Math.max(200, 0.5 * totalMass * r2);
  return { x: iTransverse, y: iAxial, z: iTransverse };
}

export function getRocketBottomOffset(params: RocketParams, legDeployment: number): number {
  return 0.5 * params.height + clamp(legDeployment, 0, 1) * params.legVerticalOffset;
}

export function evaluateForcesAndDerivatives(
  state: RocketState,
  commands: ControlCommands,
  params: RocketParams,
  env: EnvironmentParams,
  fidelity: FidelityMode,
  userTouchWorld: Vec3,
  userTorqueBody: Vec3
): { deriv: StateDerivative; forces: ForceBreakdown } {
  const safeProp = Math.max(0, state.propellantMass);
  const totalMass = Math.max(1, params.dryMass + safeProp);

  // 1. Gravity
  const gMag = computeGravityMagnitude(state.position.y, env);
  const gravityWorld: Vec3 = { x: 0, y: -totalMass * gMag, z: 0 };

  // 2. Aerodynamics
  const aero = computeAerodynamics(
    state.position,
    state.velocity,
    state.orientation,
    params,
    env,
    fidelity
  );

  // 3. Propulsion & TVC
  const prop = computePropulsion(
    commands.throttle,
    state.gimbalPitch,
    state.gimbalYaw,
    safeProp,
    params,
    env
  );

  let thrustWorld = rotateVecByQuat(prop.thrustBody, state.orientation);
  if (fidelity === '1d') {
    thrustWorld = { x: 0, y: prop.thrustMag, z: 0 };
  } else if (fidelity === '2d') {
    thrustWorld = { x: thrustWorld.x, y: thrustWorld.y, z: 0 };
  }

  const effectiveUserForce =
    fidelity === '1d'
      ? { x: 0, y: userTouchWorld.y, z: 0 }
      : fidelity === '2d'
        ? { x: userTouchWorld.x, y: userTouchWorld.y, z: 0 }
        : userTouchWorld;

  const netForceWorld = vecAdd(
    vecAdd(gravityWorld, aero.dragWorld),
    vecAdd(thrustWorld, effectiveUserForce)
  );
  const dv = vecScale(netForceWorld, 1 / totalMass);

  // 4. Euler rigid-body rotational dynamics in body frame:
  // I * d(omega)/dt + omega x (I * omega) = tau_TVC + tau_aero + tau_damping + tau_user_touch + tau_RCS
  const inertia = getInertiaTensor(totalMass, params);
  const iOmega: Vec3 = {
    x: inertia.x * state.angularVelocity.x,
    y: inertia.y * state.angularVelocity.y,
    z: inertia.z * state.angularVelocity.z,
  };
  const gyroscopic = vecCross(state.angularVelocity, iOmega);

  const tauDamping: Vec3 = {
    x: -params.angularDamping * state.angularVelocity.x,
    y: -params.angularDamping * 0.2 * state.angularVelocity.y,
    z: -params.angularDamping * state.angularVelocity.z,
  };

  const tauRcs: Vec3 = { x: 0, y: commands.rcsRollTorque, z: 0 };

  let netTorqueBody = vecAdd(
    vecAdd(prop.tvcTorqueBody, aero.aeroTorqueBody),
    vecAdd(vecAdd(tauDamping, userTorqueBody), tauRcs)
  );
  netTorqueBody = {
    x: netTorqueBody.x - gyroscopic.x,
    y: netTorqueBody.y - gyroscopic.y,
    z: netTorqueBody.z - gyroscopic.z,
  };

  let dOmega: Vec3 = {
    x: netTorqueBody.x / inertia.x,
    y: netTorqueBody.y / inertia.y,
    z: netTorqueBody.z / inertia.z,
  };

  if (fidelity === '1d') {
    dOmega = { x: 0, y: 0, z: 0 };
  } else if (fidelity === '2d') {
    dOmega = { x: 0, y: 0, z: dOmega.z };
  }

  const dp: Vec3 =
    fidelity === '1d'
      ? { x: 0, y: state.velocity.y, z: 0 }
      : fidelity === '2d'
        ? { x: state.velocity.x, y: state.velocity.y, z: 0 }
        : { ...state.velocity };

  const dq =
    fidelity === '1d'
      ? { w: 0, x: 0, y: 0, z: 0 }
      : quatDerivative(state.orientation, state.angularVelocity);

  const dPropMass = safeProp > 0 ? -prop.massFlowRate : 0;

  return {
    deriv: { dp, dv, dq, dOmega, dPropMass },
    forces: {
      gravityWorld,
      dragWorld: aero.dragWorld,
      thrustWorld,
      userTouchWorld: effectiveUserForce,
      aeroTorqueBody: aero.aeroTorqueBody,
      tvcTorqueBody: prop.tvcTorqueBody,
      userTorqueBody,
      dynamicPressure: aero.dynamicPressure,
      airDensity: aero.airDensity,
      windWorld: aero.windWorld,
      gravityMag: gMag,
      thrustMag: prop.thrustMag,
    },
  };
}

function advanceTempState(
  base: RocketState,
  k: StateDerivative,
  h: number
): RocketState {
  return {
    ...base,
    position: vecAdd(base.position, vecScale(k.dp, h)),
    velocity: vecAdd(base.velocity, vecScale(k.dv, h)),
    orientation: quatNormalize({
      w: base.orientation.w + k.dq.w * h,
      x: base.orientation.x + k.dq.x * h,
      y: base.orientation.y + k.dq.y * h,
      z: base.orientation.z + k.dq.z * h,
    }),
    angularVelocity: vecAdd(base.angularVelocity, vecScale(k.dOmega, h)),
    propellantMass: Math.max(0, base.propellantMass + k.dPropMass * h),
  };
}

/**
 * 4th-Order Runge-Kutta (RK4) fixed-timestep integrator for the 13-state 6-DOF vector.
 */
export function stepRK4(
  state: RocketState,
  commands: ControlCommands,
  params: RocketParams,
  env: EnvironmentParams,
  fidelity: FidelityMode,
  userTouchWorld: Vec3,
  userTorqueBody: Vec3,
  dt: number
): { nextState: RocketState; forces: ForceBreakdown } {
  // Update actuator states (TVC gimbal slew-rate limit & leg deployment)
  const maxStep = params.gimbalSlewRateRad * dt;
  const targetP = clamp(commands.gimbalPitchCmd, -params.maxGimbalRad, params.maxGimbalRad);
  const targetY = clamp(commands.gimbalYawCmd, -params.maxGimbalRad, params.maxGimbalRad);
  const nextGimbalPitch =
    state.gimbalPitch + clamp(targetP - state.gimbalPitch, -maxStep, maxStep);
  const nextGimbalYaw =
    state.gimbalYaw + clamp(targetY - state.gimbalYaw, -maxStep, maxStep);

  const legSpeed = 0.65; // ~1.5 s full leg deployment
  const nextLegDeployment = commands.deployLegs
    ? clamp(state.legDeployment + legSpeed * dt, 0, 1)
    : clamp(state.legDeployment - legSpeed * dt, 0, 1);

  const workingState: RocketState = {
    ...state,
    gimbalPitch: nextGimbalPitch,
    gimbalYaw: nextGimbalYaw,
    throttle: state.propellantMass > 0 ? clamp(commands.throttle, 0, 1) : 0,
    legDeployment: nextLegDeployment,
  };

  if (state.isGrabbed) {
    const evalGrabbed = evaluateForcesAndDerivatives(
      workingState,
      commands,
      params,
      env,
      fidelity,
      userTouchWorld,
      userTorqueBody
    );
    return {
      nextState: {
        ...workingState,
        velocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
        flightTime: state.flightTime + dt,
      },
      forces: evalGrabbed.forces,
    };
  }

  const r1 = evaluateForcesAndDerivatives(
    workingState,
    commands,
    params,
    env,
    fidelity,
    userTouchWorld,
    userTorqueBody
  );
  const s2 = advanceTempState(workingState, r1.deriv, 0.5 * dt);
  const r2 = evaluateForcesAndDerivatives(
    s2,
    commands,
    params,
    env,
    fidelity,
    userTouchWorld,
    userTorqueBody
  );
  const s3 = advanceTempState(workingState, r2.deriv, 0.5 * dt);
  const r3 = evaluateForcesAndDerivatives(
    s3,
    commands,
    params,
    env,
    fidelity,
    userTouchWorld,
    userTorqueBody
  );
  const s4 = advanceTempState(workingState, r3.deriv, dt);
  const r4 = evaluateForcesAndDerivatives(
    s4,
    commands,
    params,
    env,
    fidelity,
    userTouchWorld,
    userTorqueBody
  );

  const k1 = r1.deriv;
  const k2 = r2.deriv;
  const k3 = r3.deriv;
  const k4 = r4.deriv;
  const w6 = dt / 6;

  let nextPos: Vec3 = {
    x: workingState.position.x + w6 * (k1.dp.x + 2 * k2.dp.x + 2 * k3.dp.x + k4.dp.x),
    y: workingState.position.y + w6 * (k1.dp.y + 2 * k2.dp.y + 2 * k3.dp.y + k4.dp.y),
    z: workingState.position.z + w6 * (k1.dp.z + 2 * k2.dp.z + 2 * k3.dp.z + k4.dp.z),
  };
  let nextVel: Vec3 = {
    x: workingState.velocity.x + w6 * (k1.dv.x + 2 * k2.dv.x + 2 * k3.dv.x + k4.dv.x),
    y: workingState.velocity.y + w6 * (k1.dv.y + 2 * k2.dv.y + 2 * k3.dv.y + k4.dv.y),
    z: workingState.velocity.z + w6 * (k1.dv.z + 2 * k2.dv.z + 2 * k3.dv.z + k4.dv.z),
  };
  let nextQuat: Quat = quatNormalize({
    w: workingState.orientation.w + w6 * (k1.dq.w + 2 * k2.dq.w + 2 * k3.dq.w + k4.dq.w),
    x: workingState.orientation.x + w6 * (k1.dq.x + 2 * k2.dq.x + 2 * k3.dq.x + k4.dq.x),
    y: workingState.orientation.y + w6 * (k1.dq.y + 2 * k2.dq.y + 2 * k3.dq.y + k4.dq.y),
    z: workingState.orientation.z + w6 * (k1.dq.z + 2 * k2.dq.z + 2 * k3.dq.z + k4.dq.z),
  });
  let nextOmega: Vec3 = {
    x:
      workingState.angularVelocity.x +
      w6 * (k1.dOmega.x + 2 * k2.dOmega.x + 2 * k3.dOmega.x + k4.dOmega.x),
    y:
      workingState.angularVelocity.y +
      w6 * (k1.dOmega.y + 2 * k2.dOmega.y + 2 * k3.dOmega.y + k4.dOmega.y),
    z:
      workingState.angularVelocity.z +
      w6 * (k1.dOmega.z + 2 * k2.dOmega.z + 2 * k3.dOmega.z + k4.dOmega.z),
  };

  if (fidelity === '1d') {
    nextPos = { x: 0, y: nextPos.y, z: 0 };
    nextVel = { x: 0, y: nextVel.y, z: 0 };
    nextQuat = { w: 1, x: 0, y: 0, z: 0 };
    nextOmega = { x: 0, y: 0, z: 0 };
  } else if (fidelity === '2d') {
    nextPos = { x: nextPos.x, y: nextPos.y, z: 0 };
    nextVel = { x: nextVel.x, y: nextVel.y, z: 0 };
    nextOmega = { x: 0, y: 0, z: nextOmega.z };
  }

  const nextProp = Math.max(
    0,
    workingState.propellantMass +
      w6 * (k1.dPropMass + 2 * k2.dPropMass + 2 * k3.dPropMass + k4.dPropMass)
  );

  // Guard against NaN/Infinity
  if (
    !Number.isFinite(nextPos.y) ||
    !Number.isFinite(nextVel.y) ||
    !Number.isFinite(nextQuat.w)
  ) {
    return { nextState: workingState, forces: r1.forces };
  }

  let integrated: RocketState = {
    ...workingState,
    position: nextPos,
    velocity: nextVel,
    orientation: nextQuat,
    angularVelocity: nextOmega,
    propellantMass: nextProp,
    flightTime: workingState.flightTime + dt,
  };

  integrated = resolveGroundContact(integrated, commands, params, env, dt);

  return { nextState: integrated, forces: r1.forces };
}

/**
 * Clean ground contact, surface friction, tip-over physics, and touchdown classification (y <= 0).
 */
export function resolveGroundContact(
  state: RocketState,
  commands: ControlCommands,
  params: RocketParams,
  env: EnvironmentParams,
  dt: number
): RocketState {
  const bodyUp = rotateVecByQuat({ x: 0, y: 1, z: 0 }, state.orientation);
  const cosTilt = clamp(bodyUp.y, -1, 1);
  const tiltRad = getTiltAngleRad(state.orientation);
  const tiltDeg = (tiltRad * 180) / Math.PI;

  const nominalBottomArm = getRocketBottomOffset(params, state.legDeployment);
  // Lowest vertical point of rocket cylinder/legs or nose if inverted
  const effectiveVerticalArm =
    Math.abs(cosTilt) * nominalBottomArm + Math.sin(tiltRad) * params.radius;
  const minCenterY = Math.max(params.radius, effectiveVerticalArm);

  // If net thrust lifts off pad cleanly, allow ascent
  const netAscentActive = commands.throttle > 0.4 && state.propellantMass > 0 && state.velocity.y > 0.2;

  if (state.position.y > minCenterY + 0.02 || netAscentActive) {
    // Lift off pad resets grounded flag while flying
    if (state.position.y > minCenterY + 0.35 && state.isGrounded) {
      return {
        ...state,
        isGrounded: false,
        touchdownStatus: 'in_flight',
      };
    }
    return state;
  }

  // Contact detected at ground plane y = 0
  const vyImpact = Math.abs(Math.min(0, state.velocity.y));
  const vHorizImpact = Math.hypot(state.velocity.x, state.velocity.z);
  const maxImpact = Math.max(state.impactSpeed, vyImpact);

  const clampedPos: Vec3 = {
    x: state.position.x,
    y: minCenterY,
    z: state.position.z,
  };

  // Surface friction & zero penetration
  const frictionDecay = Math.exp(-8.5 * dt);
  let nextVel: Vec3 = {
    x: state.velocity.x * frictionDecay,
    y: Math.max(0, state.velocity.y),
    z: state.velocity.z * frictionDecay,
  };

  // Restoring vs tip-over torque from landing leg footprint when tilted
  const legsDeployed = state.legDeployment >= 0.75;
  const footRadius = legsDeployed ? params.legFootprintRadius : params.radius;
  const criticalTipAngleRad = Math.atan2(footRadius, nominalBottomArm);
  const totalMass = params.dryMass + state.propellantMass;

  let nextOmega = { ...state.angularVelocity };
  if (tiltRad < criticalTipAngleRad && tiltRad < (32 * Math.PI) / 180) {
    // Stable restoring contact on legs/base: damp angular rates and settle upright
    const settleRate = Math.exp(-10 * dt);
    nextOmega = vecScale(nextOmega, settleRate);
    const restoringAccel = (env.g0 * footRadius) / nominalBottomArm;
    const tiltAxisWorld = vecCross(bodyUp, { x: 0, y: 1, z: 0 });
    const tiltAxisBody = rotateVecByQuat(tiltAxisWorld, {
      w: state.orientation.w,
      x: -state.orientation.x,
      y: -state.orientation.y,
      z: -state.orientation.z,
    });
    nextOmega.x += tiltAxisBody.x * restoringAccel * dt * (totalMass > 0 ? 1.6 : 1);
    nextOmega.z += tiltAxisBody.z * restoringAccel * dt * 1.6;
  } else {
    // Past center-of-gravity stability cone -> tip-over toppling torque until flat on ground
    if (tiltDeg < 88) {
      const toppleAxisWorld = vecCross({ x: 0, y: 1, z: 0 }, bodyUp);
      const toppleAxisBody = rotateVecByQuat(toppleAxisWorld, {
        w: state.orientation.w,
        x: -state.orientation.x,
        y: -state.orientation.y,
        z: -state.orientation.z,
      });
      nextOmega.x = nextOmega.x * 0.96 + toppleAxisBody.x * 2.2 * dt;
      nextOmega.z = nextOmega.z * 0.96 + toppleAxisBody.z * 2.2 * dt;
    } else {
      nextOmega = vecScale(nextOmega, Math.exp(-12 * dt));
    }
  }

  // Classify touchdown status once upon initial contact (or upgrade to crash if tipped over)
  let status = state.touchdownStatus;
  let crashIntensity = state.crashIntensity;
  let crashPoint = state.crashPoint;

  if (!state.isGrounded && state.touchdownStatus === 'in_flight') {
    if (!legsDeployed || vyImpact > 9.5 || vHorizImpact > 6.5 || tiltDeg > 22) {
      status = 'crash_tipover';
    } else if (vyImpact > 4.2 || vHorizImpact > 2.5 || tiltDeg > 9) {
      status = 'hard_landing';
    } else {
      status = 'safe_landing';
    }
  } else if (status !== 'on_pad' && tiltDeg > 32) {
    status = 'crash_tipover';
  }

  // Trigger physical crash impulse + severity when entering crash_tipover
  if (status === 'crash_tipover' && state.touchdownStatus !== 'crash_tipover') {
    const impactSpeedTotal = Math.hypot(vyImpact, vHorizImpact);
    const impactEnergyJ = 0.5 * totalMass * impactSpeedTotal * impactSpeedTotal;
    const fuelBonus = state.propellantMass > 300 ? 0.3 : 0.08;
    crashIntensity = clamp(Math.sqrt(impactEnergyJ / 1.8e6) + fuelBonus, 0.35, 1.0);
    crashPoint = { x: clampedPos.x, y: 0, z: clampedPos.z };

    // Inelastic structural bounce & tumbling spin on hard vertical crash
    if (vyImpact > 8.5) {
      nextVel = {
        x: state.velocity.x * 0.45 + (state.position.x >= 0 ? 1.8 : -1.8),
        y: Math.min(7.5, vyImpact * 0.22),
        z: state.velocity.z * 0.45 + (state.position.z >= 0 ? 1.4 : -1.4),
      };
      nextOmega = {
        x: nextOmega.x + 1.15 * crashIntensity,
        y: nextOmega.y + 0.4 * crashIntensity,
        z: nextOmega.z - 0.95 * crashIntensity,
      };
    }
  }

  return {
    ...state,
    position: clampedPos,
    velocity: nextVel,
    angularVelocity: nextOmega,
    isGrounded: true,
    impactSpeed: maxImpact,
    crashIntensity,
    crashPoint,
    touchdownStatus: status,
  };
}
