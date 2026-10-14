import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/input.js';

const DT = 1 / 60;

function harness(t) {
  const listeners = new Map(), panels = new Map(), actions = [];
  const document = { activeElement: null, getElementById: id => panels.get(id) };
  const pad = { id: 'Sony DualSense Wireless Controller', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  let gamepads = [pad];
  const replacements = {
    document,
    navigator: { getGamepads: () => gamepads },
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  for (const [name, value] of Object.entries(replacements)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]);
  }
  const input = new Input(action => actions.push(action));
  const control = (tagName, props = {}) => ({
    tagName, disabled: false, hidden: false, offsetParent: {}, clicks: 0,
    focus() { document.activeElement = this; },
    click() { this.clicks++; if (this.type === 'checkbox') this.checked = !this.checked; },
    ...props,
  });
  return {
    input, document, pad, actions, panels, control,
    button(index, pressed = true, value = pressed ? 1 : 0) { Object.assign(pad.buttons[index], { pressed, value }); },
    emit(name, event = {}) { listeners.get(name)?.(event); },
    keyboard(code, repeat = false, tagName = 'BODY') {
      const event = { code, repeat, target: { tagName }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      listeners.get('keydown')(event);
      return event;
    },
    panel(id, controls, hidden = false) { const panel = { hidden, querySelectorAll: () => controls }; panels.set(id, panel); return panel; },
    disconnect() { gamepads = []; listeners.get('gamepaddisconnected')({ gamepad: pad }); },
    select(values) {
      const select = control('SELECT', { options: values.map(value => ({ value, disabled: false })), value: values[0], events: [], dispatchEvent(event) { this.events.push(event); } });
      Object.defineProperty(select, 'selectedOptions', { get: () => select.options.filter(option => option.value === select.value) });
      return select;
    },
  };
}

test('gamepad sticks have a deadzone, use arcade flight directions, and clamp combined input', t => {
  const h = harness(t);
  h.pad.axes = [.14, -.1, -.14, 0];
  assert.deepEqual(h.input.poll(DT, true), { pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false, gun: false });
  assert.equal(h.input.pad, 'DUALSENSE');
  h.pad.axes = [.57, -.57, -.57, 0];
  const command = h.input.poll(DT, true);
  assert.ok(Math.abs(command.pitch - .5) < 1e-10);
  assert.ok(Math.abs(command.roll - .5) < 1e-10);
  assert.ok(Math.abs(command.yaw + .5) < 1e-10);
  h.keyboard('ArrowUp'); h.keyboard('KeyD'); h.keyboard('KeyQ'); h.keyboard('KeyW');
  h.button(7); h.button(5); h.button(0);
  assert.deepEqual(h.input.poll(DT, true), { pitch: 1, roll: 1, yaw: -1, throttle: 1, boost: true, gun: true });
  h.input.invertPitch = true;
  assert.equal(h.input.poll(DT, true).pitch, -1);
});

test('keyboard actions fire once per press and blur clears held commands immediately', t => {
  const h = harness(t);
  h.keyboard('KeyF'); h.keyboard('KeyF', true);
  h.keyboard('ArrowUp'); h.keyboard('KeyW'); h.keyboard('ShiftLeft'); h.keyboard('Space');
  assert.deepEqual(h.actions, ['missile']);
  assert.equal(h.input.poll(DT, true).pitch, 1);
  assert.equal(h.input.command.gun, true);
  h.emit('keyup', { code: 'ArrowUp' });
  assert.equal(h.input.poll(DT, true).pitch, 0);
  h.emit('blur');
  assert.equal(h.input.held.size, 0);
  assert.deepEqual(h.input.command, { pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false, gun: false });
  h.keyboard('KeyG', false, 'SELECT');
  h.keyboard('KeyR', false, 'INPUT');
  assert.deepEqual(h.actions, ['missile'], 'editing settings must not trigger flight shortcuts');
});

test('gamepad actions are edge triggered and retain their documented flight mappings', t => {
  const h = harness(t);
  for (const index of [1, 2, 3, 9]) h.button(index);
  h.input.poll(DT, true); h.input.poll(DT, true);
  assert.deepEqual(h.actions, ['pause', 'missile', 'gear', 'camera']);
  for (const index of [1, 2, 3, 9]) h.button(index, false);
  h.input.poll(DT, true);
  h.button(2); h.input.poll(DT, true);
  assert.deepEqual(h.actions, ['pause', 'missile', 'gear', 'camera', 'missile']);
  h.button(7, true, .75); h.button(6, true, .25);
  assert.equal(h.input.poll(DT, true).throttle, .5);
});

test('controller disconnection calls the pause notification action and clears control state', t => {
  const h = harness(t);
  h.keyboard('KeyW'); h.button(0); h.input.poll(DT, true);
  h.disconnect();
  assert.deepEqual(h.actions, ['disconnect']);
  assert.equal(h.input.pad, null);
  assert.deepEqual(h.input.previousButtons, []);
  assert.equal(h.input.held.size, 0);
  assert.deepEqual(h.input.command, { pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false, gun: false });
});

test('controller navigation and activation stay inside the open modal', t => {
  const h = harness(t);
  const behind = h.control('BUTTON'), close = h.control('BUTTON'), setting = h.control('INPUT', { type: 'checkbox' });
  h.panel('menu', [behind]);
  h.panel('modal', [close, h.control('BUTTON', { disabled: true }), h.control('BUTTON', { offsetParent: null }), setting]);
  behind.focus();
  h.button(0); h.input.poll(DT, false);
  assert.equal(h.document.activeElement, close, 'stale focus behind a modal is repaired');
  assert.equal(close.clicks, 1);
  assert.equal(behind.clicks, 0);
  h.button(0, false); h.button(13); h.input.poll(DT, false);
  assert.equal(h.document.activeElement, setting);
  h.input.poll(DT, false);
  assert.equal(h.document.activeElement, setting, 'held D-pad uses repeat delay');
  h.button(13, false); h.input.poll(DT, false);
  h.button(0); h.input.poll(DT, false); h.input.poll(DT, false);
  assert.equal(setting.checked, true);
  assert.equal(setting.clicks, 1, 'holding Cross does not toggle repeatedly');
  h.button(0, false); h.button(13); h.input.poll(DT, false);
  assert.equal(h.document.activeElement, close, 'navigation wraps within the modal');
  h.button(1); h.input.poll(DT, false);
  assert.deepEqual(h.actions, ['back']);
});

test('controller can change settings with left/right or Cross and move away with up/down', t => {
  const h = harness(t);
  const select = h.select(['high', 'medium', 'low']), next = h.control('INPUT', { type: 'checkbox' });
  h.panel('modal', [select, next]);
  select.focus();
  h.button(15); h.input.poll(DT, false);
  assert.equal(select.value, 'medium');
  assert.equal(h.document.activeElement, select);
  assert.deepEqual(select.events.map(event => [event.type, event.bubbles]), [['input', true], ['change', true]]);
  h.input.poll(.25, false);
  assert.equal(select.value, 'low');
  h.button(15, false); h.button(14); h.input.poll(DT, false);
  assert.equal(select.value, 'medium', 'reversing direction responds without the repeat delay');
  h.button(14, false); h.button(0); h.input.poll(DT, false);
  assert.equal(select.value, 'low');
  h.button(0, false); h.button(13); h.input.poll(DT, false);
  assert.equal(h.document.activeElement, next);
});

test('pause and result controls take precedence over the hangar, and empty panels cannot activate stale focus', t => {
  const h = harness(t);
  const menu = h.control('BUTTON'), pause = h.control('BUTTON'), result = h.control('BUTTON');
  h.panel('menu', [menu]);
  const pausePanel = h.panel('pause', [pause]);
  h.panel('result', [result]);
  menu.focus(); h.button(0); h.input.poll(DT, false);
  assert.equal(pause.clicks, 1); assert.equal(menu.clicks, 0); assert.equal(result.clicks, 0);
  pausePanel.hidden = true;
  h.button(0, false); h.input.poll(DT, false);
  h.button(0); h.input.poll(DT, false);
  assert.equal(result.clicks, 1); assert.equal(menu.clicks, 0);
  h.panel('modal', []);
  h.button(0, false); h.input.poll(DT, false);
  h.button(0); h.input.poll(DT, false);
  assert.equal(result.clicks, 1, 'an empty modal cannot activate a covered result button');
});
