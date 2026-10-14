import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Aircraft space is metres, with the nose on -Z. The centre of the fuselage is
// the flight-physics origin; fully extended tyres touch the ground at y=-2.6.
function solidPolygon(points, thickness = 0.12) {
  const vertices = [];
  const half = thickness / 2;
  const faces = THREE.ShapeUtils.triangulateShape(points.map(p => new THREE.Vector2(p[0], p[2])), []);
  const triangle = (a, b, c) => vertices.push(...a, ...b, ...c);
  const up = p => [p[0], p[1] + half, p[2]];
  const down = p => [p[0], p[1] - half, p[2]];
  for (const [a, b, c] of faces) {
    triangle(up(points[c]), up(points[b]), up(points[a]));
    triangle(down(points[a]), down(points[b]), down(points[c]));
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    triangle(up(a), up(b), down(b));
    triangle(up(a), down(b), down(a));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function ringBody(rings, crossSection) {
  const positions = [];
  const ringPoints = rings.map(([z, width, bottom, top]) => crossSection.map(([x, y]) =>
    [x * width, bottom + (top - bottom) * y, z]));
  const triangle = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < crossSection.length; i++) {
      const k = (i + 1) % crossSection.length;
      triangle(ringPoints[j][i], ringPoints[j + 1][i], ringPoints[j + 1][k]);
      triangle(ringPoints[j][i], ringPoints[j + 1][k], ringPoints[j][k]);
    }
  }
  for (const j of [0, rings.length - 1]) {
    const center = [0, (rings[j][2] + rings[j][3]) / 2, rings[j][0]];
    for (let i = 0; i < crossSection.length; i++) {
      const next = (i + 1) % crossSection.length;
      if (j === 0) triangle(center, ringPoints[j][i], ringPoints[j][next]);
      else triangle(center, ringPoints[j][next], ringPoints[j][i]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function finGeometry(side) {
  const points = [[1.0, 0.52, 3.65], [1.94, 3.03, 5.1], [2.05, 3.03, 6.35], [1.13, 0.6, 7.2]];
  const positions = [];
  const front = points.map(p => [side * (p[0] + 0.065), p[1], p[2]]);
  const back = points.map(p => [side * (p[0] - 0.065), p[1], p[2]]);
  const triangle = (a, b, c) => positions.push(...a, ...b, ...c);
  triangle(front[0], front[1], front[2]); triangle(front[0], front[2], front[3]);
  triangle(back[2], back[1], back[0]); triangle(back[3], back[2], back[0]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    triangle(front[i], back[i], back[j]); triangle(front[i], back[j], front[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createJet({ enemy = false } = {}) {
  const jet = new THREE.Group();
  jet.name = enemy ? 'F-35 adversary' : 'F-35A Lightning II';
  const paint = new THREE.MeshStandardMaterial({ color: enemy ? 0x69737a : 0x929fa9, roughness: 0.57, metalness: 0.37, flatShading: true, side: THREE.DoubleSide });
  const panels = new THREE.MeshStandardMaterial({ color: enemy ? 0x4f5960 : 0x788791, roughness: 0.64, metalness: 0.35, side: THREE.DoubleSide });
  const belly = new THREE.MeshStandardMaterial({ color: 0x66737c, roughness: 0.75, metalness: 0.22 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x121b21, roughness: 0.56, metalness: 0.3, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: 0xa7b3ba, metalness: 0.8, roughness: 0.32 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x12161a, roughness: 0.93 });
  const stencil = new THREE.MeshStandardMaterial({ color: enemy ? 0xce776a : 0xc9d2d6, roughness: 0.8, side: THREE.DoubleSide });
  const add = (geometry, material, x = 0, y = 0, z = 0, parent = jet) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (sx, sy, sz, material, x, y, z, parent) => add(new THREE.BoxGeometry(sx, sy, sz), material, x, y, z, parent);

  // Eight-sided sections retain the F-35's wide shoulder chines and a deep
  // single-engine fuselage instead of looking like an extruded paper plane.
  const section = [[0, 1], [.74, .91], [1, .59], [.84, .15], [0, 0], [-.84, .15], [-1, .59], [-.74, .91]];
  add(ringBody([
    [-8, .025, -.02, .06], [-6.9, .34, -.25, .36], [-5.1, .78, -.52, .67],
    [-3.0, 1.12, -.78, .91], [-1, 1.43, -.9, 1.02], [2.7, 1.28, -.89, .92],
    [5.2, 1.03, -.67, .73], [6.75, .77, -.54, .63],
  ], section), paint);

  // Nose radome boundary and chin electro-optical aperture.
  add(ringBody([[-8.02, .022, -.02, .06], [-6.9, .34, -.25, .36], [-5.38, .71, -.48, .62]], section), panels);
  const sensor = add(new THREE.OctahedronGeometry(.26, 0), dark, 0, -.56, -5.15);
  sensor.scale.set(.8, .48, 1.8);

  for (const s of [-1, 1]) {
    // Main trapezoidal wings, forward chines and swept tailplanes.
    add(solidPolygon([[s * 1.0, .05, -1.25], [s * 5.35, .01, 2.0], [s * 5.35, -.02, 3.23], [s * 1.0, .03, 4.48]], .14), paint);
    add(solidPolygon([[s * .85, .32, -4.45], [s * 1.8, .13, -.9], [s * 2.25, .08, .04], [s * 1.0, .18, .45]], .1), panels);
    add(solidPolygon([[s * 1.0, .24, 4.38], [s * 3.55, .05, 6.06], [s * 3.55, .02, 7.17], [s * 1.05, .15, 7.27]], .1), paint);
    // Control surfaces have a visible, darker hinge rather than an outline.
    add(solidPolygon([[s * 1.6, .12, 3.85], [s * 4.84, .1, 2.96], [s * 4.84, .08, 3.27], [s * 1.6, .11, 4.23]], .025), panels);
    add(finGeometry(s), paint);

    // Diverterless intake trunks under the shoulder, with dark inlet faces.
    const intake = add(ringBody([[-3.05, .38, -.55, .28], [-2.74, .51, -.67, .35], [-.45, .48, -.72, .26]], section), panels, s * 1.01, 0, 0);
    intake.rotation.y = s * .035;
    const mouth = add(new THREE.PlaneGeometry(.66, .69), dark, s * 1.065, -.13, -3.07);
    mouth.rotation.y = Math.PI + s * .17;
    mouth.rotation.z = s * .17;
    box(.055, .69, .09, paint, s * 1.41, -.11, -2.95);

    // Flush weapons-bay doors, wingtip navigation lights and a low-vis roundel.
    box(.58, .035, 3.2, belly, s * .55, -.867, .8);
    const navMaterial = new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff4a4a : 0x83ffd0, toneMapped: false });
    add(new THREE.SphereGeometry(.092, 6, 4), navMaterial, s * 5.33, .07, 2.92).castShadow = false;
    const star = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .105 : .24;
      star.push([s * 3.14 + Math.cos(a) * r, .128, 2.58 + Math.sin(a) * r]);
    }
    add(solidPolygon(star, .009), stencil);
    box(.21, .015, .085, stencil, s * 3.49, .13, 2.58);
    box(.21, .015, .085, stencil, s * 2.79, .13, 2.58);
  }

  // Gold-coated bubble canopy, fitted over a broad angular cockpit sill.
  add(ringBody([[-5.08, .12, .53, .63], [-4.05, .57, .63, .82], [-2.44, .66, .82, 1.02], [-1.22, .49, .88, 1.02], [-.83, .17, .9, .97]], section), dark);
  const canopy = new THREE.MeshPhysicalMaterial({ color: 0x745f39, metalness: .68, roughness: .16, clearcoat: 1, clearcoatRoughness: .08, side: THREE.DoubleSide });
  add(ringBody([[-4.91, .09, .62, .66], [-3.99, .52, .74, 1.4], [-2.46, .60, .93, 1.64], [-1.36, .44, .98, 1.23]], section), canopy);
  // A narrow hoop and front windscreen make the canopy read at chase distance.
  const hoop = add(new THREE.TorusGeometry(.59, .038, 5, 16, Math.PI), panels, 0, .97, -2.39);
  hoop.scale.y = 1.14;
  hoop.rotation.z = 0;
  box(.07, .07, 1.55, panels, 0, 1.46, -3.3).rotation.x = -.13;

  // Single F135 nozzle: dark throat, segmented metallic rim, two flame cores.
  const nozzle = add(new THREE.CylinderGeometry(.68, .78, .82, 18, 1, true), steel, 0, .03, 7.04);
  nozzle.rotation.x = Math.PI / 2;
  const throat = add(new THREE.CircleGeometry(.64, 20), dark, 0, .03, 7.44);
  throat.material = dark;
  add(new THREE.TorusGeometry(.68, .048, 5, 20), panels, 0, .03, 7.46);
  const emberMaterial = new THREE.MeshBasicMaterial({ color: 0xff6f22, transparent: true, opacity: .68, toneMapped: false, side: THREE.DoubleSide });
  add(new THREE.CircleGeometry(.51, 20), emberMaterial, 0, .03, 7.47).castShadow = false;
  const flame = new THREE.Group();
  flame.position.set(0, .03, 7.5);
  jet.add(flame);
  const flameMaterials = [];
  for (const [radius, length, color, opacity] of [[.60, 4.8, 0xff702b, .34], [.39, 3.45, 0xffc65c, .62], [.22, 2.1, 0xeaf6ff, .85]]) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    flameMaterials.push(material);
    const mesh = add(new THREE.ConeGeometry(radius, length, 12, 1, true), material, 0, 0, length / 2, flame);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  const gearPivots = [];
  if (!enemy) {
    const wheel = (parent, radius, x, y, z) => {
      const tyre = add(new THREE.CylinderGeometry(radius, radius, .23, 12), rubber, x, y, z, parent);
      tyre.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        const hub = add(new THREE.CylinderGeometry(radius * .48, radius * .48, .012, 8), steel, x + side * .123, y, z, parent);
        hub.rotation.z = Math.PI / 2;
      }
    };
    for (const [x, z, isFront] of [[0, -3.85, true], [-1.05, 2.08, false], [1.05, 2.08, false]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, -.57, z);
      jet.add(pivot);
      const strut = add(new THREE.CylinderGeometry(.062, .082, 1.46, 7), steel, 0, -.7, 0, pivot);
      strut.rotation.x = isFront ? -.09 : .13;
      const brace = add(new THREE.CylinderGeometry(.038, .038, 1.04, 6), steel, 0, -.63, .28, pivot);
      brace.rotation.x = -.55;
      box(.22, .22, .32, belly, 0, -1.42, 0, pivot);
      if (isFront) {
        wheel(pivot, .30, -.18, -1.73, .1);
        wheel(pivot, .30, .18, -1.73, .1);
      } else {
        wheel(pivot, .40, Math.sign(x) * .17, -1.63, .1);
        box(.055, 1.1, .54, paint, Math.sign(x) * .23, -.53, .02, pivot);
      }
      gearPivots.push(pivot);
    }
    // Small dorsal aerials and a dark gun fairing over the port intake.
    const aerial = add(new THREE.ConeGeometry(.15, .43, 3), panels, 0, 1.15, 1.88);
    aerial.scale.z = 2.1;
    box(.22, .11, 1.68, panels, -.94, .7, -1.65);
    box(.1, .07, .18, dark, -.94, .77, -2.51);
  }

  const strobeMaterial = new THREE.MeshBasicMaterial({ color: 0xc9ebff, toneMapped: false });
  const strobe = add(new THREE.SphereGeometry(.095, 6, 4), strobeMaterial, 0, 1.04, 3.0);
  strobe.castShadow = false;
  // Fuse fixed parts by material: a detailed adversary still needs only about
  // a dozen draws, so adding a dogfight does not multiply dozens of panels.
  const batches = new Map();
  for (const child of jet.children) {
    if (!child.isMesh || child === strobe) continue;
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(child);
  }
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const pieces = meshes.map(mesh => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const key of Object.keys(geometry.attributes)) {
        if (key !== 'position' && key !== 'normal') geometry.deleteAttribute(key);
      }
      geometry.applyMatrix4(mesh.matrix);
      return geometry;
    });
    const combined = mergeGeometries(pieces, false);
    pieces.forEach(piece => piece.dispose());
    if (!combined) continue;
    for (const mesh of meshes) { jet.remove(mesh); mesh.geometry.dispose(); }
    add(combined, material);
  }
  let extension = enemy ? 0 : 1;
  jet.userData.gearExtension = extension;
  jet.userData.update = (dt = 0.016, { throttle = .6, afterburner = false, gear = false, time = 0 } = {}) => {
    const target = typeof gear === 'number' ? THREE.MathUtils.clamp(gear, 0, 1) : gear ? 1 : 0;
    extension = THREE.MathUtils.damp(extension, target, 6, Math.max(0, dt));
    jet.userData.gearExtension = extension;
    for (const pivot of gearPivots) {
      pivot.visible = extension > .025;
      pivot.scale.y = Math.max(.015, extension);
      pivot.rotation.x = (1 - extension) * 1.15;
      pivot.position.y = -.57 + (1 - extension) * .44;
    }
    const power = THREE.MathUtils.clamp(throttle, 0, 1);
    const shimmer = 1 + Math.sin(time * 81) * .035 + Math.sin(time * 113) * .025;
    flame.visible = power > .15;
    flame.scale.set(.67 + power * .32, .67 + power * .32, (afterburner ? 1 : .14 + power * .17) * shimmer);
    emberMaterial.opacity = .25 + power * .7;
    for (let i = 0; i < flameMaterials.length; i++) flameMaterials[i].opacity = (.23 + i * .22) * (afterburner ? 1 : .63);
    strobe.visible = time % 1.6 < .055 || (time + .14) % 1.6 < .055;
  };
  jet.userData.dispose = () => {
    const geometries = new Set(), materials = new Set();
    jet.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  };
  return jet;
}
