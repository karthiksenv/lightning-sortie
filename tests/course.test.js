import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld } from '../src/world.js';
import { Missions } from '../src/missions.js';
import { createFlightState, resetFlight, updateFlight } from '../src/flight.js';

// Rendered primitives and production collision data are used; only canvas drawing
// is stubbed because these integration checks do not require a WebGL context.
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, clearRect() {}, fillText() {} }) }) };
const scene = new THREE.Scene();
const world = createWorld(scene);
const DT = 1 / 60;
const neutral = { pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false, gun: false };
after(() => world.dispose());

function setup(t, id) {
  const events = [];
  const missions = new Missions(scene, { tracer() {}, trail() {}, burst() {} }, { cue() {} }, (name, payload) => events.push({ name, payload }));
  const definition = missions.start(id);
  t.after(() => {
    missions.clear(); missions.gateGeometry.dispose(); missions.missileGeometry.dispose(); missions.missileMaterial.dispose(); scene.remove(missions.group);
  });
  return { missions, flight: resetFlight(createFlightState(), definition.spawn), events };
}

test('landing from the actual stage spawn accepts keyboard descent and braking on the actual runway', t => {
  const { missions, flight, events } = setup(t, 'landing');
  let contact = null;
  for (let frame = 0; frame < 60 * 100 && !missions.done; frame++) {
    const command = flight.grounded ? { ...neutral, throttle: -1 } : { ...neutral, pitch: -1 };
    const event = updateFlight(flight, command, DT, world);
    assert.ok(event === null || event === 'touchdown', `unexpected ${event} at ${flight.position.toArray()}`);
    if (event === 'touchdown') {
      contact = { time: frame * DT, z: flight.position.z, speed: flight.speed };
      assert.equal(world.isRunway(flight.position.x, flight.position.z), true);
      missions.landed();
    }
    if (!flight.grounded) assert.equal(world.collides(flight.position, 3.2), false, 'the approach path clears the world geometry');
    missions.update(DT, flight, command);
  }
  assert.ok(contact, 'the stock keyboard approach reaches the runway');
  assert.equal(missions.done, true);
  assert.equal(flight.grounded, true);
  assert.ok(flight.speed < 33);
  assert.equal(events.filter(event => event.name === 'complete' && event.payload.success).length, 1);
  t.diagnostic(`Touchdown: ${contact.time.toFixed(2)} s, Z ${contact.z.toFixed(1)}, ${(contact.speed * 1.94384).toFixed(1)} KT. Complete: ${missions.time.toFixed(2)} s, Z ${flight.position.z.toFixed(1)}.`);
});

test('all strike installations have clear footprints and lock points in the actual farm region', t => {
  const { missions } = setup(t, 'strike');
  const infrastructure = scene.getObjectByName('Infrastructure — hangars, port, bridges and roofs');
  const unitBox = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5));
  const matrix = new THREE.Matrix4(), occupied = new THREE.Box3(), footprint = new THREE.Box3();
  for (const target of missions.targets) {
    // The widest part of each installation is its 95 x 85 m concrete platform.
    footprint.min.set(target.position.x - 47.5, 0, target.position.z - 42.5);
    footprint.max.set(target.position.x + 47.5, 54, target.position.z + 42.5);
    for (let i = 0; i < infrastructure.count; i++) {
      infrastructure.getMatrixAt(i, matrix);
      occupied.copy(unitBox).applyMatrix4(matrix);
      assert.equal(footprint.intersectsBox(occupied), false, `${target.name} at ${target.position.toArray()} overlaps infrastructure instance ${i}`);
    }
    assert.equal(world.collides(target.position, 6), false, 'the lock point is not inside world geometry');
    assert.ok(Math.abs(world.terrainHeight(target.position.x, target.position.z)) < 1, 'target bases sit on flat land');
  }
});
