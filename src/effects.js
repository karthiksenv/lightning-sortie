import * as THREE from 'three';

// A fixed allocation and one draw call for every exhaust puff, impact and
// tracer. Reusing expired slots also bounds the cost of prolonged combat.
const CAPACITY = 1600;
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.cursor = 0;
    this.position = new Float32Array(CAPACITY * 3);
    this.velocity = new Float32Array(CAPACITY * 3);
    this.colors = new Float32Array(CAPACITY * 3);
    this.sizes = new Float32Array(CAPACITY);
    this.opacity = new Float32Array(CAPACITY);
    this.life = new Float32Array(CAPACITY);
    this.duration = new Float32Array(CAPACITY);
    this.gravity = new Float32Array(CAPACITY);
    this.baseSize = new Float32Array(CAPACITY);
    this.color = new THREE.Color();
    this.geometry = new THREE.BufferGeometry();
    for (const [name, array, width] of [['position', this.position, 3], ['color', this.colors, 3], ['size', this.sizes, 1], ['alpha', this.opacity, 1]]) {
      this.geometry.setAttribute(name, new THREE.BufferAttribute(array, width).setUsage(THREE.DynamicDrawUsage));
    }
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexShader: `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = clamp(size * 420.0 / max(1.0, -viewPosition.z), 1.0, 110.0);
          vAlpha = alpha;
          vColor = color;
        }`,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float glow = exp(-radius * radius * 4.5) * (1.0 - smoothstep(0.65, 1.0, radius));
          float a = vAlpha * glow;
          if (a < 0.008) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'Pooled exhaust and combat particles';
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.disposed = false;
  }

  emit(x, y, z, vx, vy, vz, color, size, duration, gravity = 0) {
    if (this.disposed) return;
    const i = this.cursor++ % CAPACITY, p = i * 3;
    this.position[p] = x; this.position[p + 1] = y; this.position[p + 2] = z;
    this.velocity[p] = vx; this.velocity[p + 1] = vy; this.velocity[p + 2] = vz;
    this.color.set(color);
    this.colors[p] = this.color.r; this.colors[p + 1] = this.color.g; this.colors[p + 2] = this.color.b;
    this.baseSize[i] = this.sizes[i] = size;
    this.duration[i] = this.life[i] = duration;
    this.gravity[i] = gravity;
    this.opacity[i] = 1;
  }

  burst(position, color = 0xff8844, count = 40) {
    if (!position) return;
    const total = Math.max(0, Math.min(CAPACITY, Math.floor(count)));
    for (let i = 0; i < total; i++) {
      const azimuth = Math.random() * Math.PI * 2;
      const vertical = Math.random() * 2 - 1;
      const horizontal = Math.sqrt(1 - vertical * vertical);
      const speed = 15 + Math.random() * 67;
      const glow = i % 5 === 0;
      this.emit(position.x, position.y, position.z,
        Math.cos(azimuth) * horizontal * speed, vertical * speed + 7, Math.sin(azimuth) * horizontal * speed,
        glow ? 0xffe7b2 : color, glow ? 12 + Math.random() * 12 : 3 + Math.random() * 7,
        .5 + Math.random() * 1.15, glow ? 0 : -13);
    }
  }

  trail(position, color = 0xffaa55, size = 3) {
    if (!position) return;
    this.emit(position.x, position.y, position.z,
      (Math.random() - .5) * 1.6, .5 + Math.random(), (Math.random() - .5) * 1.6,
      color, size, .34 + Math.random() * .25);
  }

  tracer(from, to, color = 0xffedb4) {
    if (!from || !to) return;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    const count = Math.max(2, Math.min(36, Math.ceil(length / 10)));
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      this.emit(from.x + dx * t, from.y + dy * t, from.z + dz * t, 0, 0, 0, color, 1.8, .085);
    }
  }

  update(dt) {
    if (this.disposed) return;
    const step = Math.max(0, Math.min(dt, .1));
    const drag = Math.exp(-1.6 * step);
    for (let i = 0; i < CAPACITY; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= step;
      if (this.life[i] <= 0) { this.opacity[i] = 0; continue; }
      const p = i * 3;
      this.velocity[p] *= drag;
      this.velocity[p + 1] = this.velocity[p + 1] * drag + this.gravity[i] * step;
      this.velocity[p + 2] *= drag;
      this.position[p] += this.velocity[p] * step;
      this.position[p + 1] += this.velocity[p + 1] * step;
      this.position[p + 2] += this.velocity[p + 2] * step;
      const remaining = this.life[i] / this.duration[i];
      this.opacity[i] = Math.min(1, remaining * 2) * remaining;
      this.sizes[i] = this.baseSize[i] * (1 + (1 - remaining) * .8);
    }
    for (const attribute of Object.values(this.geometry.attributes)) attribute.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.opacity.fill(0);
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  dispose() {
    if (this.disposed) return;
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.disposed = true;
  }
}
