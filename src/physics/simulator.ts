import { FlightController } from './controller';
import { evaluateForcesAndDerivatives, getRocketBottomOffset, stepRK4 } from './integrator';
import { getTiltAngleRad, quatFromEulerXYZ, vecScale, type Vec3 } from './math';
import { computeVacuumDeltaV } from './propulsion';
import {
  DEFAULT_ENV_PARAMS,
  DEFAULT_ROCKET_PARAMS,
  DEFAULT_SIM_CONFIG,
  type EnvironmentParams,
  type ForceBreakdown,
  type ManualInputs,
  type RocketParams,
  type RocketState,
  type SimulationConfig,
  type TelemetrySnapshot,
} from './types';

export const FIXED_PHYSICS_DT = 0.005;

export class RocketSimulator {
  public params: RocketParams;
  public env: EnvironmentParams;
  public config: SimulationConfig;
  public state: RocketState;
  public manualInputs: ManualInputs;
  public lastForces: ForceBreakdown;
  public trajectory: Vec3[] = [];
  public controller: FlightController;

  private accumulator = 0;
  private trajectorySampleTimer = 0;
  private userTouchForce: Vec3 = { x: 0, y: 0, z: 0 };
  private userTouchTorqueBody: Vec3 = { x: 0, y: 0, z: 0 };
  private userTouchDuration = 0;

  constructor(
    params: Partial<RocketParams> = {},
    env: Partial<EnvironmentParams> = {},
    config: Partial<SimulationConfig> = {}
  ) {
    this.params = { ...DEFAULT_ROCKET_PARAMS, ...params };
    this.env = { ...DEFAULT_ENV_PARAMS, ...env };
    this.config = { ...DEFAULT_SIM_CONFIG, ...config };
    this.manualInputs = {
      throttle: 0.45,
      pitch: 0,
      yaw: 0,
      roll: 0,
      deployLegs: true,
    };
    this.controller = new FlightController();
    this.state = this.createInitialState();
    this.lastForces = evaluateForcesAndDerivatives(
      this.state,
      { throttle: 0, gimbalPitchCmd: 0, gimbalYawCmd: 0, rcsRollTorque: 0, deployLegs: false },
      this.params,
      this.env,
      this.config.fidelity,
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 }
    ).forces;
    this.trajectory = [{ ...this.state.position }];
  }

  public createInitialState(): RocketState {
    const mode = this.config.flightMode;
    const is1D = this.config.fidelity === '1d';
    const is2D = this.config.fidelity === '2d';

    if (mode === 'ascent') {
      const bottomY = 0.5 * this.params.height;
      return {
        position: { x: 0, y: bottomY, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        orientation: { w: 1, x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
        propellantMass: this.params.propellantMassInitial,
        gimbalPitch: 0,
        gimbalYaw: 0,
        throttle: 0,
        legDeployment: 0,
        flightTime: 0,
        touchdownStatus: 'on_pad',
        impactSpeed: 0,
        crashIntensity: 0,
        crashPoint: null,
        isGrounded: true,
        isGrabbed: false,
      };
    }

    const startProp =
      mode === 'landing'
        ? Math.min(this.params.propellantMassInitial, Math.max(3500, this.params.propellantMassInitial * 0.45))
        : mode === 'manual'
          ? this.params.propellantMassInitial
          : this.params.propellantMassInitial * 0.3;

    const tiltRad = is1D ? 0 : (this.config.initialTiltDeg * Math.PI) / 180;
    const initQuat =
      mode === 'landing' || mode === 'freefall'
        ? quatFromEulerXYZ(is2D ? 0 : tiltRad * 0.6, 0, -tiltRad * 0.8)
        : { w: 1, x: 0, y: 0, z: 0 };

    const startAlt = Math.max(15, this.config.initialAltitude);
    const startY = startAlt + 0.5 * this.params.height;

    return {
      position: {
        x: is1D ? 0 : this.config.initialOffsetX,
        y: mode === 'manual' ? Math.max(25, startAlt * 0.4) : startY,
        z: is1D || is2D ? 0 : this.config.initialOffsetZ,
      },
      velocity: {
        x: 0,
        y: mode === 'landing' || mode === 'freefall' ? this.config.initialVy : 0,
        z: 0,
      },
      orientation: initQuat,
      angularVelocity: { x: 0, y: 0, z: 0 },
      propellantMass: startProp,
      gimbalPitch: 0,
      gimbalYaw: 0,
      throttle: 0,
      legDeployment: mode === 'manual' ? 1 : 0,
      flightTime: 0,
      touchdownStatus: 'in_flight',
      impactSpeed: 0,
      crashIntensity: 0,
      crashPoint: null,
      isGrounded: false,
      isGrabbed: false,
    };
  }

  public reset(partialConfig?: Partial<SimulationConfig>): void {
    if (partialConfig) {
      this.config = { ...this.config, ...partialConfig };
    }
    this.accumulator = 0;
    this.trajectorySampleTimer = 0;
    this.userTouchForce = { x: 0, y: 0, z: 0 };
    this.userTouchTorqueBody = { x: 0, y: 0, z: 0 };
    this.userTouchDuration = 0;
    this.controller.reset();
    this.state = this.createInitialState();
    this.trajectory = [{ ...this.state.position }];
    this.lastForces = evaluateForcesAndDerivatives(
      this.state,
      { throttle: 0, gimbalPitchCmd: 0, gimbalYawCmd: 0, rcsRollTorque: 0, deployLegs: false },
      this.params,
      this.env,
      this.config.fidelity,
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 }
    ).forces;
  }

  public applyUserImpulse(forceWorld: Vec3, torqueBody: Vec3, duration = 0.25): void {
    this.userTouchForce = { ...forceWorld };
    this.userTouchTorqueBody = { ...torqueBody };
    this.userTouchDuration = Math.max(0.05, duration);
  }

  public clearUserImpulse(): void {
    this.userTouchForce = { x: 0, y: 0, z: 0 };
    this.userTouchTorqueBody = { x: 0, y: 0, z: 0 };
    this.userTouchDuration = 0;
  }

  public setGrabbed(grabbed: boolean, worldPos?: Vec3): void {
    this.state = {
      ...this.state,
      isGrabbed: grabbed,
      isGrounded: grabbed ? false : this.state.isGrounded,
      touchdownStatus: grabbed ? 'in_flight' : this.state.touchdownStatus,
      crashIntensity: grabbed ? 0 : this.state.crashIntensity,
      crashPoint: grabbed ? null : this.state.crashPoint,
      impactSpeed: grabbed ? 0 : this.state.impactSpeed,
      velocity: grabbed ? { x: 0, y: 0, z: 0 } : this.state.velocity,
      angularVelocity: grabbed ? { x: 0, y: 0, z: 0 } : this.state.angularVelocity,
      position: worldPos
        ? {
            x: this.config.fidelity === '1d' ? 0 : worldPos.x,
            y: Math.max(getRocketBottomOffset(this.params, this.state.legDeployment) + 0.5, worldPos.y),
            z: this.config.fidelity !== '3d' ? 0 : worldPos.z,
          }
        : this.state.position,
    };
  }

  public setTargetPad(x: number, z: number): void {
    this.config.targetPadX = x;
    this.config.targetPadZ = this.config.fidelity === '3d' ? z : 0;
  }

  public stepFixed(dt = FIXED_PHYSICS_DT): void {
    if (this.userTouchDuration > 0) {
      this.userTouchDuration = Math.max(0, this.userTouchDuration - dt);
      if (this.userTouchDuration === 0) {
        this.userTouchForce = { x: 0, y: 0, z: 0 };
        this.userTouchTorqueBody = { x: 0, y: 0, z: 0 };
      }
    }

    const commands = this.controller.computeCommands(
      this.state,
      this.params,
      this.env,
      this.config,
      this.manualInputs,
      dt
    );

    const result = stepRK4(
      this.state,
      commands,
      this.params,
      this.env,
      this.config.fidelity,
      this.userTouchForce,
      this.userTouchTorqueBody,
      dt
    );

    this.state = result.nextState;
    this.lastForces = result.forces;

    this.trajectorySampleTimer += dt;
    if (this.trajectorySampleTimer >= 0.08) {
      this.trajectorySampleTimer = 0;
      const last = this.trajectory[this.trajectory.length - 1];
      const dx = this.state.position.x - last.x;
      const dy = this.state.position.y - last.y;
      const dz = this.state.position.z - last.z;
      if (dx * dx + dy * dy + dz * dz > 0.25) {
        this.trajectory.push({ ...this.state.position });
        if (this.trajectory.length > 900) {
          this.trajectory.shift();
        }
      }
    }
  }

  public advance(elapsedSeconds: number, dt = FIXED_PHYSICS_DT): number {
    const safeElapsed = Math.min(0.1, Math.max(0, elapsedSeconds));
    this.accumulator += safeElapsed;
    let substeps = 0;
    const maxSubsteps = 40;
    while (this.accumulator >= dt && substeps < maxSubsteps) {
      this.stepFixed(dt);
      this.accumulator -= dt;
      substeps++;
    }
    return substeps;
  }

  public getTelemetry(): TelemetrySnapshot {
    const bottomOffset = getRocketBottomOffset(this.params, this.state.legDeployment);
    const altitudeAGL = Math.max(0, this.state.position.y - bottomOffset);
    const totalMass = this.params.dryMass + this.state.propellantMass;
    const horizSpeed = Math.hypot(this.state.velocity.x, this.state.velocity.z);
    const totalSpeed = Math.hypot(horizSpeed, this.state.velocity.y);
    const tiltDeg = (getTiltAngleRad(this.state.orientation) * 180) / Math.PI;
    const padDistance = Math.hypot(
      this.state.position.x - this.config.targetPadX,
      this.state.position.z - this.config.targetPadZ
    );

    // Rotational & translational kinetic energy + gravitational potential energy
    const r2 = this.params.radius * this.params.radius;
    const h2 = this.params.height * this.params.height;
    const iTrans = (1 / 12) * totalMass * (3 * r2 + h2);
    const iAxial = 0.5 * totalMass * r2;
    const w = this.state.angularVelocity;
    const rotKinetic = 0.5 * (iTrans * (w.x * w.x + w.z * w.z) + iAxial * w.y * w.y);
    const transKinetic = 0.5 * totalMass * totalSpeed * totalSpeed;
    const kineticEnergyJ = transKinetic + rotKinetic;
    const potentialEnergyJ = totalMass * this.lastForces.gravityMag * altitudeAGL;

    const fThrust = this.lastForces.thrustWorld;
    const thrustPowerW =
      fThrust.x * this.state.velocity.x +
      fThrust.y * this.state.velocity.y +
      fThrust.z * this.state.velocity.z;

    const weightN = Math.max(1, totalMass * this.lastForces.gravityMag);
    const twr = this.lastForces.thrustMag / weightN;

    const netX =
      this.lastForces.gravityWorld.x +
      this.lastForces.dragWorld.x +
      this.lastForces.thrustWorld.x +
      this.lastForces.userTouchWorld.x;
    const netY =
      this.lastForces.gravityWorld.y +
      this.lastForces.dragWorld.y +
      this.lastForces.thrustWorld.y +
      this.lastForces.userTouchWorld.y;
    const netZ =
      this.lastForces.gravityWorld.z +
      this.lastForces.dragWorld.z +
      this.lastForces.thrustWorld.z +
      this.lastForces.userTouchWorld.z;
    const netForceMag = Math.hypot(netX, netY, netZ);

    const aeroTorqueMag = Math.hypot(
      this.lastForces.aeroTorqueBody.x,
      this.lastForces.aeroTorqueBody.y,
      this.lastForces.aeroTorqueBody.z
    );
    const tvcTorqueMag = Math.hypot(
      this.lastForces.tvcTorqueBody.x,
      this.lastForces.tvcTorqueBody.y,
      this.lastForces.tvcTorqueBody.z
    );

    return {
      altitudeAGL,
      altitudeCom: this.state.position.y,
      verticalSpeed: this.state.velocity.y,
      horizontalSpeed: horizSpeed,
      totalSpeed,
      tiltDeg,
      throttlePct: this.state.throttle * 100,
      gimbalPitchDeg: (this.state.gimbalPitch * 180) / Math.PI,
      gimbalYawDeg: (this.state.gimbalYaw * 180) / Math.PI,
      propellantMass: this.state.propellantMass,
      propellantPct:
        this.params.propellantMassInitial > 0
          ? (this.state.propellantMass / this.params.propellantMassInitial) * 100
          : 0,
      totalMass,
      dynamicPressure: this.lastForces.dynamicPressure,
      remainingDeltaV: computeVacuumDeltaV(
        this.params.dryMass,
        this.state.propellantMass,
        this.params.isp,
        this.env.g0
      ),
      flightTime: this.state.flightTime,
      touchdownStatus: this.state.touchdownStatus,
      padDistance,
      legDeployment: this.state.legDeployment,
      isGrounded: this.state.isGrounded,
      impactSpeed: this.state.impactSpeed,
      crashIntensity: this.state.crashIntensity,
      crashPoint: this.state.crashPoint,
      kineticEnergyJ,
      potentialEnergyJ,
      thrustPowerW,
      twr,
      netForceMag,
      aeroTorqueMag,
      tvcTorqueMag,
      forces: {
        ...this.lastForces,
        gravityWorld: vecScale(this.lastForces.gravityWorld, 1),
      },
    };
  }
}
