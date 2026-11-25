import { clamp, getTiltAngleRad, rotateVecByQuatConj, type Vec3 } from './math';
import { getMaxThrust } from './propulsion';
import type {
  ControlCommands,
  EnvironmentParams,
  FlightMode,
  ManualInputs,
  RocketParams,
  RocketState,
  SimulationConfig,
} from './types';

class LowPassDerivativePid {
  private integral = 0;
  private prevError = 0;
  private filteredDeriv = 0;
  private initialized = false;

  reset(): void {
    this.integral = 0;
    this.prevError = 0;
    this.filteredDeriv = 0;
    this.initialized = false;
  }

  step(
    error: number,
    dt: number,
    kp: number,
    ki: number,
    kd: number,
    integralLimit: number,
    derivTau = 0.03
  ): number {
    if (dt <= 0) return kp * error;

    // Anti-windup clamped integral
    this.integral = clamp(this.integral + error * dt, -integralLimit, integralLimit);

    // Low-pass filtered derivative
    const rawDeriv = this.initialized ? (error - this.prevError) / dt : 0;
    this.prevError = error;
    this.initialized = true;

    const alpha = dt / (derivTau + dt);
    this.filteredDeriv = this.filteredDeriv + alpha * (rawDeriv - this.filteredDeriv);

    return kp * error + ki * this.integral + kd * this.filteredDeriv;
  }
}

export class FlightController {
  private posPidX = new LowPassDerivativePid();
  private posPidZ = new LowPassDerivativePid();
  private attPidPitch = new LowPassDerivativePid();
  private attPidYaw = new LowPassDerivativePid();
  private omegaFilteredX = 0;
  private omegaFilteredZ = 0;
  private mecoTriggered = false;

  reset(): void {
    this.posPidX.reset();
    this.posPidZ.reset();
    this.attPidPitch.reset();
    this.attPidYaw.reset();
    this.omegaFilteredX = 0;
    this.omegaFilteredZ = 0;
    this.mecoTriggered = false;
  }

  computeCommands(
    state: RocketState,
    params: RocketParams,
    env: EnvironmentParams,
    config: SimulationConfig,
    manual: ManualInputs,
    dt: number
  ): ControlCommands {
    const mode: FlightMode = config.flightMode;

    // If user is physically holding the rocket, keep engine safe
    if (state.isGrabbed) {
      return {
        throttle: 0,
        gimbalPitchCmd: 0,
        gimbalYawCmd: 0,
        rcsRollTorque: 0,
        deployLegs: state.legDeployment > 0.5,
      };
    }

    if (mode === 'freefall') {
      return {
        throttle: 0,
        gimbalPitchCmd: 0,
        gimbalYawCmd: 0,
        rcsRollTorque: 0,
        deployLegs: false,
      };
    }

    if (mode === 'manual') {
      const gp = clamp(manual.pitch, -1, 1) * params.maxGimbalRad;
      const gy = clamp(manual.yaw, -1, 1) * params.maxGimbalRad;
      return {
        throttle: state.propellantMass > 0 ? clamp(manual.throttle, 0, 1) : 0,
        gimbalPitchCmd: gp,
        gimbalYawCmd: gy,
        rcsRollTorque: clamp(manual.roll, -1, 1) * 18000,
        deployLegs: manual.deployLegs,
      };
    }

    if (mode === 'ascent') {
      return this.computeAscentCommands(state, params, config, dt);
    }

    return this.computeLandingCommands(state, params, env, config, dt);
  }

  private computeAscentCommands(
    state: RocketState,
    params: RocketParams,
    config: SimulationConfig,
    dt: number
  ): ControlCommands {
    const bottomOffset = 0.5 * params.height + state.legDeployment * params.legVerticalOffset;
    const altAGL = Math.max(0, state.position.y - bottomOffset);

    if (state.propellantMass <= 1 || state.flightTime > 45) {
      this.mecoTriggered = true;
    }

    if (this.mecoTriggered) {
      return {
        throttle: 0,
        gimbalPitchCmd: 0,
        gimbalYawCmd: 0,
        rcsRollTorque: 0,
        deployLegs: false,
      };
    }

    // Gravity turn profile: vertical tower clear, then smooth pitch-over toward +X
    let targetTiltX = 0;
    if (altAGL > 20) {
      const turnProgress = clamp((altAGL - 20) / 420, 0, 1);
      targetTiltX = turnProgress * ((42 * Math.PI) / 180);
    }

    const dirDesWorld: Vec3 =
      config.fidelity === '1d'
        ? { x: 0, y: 1, z: 0 }
        : {
            x: Math.sin(targetTiltX),
            y: Math.cos(targetTiltX),
            z: 0,
          };

    const { gimbalPitchCmd, gimbalYawCmd, rcsRollTorque } = this.computeAttitudeControl(
      state,
      params,
      dirDesWorld,
      1.0,
      config.fidelity,
      dt
    );

    return {
      throttle: 1.0,
      gimbalPitchCmd,
      gimbalYawCmd,
      rcsRollTorque,
      deployLegs: false,
    };
  }

  private computeLandingCommands(
    state: RocketState,
    params: RocketParams,
    env: EnvironmentParams,
    config: SimulationConfig,
    dt: number
  ): ControlCommands {
    const bottomOffset = 0.5 * params.height + state.legDeployment * params.legVerticalOffset;
    const altAGL = Math.max(0, state.position.y - bottomOffset);
    const deployLegs = altAGL < 35 || state.legDeployment > 0.05;

    // Cut engine cleanly upon touchdown
    if (state.isGrounded || state.touchdownStatus !== 'in_flight') {
      return {
        throttle: 0,
        gimbalPitchCmd: 0,
        gimbalYawCmd: 0,
        rcsRollTorque: 0,
        deployLegs: true,
      };
    }

    if (state.propellantMass <= 0.1) {
      return {
        throttle: 0,
        gimbalPitchCmd: 0,
        gimbalYawCmd: 0,
        rcsRollTorque: 0,
        deployLegs,
      };
    }

    const totalMass = params.dryMass + state.propellantMass;
    const maxThrust = getMaxThrust(params, env);
    const gLocal = env.g0;
    const tiltRad = getTiltAngleRad(state.orientation);
    const cosTilt = Math.max(0.35, Math.cos(tiltRad));
    const maxUpAccel = Math.max(1.0, (maxThrust * cosTilt) / totalMass - gLocal);

    const errX = config.fidelity !== '1d' ? config.targetPadX - state.position.x : 0;
    const errZ = config.fidelity === '3d' ? config.targetPadZ - state.position.z : 0;
    const padDist = Math.hypot(errX, errZ);

    // Target vertical velocity profile (hover-slam / suicide-burn curve)
    const vDown = Math.max(0, -state.velocity.y);
    const stopDistance = (vDown * vDown) / (2 * 0.68 * maxUpAccel);
    let vyTarget: number;
    if (altAGL > 30) {
      vyTarget = -Math.min(30, 2.5 + Math.sqrt(2 * 0.40 * maxUpAccel * altAGL));
    } else if (altAGL > 5) {
      vyTarget = -Math.min(10, 0.9 + 0.30 * altAGL);
    } else {
      vyTarget = -clamp(0.55 + 0.35 * altAGL, 0.55, 2.3);
    }

    // Pace descent slightly when still translating laterally onto the pad
    if (altAGL > 8 && altAGL < 65 && padDist > 5) {
      const paceFactor = clamp(1 - (padDist - 5) / 45, 0.45, 1.0);
      vyTarget *= paceFactor;
    }

    const vyError = vyTarget - state.velocity.y;
    const accelCmdY = gLocal + 1.55 * vyError;
    let throttle = clamp((totalMass * accelCmdY) / (maxThrust * cosTilt), 0.03, 1.0);

    // Suicide burn safety override if approaching stopping floor fast
    if (altAGL <= stopDistance + 4 && state.velocity.y < -1.5) {
      throttle = clamp(Math.max(throttle, 0.84 + 0.12 * (stopDistance - altAGL)), 0.05, 1.0);
    }

    // Outer loop horizontal position & velocity guidance -> desired world acceleration
    let dirDesWorld: Vec3 = { x: 0, y: 1, z: 0 };
    if (config.fidelity !== '1d') {
      const maxHorizSpeed =
        altAGL > 25 ? 14 : altAGL > 8 ? 7.5 : clamp(0.7 + altAGL * 0.3, 0.7, 3.1);
      const kpPos = altAGL > 20 ? 0.45 : 0.62;
      const vxDes = clamp(kpPos * errX, -maxHorizSpeed, maxHorizSpeed);
      const vzDes = clamp(kpPos * errZ, -maxHorizSpeed, maxHorizSpeed);

      const vxErr = vxDes - state.velocity.x;
      const vzErr = vzDes - state.velocity.z;

      // Well-damped velocity loop + integral crosswind compensation
      const axDes = this.posPidX.step(vxErr, dt, 1.25, 0.30, 0.10, 14.0, 0.05);
      const azDes =
        config.fidelity === '3d'
          ? this.posPidZ.step(vzErr, dt, 1.25, 0.30, 0.10, 14.0, 0.05)
          : 0;

      // Allow strong lateral authority until final 2m flare upright
      const maxTiltRad =
        altAGL < 1.8
          ? (3.5 * Math.PI) / 180
          : altAGL < 8
            ? ((3.5 + ((altAGL - 1.8) / 6.2) * 14.5) * Math.PI) / 180
            : (25 * Math.PI) / 180;

      const vertRef = Math.max(gLocal, accelCmdY);
      const horizMag = Math.hypot(axDes, azDes);
      const maxHorizAccel = Math.tan(maxTiltRad) * vertRef;
      const horizScale = horizMag > maxHorizAccel && horizMag > 1e-6 ? maxHorizAccel / horizMag : 1;

      const tx = axDes * horizScale;
      const tz = azDes * horizScale;
      const norm = Math.hypot(tx, vertRef, tz) || 1;
      dirDesWorld = { x: tx / norm, y: vertRef / norm, z: tz / norm };
    }

    const { gimbalPitchCmd, gimbalYawCmd, rcsRollTorque } = this.computeAttitudeControl(
      state,
      params,
      dirDesWorld,
      throttle,
      config.fidelity,
      dt
    );

    return {
      throttle,
      gimbalPitchCmd,
      gimbalYawCmd,
      rcsRollTorque,
      deployLegs,
    };
  }

  private computeAttitudeControl(
    state: RocketState,
    params: RocketParams,
    dirDesWorld: Vec3,
    throttle: number,
    fidelity: '3d' | '2d' | '1d',
    dt: number
  ): { gimbalPitchCmd: number; gimbalYawCmd: number; rcsRollTorque: number } {
    if (fidelity === '1d') {
      return { gimbalPitchCmd: 0, gimbalYawCmd: 0, rcsRollTorque: 0 };
    }

    const dirDesBody = rotateVecByQuatConj(dirDesWorld, state.orientation);

    // Low-pass filter body angular rates for clean derivative damping
    const alpha = dt > 0 ? dt / (0.025 + dt) : 1;
    this.omegaFilteredX += alpha * (state.angularVelocity.x - this.omegaFilteredX);
    this.omegaFilteredZ += alpha * (state.angularVelocity.z - this.omegaFilteredZ);

    // Normalize control authority across throttle levels so attitude response stays crisp
    const throttleGainScale = clamp(0.45 / Math.max(0.18, throttle), 0.7, 2.2);

    // Body +Y rotated toward +Z requires +tau_x -> +gimbalPitch
    // Body +Y rotated toward +X requires -tau_z -> -gimbalYaw
    const pitchAttErr = dirDesBody.z;
    const yawAttErr = -dirDesBody.x;

    const kpAtt = 0.85 * throttleGainScale;
    const kiAtt = 0.08 * throttleGainScale;
    const kdRate = 0.52 * throttleGainScale;

    const pitchOut =
      fidelity === '3d'
        ? this.attPidPitch.step(pitchAttErr, dt, kpAtt, kiAtt, 0, 0.2, 0.03) -
          kdRate * this.omegaFilteredX
        : 0;
    const yawOut =
      this.attPidYaw.step(yawAttErr, dt, kpAtt, kiAtt, 0, 0.2, 0.03) -
      kdRate * this.omegaFilteredZ;

    // Gentle roll rate damping via cold-gas RCS
    const rcsRollTorque =
      fidelity === '3d' ? clamp(-state.angularVelocity.y * 12000, -15000, 15000) : 0;

    return {
      gimbalPitchCmd: clamp(pitchOut, -params.maxGimbalRad, params.maxGimbalRad),
      gimbalYawCmd: clamp(yawOut, -params.maxGimbalRad, params.maxGimbalRad),
      rcsRollTorque,
    };
  }
}
