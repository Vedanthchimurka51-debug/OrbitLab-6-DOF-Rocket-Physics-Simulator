/**
 * Pure 3D vector and quaternion algebra in SI units.
 * Right-handed world frame: +X right, +Y vertical up, +Z toward viewer.
 * Body frame: +Y along rocket longitudinal axis (nose), +X pitch axis, +Z yaw/pitch lateral axis.
 * Zero rendering or DOM dependencies.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export const VEC3_ZERO: Vec3 = { x: 0, y: 0, z: 0 };
export const QUAT_IDENTITY: Quat = { w: 1, x: 0, y: 0, z: 0 };

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vecLenSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vecLen(v: Vec3): number {
  return Math.sqrt(vecLenSq(v));
}

export function vecNormalize(v: Vec3, fallback: Vec3 = { x: 0, y: 1, z: 0 }): Vec3 {
  const len = vecLen(v);
  if (!Number.isFinite(len) || len < 1e-12) {
    return { ...fallback };
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export function quatNormalize(q: Quat): Quat {
  const norm = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
  if (!Number.isFinite(norm) || norm < 1e-12) {
    return { w: 1, x: 0, y: 0, z: 0 };
  }
  const inv = 1 / norm;
  return { w: q.w * inv, x: q.x * inv, y: q.y * inv, z: q.z * inv };
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatConjugate(q: Quat): Quat {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

/**
 * Transform a vector from body frame to world frame: v_world = R(q) * v_body.
 */
export function rotateVecByQuat(v: Vec3, q: Quat): Vec3 {
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;

  const ix = qw * v.x + qy * v.z - qz * v.y;
  const iy = qw * v.y + qz * v.x - qx * v.z;
  const iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

/**
 * Transform a vector from world frame to body frame: v_body = R(q)^T * v_world.
 */
export function rotateVecByQuatConj(v: Vec3, q: Quat): Vec3 {
  return rotateVecByQuat(v, quatConjugate(q));
}

/**
 * Hamilton quaternion kinematics: dq/dt = 0.5 * q (x) [0, wx, wy, wz].
 */
export function quatDerivative(q: Quat, omegaBody: Vec3): Quat {
  const half = 0.5;
  return {
    w: half * (-q.x * omegaBody.x - q.y * omegaBody.y - q.z * omegaBody.z),
    x: half * (q.w * omegaBody.x + q.y * omegaBody.z - q.z * omegaBody.y),
    y: half * (q.w * omegaBody.y - q.x * omegaBody.z + q.z * omegaBody.x),
    z: half * (q.w * omegaBody.z + q.x * omegaBody.y - q.y * omegaBody.x),
  };
}

/**
 * Construct a quaternion from Euler angles (radians) in XYZ intrinsic order.
 */
export function quatFromEulerXYZ(rx: number, ry: number, rz: number): Quat {
  const cx = Math.cos(rx * 0.5);
  const sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5);
  const sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5);
  const sz = Math.sin(rz * 0.5);

  return quatNormalize({
    w: cx * cy * cz - sx * sy * sz,
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
  });
}

/**
 * Tilt angle (radians) between rocket body +Y axis and world +Y up axis.
 */
export function getTiltAngleRad(q: Quat): number {
  const bodyUp = rotateVecByQuat({ x: 0, y: 1, z: 0 }, q);
  return Math.acos(clamp(bodyUp.y, -1, 1));
}
