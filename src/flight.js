import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const attitude = new THREE.Euler(0, 0, 0, 'YXZ');
export const FLIGHT = { rotationSpeed: 0.95, maximumSpeed: 560, groundClearance: 3, takeoffSpeed: 68, stallSpeed: 53, mapLimit: 32000 };

export function createFlightState() {
  return { position: new THREE.Vector3(), previous: new THREE.Vector3(), velocity: new THREE.Vector3(), quaternion: new THREE.Quaternion(),
    heading: 0, pitch: 0, roll: 0, speed: 0, throttle: 0.65, health: 100, gear: false, grounded: false, afterburner: false, verticalSpeed: 0, stall: false };
}

export function resetFlight(s, config = {}) {
  s.position.set(...(config.position || [-6000, 700, 10000]));
  s.previous.copy(s.position); s.velocity.set(0, 0, 0);
  s.heading = config.heading || 0; s.pitch = config.pitch || 0; s.roll = 0;
  s.speed = config.speed ?? 210; s.throttle = config.throttle ?? 0.65;
  s.health = 100; s.gear = config.gear ?? false; s.grounded = config.grounded ?? false;
  s.afterburner = false; s.verticalSpeed = 0; s.stall = false;
  attitude.set(s.pitch, -s.heading, s.roll); s.quaternion.setFromEuler(attitude);
  return s;
}

// All simulation uses metres, seconds and radians, at a fixed 1/60 second step.
export function updateFlight(s, input, dt, world) {
  s.previous.copy(s.position);
  s.throttle = clamp(s.throttle + (input.throttle || 0) * dt * 0.42, 0, 1);
  s.afterburner = !!input.boost && s.throttle > 0.25;
  const targetSpeed = s.throttle * (s.gear ? 285 : 385) + (s.afterburner ? 175 : 0);
  s.speed = clamp(s.speed + clamp((targetSpeed - s.speed) * 0.34, -46, s.afterburner ? 65 : 40) * dt, 0, FLIGHT.maximumSpeed);
  const pitchControl = input.pitch || 0, bankControl = input.roll || 0;
  if (s.grounded) {
    s.roll = 0;
    s.heading += ((input.yaw || 0) + bankControl * 0.45) * dt * Math.min(s.speed / 60, 0.65);
    s.pitch = THREE.MathUtils.damp(s.pitch, s.speed > 55 ? Math.max(0, pitchControl) * 0.12 : 0, 7, dt);
    s.position.x += Math.sin(s.heading) * s.speed * dt;
    s.position.z -= Math.cos(s.heading) * s.speed * dt;
    s.position.y = world.terrainHeight(s.position.x, s.position.z) + FLIGHT.groundClearance;
    s.verticalSpeed = 0;
    if (s.speed > FLIGHT.takeoffSpeed && pitchControl > 0.15) { s.grounded = false; s.pitch = 0.16; s.position.y += 0.3; }
    if (!world.isRunway(s.position.x, s.position.z)) return 'runway-excursion';
  } else {
    s.roll = THREE.MathUtils.damp(s.roll, -bankControl * 1.2, 4.1, dt);
    let targetPitch = pitchControl * 0.82;
    // A gentle approach envelope makes keyboard landing possible without an analog stick.
    const approach = s.gear && s.speed < 150 && s.position.y < 240 && Math.abs(s.position.x + 6000) < 260 && s.position.z > 5000 && s.position.z < 14000;
    if (approach) targetPitch = clamp(targetPitch, -0.095, 0.35);
    s.pitch = THREE.MathUtils.damp(s.pitch, targetPitch, 2.1, dt);
    s.heading += (-Math.sin(s.roll) * FLIGHT.rotationSpeed + (input.yaw || 0) * 0.42) * dt * clamp(s.speed / 100, 0.2, 1);
    s.stall = s.speed < FLIGHT.stallSpeed;
    s.velocity.set(Math.sin(s.heading) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.heading) * Math.cos(s.pitch)).multiplyScalar(s.speed);
    if (s.stall) s.velocity.y -= (FLIGHT.stallSpeed - s.speed) * 0.65;
    if (approach && s.velocity.y < -8) s.velocity.y = -8;
    s.verticalSpeed = s.velocity.y;
    s.position.addScaledVector(s.velocity, dt);
    const ground = world.terrainHeight(s.position.x, s.position.z);
    if (s.position.y < ground + FLIGHT.groundClearance) {
      s.position.y = ground + FLIGHT.groundClearance;
      if (world.isRunway(s.position.x, s.position.z) && s.gear && s.speed < 115 && s.verticalSpeed > -15 && Math.abs(s.roll) < 0.3 && Math.abs(s.pitch) < 0.35) {
        s.grounded = true; s.pitch = 0; s.roll = 0; s.verticalSpeed = 0;
        return 'touchdown';
      }
      return 'crash';
    }
  }
  attitude.set(s.pitch, -s.heading, s.roll); s.quaternion.setFromEuler(attitude);
  s.heading = ((s.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return null;
}

export function segmentSphere(a, b, center, radius) {
  const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
  const length=dx*dx+dy*dy+dz*dz;
  const t=length ? clamp(((center.x-a.x)*dx+(center.y-a.y)*dy+(center.z-a.z)*dz)/length,0,1) : 0;
  return (a.x+dx*t-center.x)**2+(a.y+dy*t-center.y)**2+(a.z+dz*t-center.z)**2 <= radius*radius;
}
