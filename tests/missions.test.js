import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Missions } from '../src/missions.js';
import { createFlightState, resetFlight, updateFlight } from '../src/flight.js';

const DT = 1 / 60;
const quiet = { gun: false, pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false };
const nose = new THREE.Vector3(0, 0, -1);

function harness(t, id) {
  const scene = new THREE.Scene();
  const events = [], sounds = [], particles = { bursts: 0, trails: 0, tracers: 0 };
  const effects = {
    burst() { particles.bursts++; },
    trail() { particles.trails++; },
    tracer() { particles.tracers++; },
  };
  const missions = new Missions(scene, effects, { cue(name) { sounds.push(name); } }, (name, payload) => events.push({ name, payload }));
  const definition = missions.start(id);
  const flight = resetFlight(createFlightState(), definition.spawn);
  t.after(() => {
    missions.clear();
    missions.gateGeometry.dispose();
    missions.missileGeometry.dispose();
    missions.missileMaterial.dispose();
    scene.remove(missions.group);
  });
  return { scene, missions, flight, events, sounds, particles };
}

function aimAt(flight, target, offset = new THREE.Vector3(0, 120, 1000)) {
  flight.position.copy(target.position).add(offset);
  flight.previous.copy(flight.position);
  flight.quaternion.setFromUnitVectors(nose, target.position.clone().sub(flight.position).normalize());
}

function assertCompleteOnce(missions, flight, events) {
  assert.equal(missions.done, true);
  assert.equal(missions.progress, 1);
  const result = events.filter(event => event.name === 'complete');
  assert.equal(result.length, 1);
  assert.equal(result[0].payload.success, true);
  assert.equal(result[0].payload.score, missions.score);
  assert.match(result[0].payload.grade, /^[SABC]$/);
  const score = missions.score;
  missions.update(10, flight, quiet);
  missions.complete(flight);
  assert.equal(missions.score, score, 'a completed sortie cannot award its bonus twice');
  assert.equal(events.filter(event => event.name === 'complete').length, 1);
}

for (const [id, count] of [['takeoff', 2], ['waypoints', 7], ['skill', 8]]) {
  test(`${id}: clearing every ordered gate scores and completes the mission`, t => {
    const { missions, flight, events, sounds } = harness(t, id);
    assert.equal(missions.gates.length, count);
    for (let i = 0; i < count; i++) {
      const gate = missions.gates[i];
      assert.equal(missions.getGuide().position, gate.position);
      // A swept segment enters the gate from outside and ends in its centre.
      flight.previous.copy(gate.position).add(new THREE.Vector3(0, 0, gate.radius * 3));
      flight.position.copy(gate.position);
      missions.update(DT, flight, quiet);
      assert.equal(missions.gateIndex, i + 1);
      assert.equal(gate.mesh.visible, false);
      assert.equal(missions.progress, (i + 1) / count);
      if (i < count - 1) {
        assert.equal(missions.score, (i + 1) * 1000, 'a centre hit earns the full gate accuracy bonus');
        assert.equal(missions.done, false);
        assert.ok(missions.gates[i + 1].mesh.material.opacity > .9, 'the next gate becomes prominent');
      }
    }
    assert.equal(sounds.filter(sound => sound === 'gate').length, count);
    assert.equal(missions.score, count * 1000 + missions.timeBonus + 1000);
    assertCompleteOnce(missions, flight, events);
  });
}

for (const [id, count] of [['dogfight', 3], ['strike', 5]]) {
  test(`${id}: cannon fire destroys all ${count} targets and awards a complete sortie`, t => {
    const { missions, flight, events, sounds, particles } = harness(t, id);
    assert.equal(missions.targets.length, count);
    for (let frame = 0; frame < 600 && !missions.done; frame++) {
      const target = missions.targets.find(candidate => candidate.alive);
      assert.ok(target);
      aimAt(flight, target);
      missions.update(DT, flight, { ...quiet, gun: true });
      assert.equal(missions.progress, missions.kills / count);
    }
    assert.equal(missions.kills, count);
    assert.ok(missions.targets.every(target => !target.alive && !target.mesh.visible));
    assert.equal(particles.bursts, count);
    assert.ok(particles.tracers > 0, 'cannon fire produces visible tracers');
    assert.equal(sounds.filter(sound => sound === 'explosion').length, count);
    assert.ok(sounds.includes('gun'));
    assert.equal(missions.score, count * 1500 + missions.timeBonus + Math.round(flight.health * 10));
    assertCompleteOnce(missions, flight, events);
  });
}

test('a locked missile consumes one round and destroys its target only after travelling', t => {
  const { missions, flight, particles, sounds } = harness(t, 'strike');
  const target = missions.targets[0];
  aimAt(flight, target, new THREE.Vector3(0, 200, 2000));
  for (let frame = 0; frame < 50; frame++) missions.update(DT, flight, quiet);
  assert.equal(missions.lockTarget, target);
  assert.equal(missions.lockTime, 1);
  assert.equal(missions.getGuide().locked, true);
  const health = target.health;
  missions.fireMissile(flight);
  assert.equal(missions.missiles, 11);
  assert.equal(missions.projectiles.length, 1);
  assert.equal(target.health, health, 'launch does not apply instant damage');
  const missile = missions.projectiles[0].mesh;
  assert.equal(missile.parent, missions.group);
  missions.fireMissile(flight);
  assert.equal(missions.missiles, 11, 'the cooldown prevents a duplicate launch');
  for (let frame = 0; frame < 30; frame++) missions.update(DT, flight, quiet);
  assert.equal(target.alive, true, 'a target two kilometres away survives the first half second');
  assert.equal(missions.projectiles.length, 1);
  for (let frame = 0; frame < 300 && missions.projectiles.length; frame++) missions.update(DT, flight, quiet);
  assert.equal(target.alive, false);
  assert.equal(missions.kills, 1);
  assert.equal(missions.projectiles.length, 0);
  assert.equal(missile.parent, null, 'the spent projectile leaves the scene');
  assert.equal(missions.missiles, 11);
  assert.equal(particles.bursts, 1);
  assert.ok(particles.trails > 30);
  assert.equal(sounds.filter(sound => sound === 'missile').length, 1);
  assert.equal(missions.done, false, 'remaining strike targets still need to be destroyed');
});

test('firing without a complete lock is refused without consuming ammunition', t => {
  const { missions, flight, events, sounds } = harness(t, 'strike');
  missions.fireMissile(flight);
  assert.equal(missions.missiles, 12);
  assert.equal(missions.projectiles.length, 0);
  assert.match(events.at(-1).payload, /LOCK/);
  aimAt(flight, missions.targets[0]);
  missions.update(.1, flight, quiet);
  assert.ok(missions.lockTime > 0 && missions.lockTime < 1);
  missions.fireMissile(flight);
  assert.equal(missions.missiles, 12);
  assert.equal(missions.projectiles.length, 0);
  assert.equal(sounds.includes('missile'), false);
});

test('landing qualification requires a real touchdown followed by braking', t => {
  const { missions, flight, events } = harness(t, 'landing');
  const runway = { terrainHeight: () => 0, isRunway: () => true };
  flight.position.set(-6000, 3.05, 9000);
  flight.previous.copy(flight.position);
  flight.pitch = -.07;
  flight.speed = 90;
  const contact = updateFlight(flight, { ...quiet, pitch: -.085 }, DT, runway);
  assert.equal(contact, 'touchdown');
  missions.landed();
  missions.update(DT, flight, quiet);
  assert.equal(missions.touchdown, true);
  assert.equal(missions.done, false, 'touching down at approach speed does not finish the rollout');
  assert.match(missions.objective, /brake/);
  for (let frame = 0; frame < 900 && !missions.done; frame++) {
    assert.equal(updateFlight(flight, { ...quiet, throttle: -1 }, DT, runway), null);
    missions.update(DT, flight, quiet);
  }
  assert.equal(flight.grounded, true);
  assert.ok(flight.speed < 33, 'rollout finishes below approximately 65 knots');
  assert.equal(missions.score, 2500 + missions.timeBonus + 1000);
  assertCompleteOnce(missions, flight, events);
});

function watchResources(group, shared) {
  const resources = new Map();
  group.traverse(object => {
    if (!object.isMesh) return;
    for (const resource of [object.geometry, ...(Array.isArray(object.material) ? object.material : [object.material])]) {
      if (!resource || shared.has(resource) || resources.has(resource)) continue;
      resources.set(resource, 0);
      resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
    }
  });
  return resources;
}

test('clear and repeated mission restarts remove entities and dispose owned GPU resources', t => {
  const { missions, scene, flight } = harness(t, 'strike');
  const shared = new Set([missions.gateGeometry, missions.missileGeometry, missions.missileMaterial]);
  let sharedDisposals = 0;
  for (const resource of shared) resource.addEventListener('dispose', () => sharedDisposals++);
  aimAt(flight, missions.targets[0]);
  for (let frame = 0; frame < 50; frame++) missions.update(DT, flight, quiet);
  missions.fireMissile(flight);
  assert.equal(missions.projectiles.length, 1);

  for (const nextMission of ['dogfight', 'waypoints', 'strike', 'dogfight', 'skill', 'strike']) {
    const oldChildren = [...missions.group.children];
    const resources = watchResources(missions.group, shared);
    assert.ok(resources.size > 0);
    missions.start(nextMission);
    assert.ok(oldChildren.every(child => child.parent === null));
    assert.ok([...resources.values()].every(count => count >= 1), 'every geometry and material owned by the previous sortie is disposed');
    assert.equal(scene.children.length, 1, 'restarting reuses the single mission scene group');
    assert.equal(missions.projectiles.length, 0);
    assert.equal(missions.score, 0);
    assert.equal(missions.kills, 0);
    assert.equal(missions.missiles, 12);
    assert.equal(missions.lockTarget, null);
    assert.equal(missions.done, false);
    assert.ok(missions.group.children.length <= 8, 'old targets and gates do not accumulate');
  }
  const resources = watchResources(missions.group, shared);
  missions.clear();
  assert.equal(missions.group.children.length, 0);
  assert.equal(missions.targets.length, 0);
  assert.equal(missions.gates.length, 0);
  assert.equal(missions.projectiles.length, 0);
  assert.equal(missions.lockTarget, null);
  assert.ok([...resources.values()].every(count => count >= 1));
  assert.equal(sharedDisposals, 0, 'shared gate and missile resources survive for the next sortie');
});
