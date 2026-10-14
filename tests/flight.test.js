import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlightState, resetFlight, updateFlight, segmentSphere, FLIGHT } from '../src/flight.js';

const DT = 1 / 60;
const levelWorld = { terrainHeight: () => 0, isRunway: () => true };
const controls = (overrides = {}) => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false, ...overrides });
const state = (config = {}) => resetFlight(createFlightState(), { position: [0, 1000, 0], speed: 220, ...config });

test('a runway start accelerates, rotates and climbs under player input', () => {
  const runway = {
    terrainHeight: () => 0,
    isRunway: (x, z) => Math.abs(x + 6000) < 70 && z > 5000 && z < 11000,
  };
  const jet = state({ position: [-6000, FLIGHT.groundClearance, 10000], speed: 0, throttle: 0, gear: true, grounded: true });
  let rotated = false;
  for (let frame = 0; frame < 900; frame++) {
    assert.equal(updateFlight(jet, controls({ throttle: 1, pitch: 1 }), DT, runway), null);
    if (!jet.grounded) {
      rotated = true;
      assert.ok(jet.speed > FLIGHT.takeoffSpeed, 'rotation requires sufficient runway speed');
      break;
    }
    assert.equal(jet.position.y, FLIGHT.groundClearance, 'the aircraft stays on its wheels during the ground roll');
  }
  assert.ok(rotated, 'holding throttle and pitch must produce a takeoff');
  for (let frame = 0; frame < 120; frame++) updateFlight(jet, controls({ throttle: 1, pitch: .5 }), DT, runway);
  assert.ok(jet.position.y > 30, 'positive pitch produces useful climb after rotation');
  assert.ok(jet.verticalSpeed > 0);
  assert.equal(jet.grounded, false);
});

test('right and left bank steer in the corresponding world direction', () => {
  const right = state(), left = state();
  for (let frame = 0; frame < 90; frame++) {
    updateFlight(right, controls({ roll: 1 }), DT, levelWorld);
    updateFlight(left, controls({ roll: -1 }), DT, levelWorld);
  }
  assert.ok(right.roll < -.8 && left.roll > .8, 'visual bank follows the requested turn');
  assert.ok(right.heading > 0 && left.heading < 0);
  assert.ok(right.position.x > 20 && left.position.x < -20);
  assert.ok(Math.abs(right.position.x + left.position.x) < 1e-8, 'opposite inputs give symmetric turns');
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(right.quaternion);
  assert.ok(forward.x > 0, 'the rendered nose agrees with the flight direction');
  assert.ok(forward.dot(right.velocity.clone().normalize()) > .999);
});

test('sustained afterburner and throttle commands respect speed and throttle limits', () => {
  const jet = state({ position: [0, 20000, 0], throttle: .8 });
  for (let frame = 0; frame < 1800; frame++) {
    updateFlight(jet, controls({ throttle: 1, boost: true }), DT, levelWorld);
    assert.ok(jet.speed >= 0 && jet.speed <= FLIGHT.maximumSpeed);
    assert.ok(jet.throttle >= 0 && jet.throttle <= 1);
  }
  assert.equal(jet.throttle, 1);
  assert.equal(jet.afterburner, true);
  assert.ok(jet.speed > FLIGHT.maximumSpeed - 1, 'afterburner approaches the advertised maximum speed');
  const boostedSpeed = jet.speed;
  for (let frame = 0; frame < 600; frame++) updateFlight(jet, controls({ throttle: -1 }), DT, levelWorld);
  assert.equal(jet.throttle, 0);
  assert.equal(jet.afterburner, false);
  assert.ok(jet.speed < boostedSpeed * .3, 'reducing throttle slows the aircraft');
  assert.ok(jet.speed >= 0);
});

function flyWithRenderSchedule(frameTimes) {
  const jet = state({ position: [0, 4000, 0], throttle: .6 });
  let accumulator = 0, frame = 0, steps = 0;
  while (steps < 600) {
    accumulator += frameTimes[frame++ % frameTimes.length];
    while (accumulator + 1e-12 >= DT && steps < 600) {
      const command = steps < 120 ? controls({ throttle: 1, pitch: .2 })
        : steps < 300 ? controls({ roll: .8, pitch: .15, boost: true })
          : steps < 420 ? controls({ roll: -.4, pitch: -.1 }) : controls();
      assert.equal(updateFlight(jet, command, DT, levelWorld), null);
      accumulator -= DT;
      steps++;
    }
  }
  return {
    position: jet.position.toArray(), previous: jet.previous.toArray(), velocity: jet.velocity.toArray(),
    quaternion: jet.quaternion.toArray(), heading: jet.heading, pitch: jet.pitch, roll: jet.roll,
    speed: jet.speed, throttle: jet.throttle, verticalSpeed: jet.verticalSpeed,
  };
}

test('fixed simulation steps give the same flight at different render cadences', () => {
  const at30Hz = flyWithRenderSchedule([1 / 30]);
  const at144Hz = flyWithRenderSchedule([1 / 144]);
  const unevenFrames = flyWithRenderSchedule([1 / 120, 1 / 48, 1 / 90, 1 / 30]);
  assert.deepEqual(at30Hz, at144Hz);
  assert.deepEqual(at30Hz, unevenFrames);
  assert.ok(at30Hz.position.every(Number.isFinite));
});

function contact(config, command = {}) {
  // A flat runway away from the airbase approach-assistance corridor tests
  // the touchdown criteria without automatic sink-rate correction.
  const jet = state({ position: [0, FLIGHT.groundClearance + .05, 0], speed: 90, throttle: .3, pitch: -.07, gear: true, ...config });
  const result = updateFlight(jet, controls({ pitch: -.085, ...command }), DT, levelWorld);
  return { jet, result };
}

test('a gentle gear-down runway approach produces a stable touchdown', () => {
  const { jet, result } = contact();
  assert.equal(result, 'touchdown');
  assert.equal(jet.grounded, true);
  assert.equal(jet.position.y, FLIGHT.groundClearance);
  assert.equal(jet.verticalSpeed, 0);
  assert.equal(jet.pitch, 0);
  assert.equal(jet.roll, 0);
  assert.equal(updateFlight(jet, controls({ throttle: -1 }), DT, levelWorld), null);
  assert.equal(jet.grounded, true, 'the next frame remains on the runway');
});

test('a hard landing crashes even with gear down and acceptable airspeed', () => {
  const { jet, result } = contact({ pitch: -.27 }, { pitch: -.33 });
  assert.ok(jet.verticalSpeed < -15, 'the impact has a dangerous descent rate');
  assert.ok(jet.speed < 115, 'overspeed is not responsible for this failure');
  assert.equal(result, 'crash');
  assert.equal(jet.grounded, false);
});

test('landing with retracted gear or excessive speed fails', () => {
  assert.equal(contact({ gear: false }).result, 'crash');
  assert.equal(contact({ speed: 145 }).result, 'crash');
});

test('segment-sphere gate detection catches a gate crossed between frames', () => {
  const gate = new THREE.Vector3(0, 100, 0);
  const before = new THREE.Vector3(0, 100, 120), after = new THREE.Vector3(0, 100, -120);
  assert.ok(before.distanceTo(gate) > 20 && after.distanceTo(gate) > 20);
  assert.equal(segmentSphere(before, after, gate, 20), true, 'a fast jet cannot skip a gate between samples');
  assert.equal(segmentSphere(new THREE.Vector3(21, 100, 120), new THREE.Vector3(21, 100, -120), gate, 20), false);
  assert.equal(segmentSphere(new THREE.Vector3(20, 100, 120), new THREE.Vector3(20, 100, -120), gate, 20), true, 'a tangent touches the gate boundary');
  assert.equal(segmentSphere(before, before, gate, 20), false, 'a stationary distant jet does not collect the gate');
  assert.equal(segmentSphere(gate, gate, gate, 20), true);
});
