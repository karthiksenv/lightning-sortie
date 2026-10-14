import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld } from '../src/world.js';

// Canvas pixels are a browser concern; generation and collision run without WebGL.
globalThis.document = {
  createElement() {
    return { width: 0, height: 0, getContext: () => ({ fillRect() {}, clearRect() {}, fillText() {} }) };
  },
};
const scene = new THREE.Scene();
const world = createWorld(scene);
scene.updateMatrixWorld(true);

test('procedural world creates dense instanced city and a 64 km map', () => {
  assert.equal(world.stats.mapSize, 64000);
  assert.ok(world.stats.buildings > 5000);
  assert.ok(world.stats.districts < 50);
  assert.equal(world.stats.traffic, 190);
});

test('terrain collision follows rendered triangles and the visible ocean surface', () => {
  const terrain = scene.getObjectByName('Coastal terrain');
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const coordinates = [[-22134.5,-7152.4],[-26713.5,18457.3],[9500,2300],[25000,8000],[-6800,11432.2]];
  for (const [x,z] of coordinates) {
    ray.set(new THREE.Vector3(x,5000,z),down);
    const hits=ray.intersectObject(terrain);
    assert.ok(hits.length>0);
    assert.ok(Math.abs(world.terrainHeight(x,z)-Math.max(-12,hits[0].point.y))<0.01);
  }
  assert.equal(world.terrainHeight(25000,8000),-12);
});

test('runway surface and safe landing bounds match the rendered main runway', () => {
  assert.ok(world.isRunway(-6000,9000));
  assert.ok(world.isRunway(-5946,9499));
  assert.equal(world.isRunway(-5944,9000),false);
  assert.equal(world.isRunway(-6000,9501),false);
  assert.equal(world.terrainHeight(-6000,9000),1.2);
  assert.equal(world.collides(new THREE.Vector3(-6000,4.2,9000),6),false);
});

test('building collision detects occupied volume without reporting the empty sky', () => {
  const district = scene.getObjectByName('City district 0,0');
  const matrix = new THREE.Matrix4(); district.getMatrixAt(0,matrix);
  const position = new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.equal(world.collides(position,0),true);
  assert.equal(world.collides(new THREE.Vector3(position.x,2000,position.z),6),false);
});

test('traffic matrices and night state update without non-finite transforms', () => {
  world.update(1/60,300,new THREE.Vector3(),1);
  const traffic = scene.getObjectByName('Moving road traffic');
  assert.ok(traffic.instanceMatrix.array.every(Number.isFinite));
  assert.equal(scene.getObjectByName('Sodium street lamps').visible,true);
});
