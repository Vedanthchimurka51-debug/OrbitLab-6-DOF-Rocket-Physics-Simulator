import { stepRK4 } from '../physics/integrator';
import { computeVacuumDeltaV, getExhaustVelocity } from '../physics/propulsion';
import { RocketSimulator } from '../physics/simulator';
import { DEFAULT_ENV_PARAMS, DEFAULT_ROCKET_PARAMS } from '../physics/types';

export interface VerificationTestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  measured: string;
  relativeErrorPct: number;
  details: string;
}

export interface VerificationReport {
  allPassed: boolean;
  timestampIso: string;
  results: VerificationTestResult[];
}

/**
 * 1. Vacuum Tsiolkovsky Delta-V Verification
 * Integrates a zero-gravity, zero-drag 1D burn until propellant depletion and compares against v_e * ln(m0 / m_dry).
 */
export function testTsiolkovskyDeltaV(): VerificationTestResult {
  const params = { ...DEFAULT_ROCKET_PARAMS, dryMass: 10000, propellantMassInitial: 8000, isp: 300, dragCoeff: 0 };
  const env = { ...DEFAULT_ENV_PARAMS, g0: 0, rho0: 0 };
  const ve = params.isp * DEFAULT_ENV_PARAMS.g0;

  // Use standard g0 for exhaust velocity while setting external gravity = 0 via custom simulation loop
  const envZeroExt = { ...DEFAULT_ENV_PARAMS, rho0: 0, g0: DEFAULT_ENV_PARAMS.g0 };
  let state = new RocketSimulator(params, envZeroExt, { flightMode: 'manual', fidelity: '1d' }).state;
  state = {
    ...state,
    position: { x: 0, y: 1000, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    propellantMass: params.propellantMassInitial,
    isGrounded: false,
  };

  // Run pure vacuum zero-g burn via stepRK4 with g0=0 in environment?
  // Wait: v_e = isp * env.g0, so we track gravity-loss-compensated velocity or use pure propulsion check:
  // With gravity active (constant surface g0), deltaV_ideal = v_e * ln(m0/m_dry) = v_final + g0 * t_burn!
  const sim = new RocketSimulator(
    { ...params, dragCoeff: 0 },
    { ...DEFAULT_ENV_PARAMS, rho0: 0, useInverseSquareGravity: false },
    { flightMode: 'manual', fidelity: '1d' }
  );
  sim.state = {
    ...sim.state,
    position: { x: 0, y: 100, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    propellantMass: params.propellantMassInitial,
    isGrounded: false,
    touchdownStatus: 'in_flight',
  };
  sim.manualInputs.throttle = 1.0;

  const dt = 0.005;
  let burnTime = 0;
  const maxSteps = 20000;
  for (let i = 0; i < maxSteps && sim.state.propellantMass > 0; i++) {
    sim.stepFixed(dt);
    burnTime += dt;
  }

  // Gravity loss over vertical burn with constant g0 is exactly g0 * t_burn
  const gravityLoss = DEFAULT_ENV_PARAMS.g0 * burnTime;
  const simulatedDeltaV = sim.state.velocity.y + gravityLoss;
  const analyticalDeltaV = computeVacuumDeltaV(
    params.dryMass,
    params.propellantMassInitial,
    params.isp,
    DEFAULT_ENV_PARAMS.g0
  );

  // Confirm unused helper referenced cleanly
  void env;
  void getExhaustVelocity;

  const relErrPct = (Math.abs(simulatedDeltaV - analyticalDeltaV) / analyticalDeltaV) * 100;
  const passed = relErrPct < 0.15;

  return {
    id: 'tsiolkovsky',
    name: 'Vacuum Tsiolkovsky Delta-V',
    passed,
    expected: `${analyticalDeltaV.toFixed(2)} m/s`,
    measured: `${simulatedDeltaV.toFixed(2)} m/s`,
    relativeErrorPct: relErrPct,
    details: `Burn time ${burnTime.toFixed(2)} s; gravity-loss-compensated delta-v matches v_e * ln(m0 / m_dry).`,
  };
}

/**
 * 2. Free-Fall Drop Time (Vacuum) & Terminal Velocity (Constant Atmosphere) Verification
 */
export function testFreeFallAndTerminalVelocity(): VerificationTestResult {
  // Part A: Vacuum drop time from h = 500 m
  const dropHeight = 500;
  const simVac = new RocketSimulator(
    { ...DEFAULT_ROCKET_PARAMS, dragCoeff: 0 },
    { ...DEFAULT_ENV_PARAMS, rho0: 0, useInverseSquareGravity: false },
    { flightMode: 'freefall', fidelity: '1d', initialAltitude: dropHeight, initialVy: 0 }
  );
  // Start center at dropHeight + bottomOffset (which is 0.5 * height since legs=0)
  const dt = 0.002;
  let steps = 0;
  while (!simVac.state.isGrounded && steps < 20000) {
    simVac.stepFixed(dt);
    steps++;
  }
  const tDropAnalytical = Math.sqrt((2 * dropHeight) / DEFAULT_ENV_PARAMS.g0);
  const tDropMeasured = simVac.state.flightTime;
  const dropErrPct = (Math.abs(tDropMeasured - tDropAnalytical) / tDropAnalytical) * 100;

  // Part B: Terminal velocity in constant sea-level atmosphere (H_scale -> very large)
  const simTerm = new RocketSimulator(
    { ...DEFAULT_ROCKET_PARAMS, dryMass: 12000, propellantMassInitial: 0, dragCoeff: 0.8 },
    {
      ...DEFAULT_ENV_PARAMS,
      rho0: 1.225,
      scaleHeight: 1e9,
      useInverseSquareGravity: false,
      windSpeedX: 0,
      windSpeedZ: 0,
    },
    { flightMode: 'freefall', fidelity: '1d', initialAltitude: 60000, initialVy: 0 }
  );
  simTerm.state.propellantMass = 0;
  for (let i = 0; i < 12000; i++) {
    simTerm.stepFixed(0.01);
  }
  const m = 12000;
  const vtAnalytical = Math.sqrt(
    (2 * m * DEFAULT_ENV_PARAMS.g0) /
      (1.225 * 0.8 * DEFAULT_ROCKET_PARAMS.referenceArea)
  );
  const vtMeasured = Math.abs(simTerm.state.velocity.y);
  const vtErrPct = (Math.abs(vtMeasured - vtAnalytical) / vtAnalytical) * 100;

  const maxErrPct = Math.max(dropErrPct, vtErrPct);
  const passed = dropErrPct < 0.2 && vtErrPct < 0.25;

  return {
    id: 'freefall',
    name: 'Free-Fall Drop & Terminal Velocity',
    passed,
    expected: `t=${tDropAnalytical.toFixed(3)} s, v_t=${vtAnalytical.toFixed(2)} m/s`,
    measured: `t=${tDropMeasured.toFixed(3)} s, v_t=${vtMeasured.toFixed(2)} m/s`,
    relativeErrorPct: maxErrPct,
    details: `Vacuum drop error ${dropErrPct.toFixed(4)}%; atmospheric terminal velocity error ${vtErrPct.toFixed(4)}%.`,
  };
}

/**
 * 3. RK4 Step-Size Convergence Verification (dt vs dt/2)
 * Compares 3D powered flight position against a fine reference dt_ref = 0.001 s across dt = 0.08 s and dt = 0.04 s.
 */
export function testRk4Convergence(): VerificationTestResult {
  const runForDuration = (dt: number, totalTime: number) => {
    const sim = new RocketSimulator(
      DEFAULT_ROCKET_PARAMS,
      { ...DEFAULT_ENV_PARAMS, windSpeedX: 4.0, windSpeedZ: -2.0 },
      { flightMode: 'manual', fidelity: '3d', initialAltitude: 300 }
    );
    const cmd = {
      throttle: 0.75,
      gimbalPitchCmd: 0.05,
      gimbalYawCmd: -0.03,
      rcsRollTorque: 1200,
      deployLegs: false,
    };
    let s = {
      ...sim.state,
      gimbalPitch: cmd.gimbalPitchCmd,
      gimbalYaw: cmd.gimbalYawCmd,
    };
    const steps = Math.round(totalTime / dt);
    for (let i = 0; i < steps; i++) {
      s = stepRK4(
        s,
        cmd,
        sim.params,
        sim.env,
        '3d',
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        dt
      ).nextState;
    }
    return s.position;
  };

  const T = 4.0;
  const pRef = runForDuration(0.001, T);
  const pCoarse = runForDuration(0.08, T);
  const pFine = runForDuration(0.04, T);

  const errCoarse = Math.hypot(
    pCoarse.x - pRef.x,
    pCoarse.y - pRef.y,
    pCoarse.z - pRef.z
  );
  const errFine = Math.hypot(pFine.x - pRef.x, pFine.y - pRef.y, pFine.z - pRef.z);
  const ratio = errFine > 1e-12 ? errCoarse / errFine : 16;
  const observedOrder = Math.log2(Math.max(1, ratio));
  // Expect ~4th order convergence (ratio ~ 16, order ~ 4.0)
  const passed = ratio >= 10 && errFine < 1e-3;

  return {
    id: 'rk4_convergence',
    name: 'RK4 Order-4 Convergence (dt vs dt/2)',
    passed,
    expected: `Ratio ~ 16.0 (Order ~ 4.0)`,
    measured: `Ratio = ${ratio.toFixed(2)} (Order ${observedOrder.toFixed(2)})`,
    relativeErrorPct: Math.min(100, (errFine / Math.max(1, Math.abs(pRef.y))) * 100),
    details: `err(0.08s)=${errCoarse.toExponential(2)} m -> err(0.04s)=${errFine.toExponential(2)} m over T=${T}s.`,
  };
}

/**
 * 4. Closed-Loop Propulsive Landing Recovery Under Crosswind & Mid-Air Impulse Disturbance
 */
export function testClosedLoopLandingRecovery(): VerificationTestResult {
  const sim = new RocketSimulator(
    DEFAULT_ROCKET_PARAMS,
    { ...DEFAULT_ENV_PARAMS, windSpeedX: 6.0, windSpeedZ: -3.5, windShearPerKm: 4.0 },
    {
      flightMode: 'landing',
      fidelity: '3d',
      initialAltitude: 120,
      initialOffsetX: 14,
      initialOffsetZ: -10,
      initialVy: -10,
      initialTiltDeg: 8,
      targetPadX: 0,
      targetPadZ: 0,
    }
  );

  const dt = 0.005;
  let impulseApplied = false;
  const maxSteps = 10000; // up to 50s

  for (let i = 0; i < maxSteps; i++) {
    if (!impulseApplied && sim.state.flightTime >= 2.0) {
      // Inject a sharp 3D lateral force + attitude torque poke mid-descent
      sim.applyUserImpulse({ x: -18000, y: 0, z: 14000 }, { x: 24000, y: 0, z: 22000 }, 0.25);
      impulseApplied = true;
    }
    sim.stepFixed(dt);
    if (sim.state.isGrounded && sim.state.flightTime > 4.0) {
      // Settle for 0.5s after touchdown
      for (let j = 0; j < 100; j++) sim.stepFixed(dt);
      break;
    }
  }

  const telemetry = sim.getTelemetry();
  const passed =
    telemetry.touchdownStatus === 'safe_landing' &&
    telemetry.padDistance < 5.0 &&
    telemetry.tiltDeg < 6.0;

  return {
    id: 'landing_recovery',
    name: 'Closed-Loop Landing & Disturbance Recovery',
    passed,
    expected: 'SAFE_LANDING, padDist < 5.0 m, tilt < 6.0 deg',
    measured: `${telemetry.touchdownStatus.toUpperCase()}, padDist=${telemetry.padDistance.toFixed(2)} m, tilt=${telemetry.tiltDeg.toFixed(2)} deg`,
    relativeErrorPct: (telemetry.padDistance / 5.0) * 100,
    details: `Crosswind (6.0, -3.5) m/s + mid-air 22.8 kN poke at t=2.0 s; legs=${(telemetry.legDeployment * 100).toFixed(0)}%, impact=${sim.state.impactSpeed.toFixed(2)} m/s.`,
  };
}

export function runAllVerificationTests(): VerificationReport {
  const results = [
    testTsiolkovskyDeltaV(),
    testFreeFallAndTerminalVelocity(),
    testRk4Convergence(),
    testClosedLoopLandingRecovery(),
  ];
  return {
    allPassed: results.every((r) => r.passed),
    timestampIso: new Date().toISOString(),
    results,
  };
}
