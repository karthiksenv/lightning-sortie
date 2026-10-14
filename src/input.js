const tracked = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','Space','KeyF','KeyG','KeyC','Escape','KeyR','KeyN']);
export class Input {
  constructor(action) {
    this.held = new Set(); this.action = action; this.previousButtons = []; this.pad = null; this.invertPitch = false; this.menuTime = 0; this.menuDirection = 0;
    this.command = {pitch:0,roll:0,yaw:0,throttle:0,boost:false,gun:false};
    addEventListener('keydown', e => {
      if (!tracked.has(e.code) || /INPUT|SELECT|TEXTAREA/.test(e.target?.tagName)) return;
      if (e.code !== 'Space' || document.activeElement?.tagName !== 'BUTTON') e.preventDefault();
      this.held.add(e.code);
      if (!e.repeat) { const actions={Escape:'pause',KeyF:'missile',KeyG:'gear',KeyC:'camera',KeyR:'restart',KeyN:'day'}; if(actions[e.code]) action(actions[e.code]); }
    });
    addEventListener('keyup', e => this.held.delete(e.code));
    addEventListener('blur', () => this.clear());
    addEventListener('gamepaddisconnected', () => { this.pad=null; this.previousButtons=[]; this.clear(); action('disconnect'); });
  }
  clear() {
    this.held.clear();
    Object.assign(this.command, {pitch:0,roll:0,yaw:0,throttle:0,boost:false,gun:false});
    this.menuTime = 0;
    this.menuDirection = 0;
  }
  menuControls() {
    // The hangar and HUD can remain visible underneath an overlay. Never let a
    // controller focus or activate a control in those covered panels.
    const panel = ['modal', 'pause', 'result', 'menu'].map(id => document.getElementById(id)).find(el => el && !el.hidden);
    return [...(panel?.querySelectorAll('button,input,select') || [])].filter(el => !el.disabled && !el.hidden && el.offsetParent !== null);
  }
  changeSelection(select, direction) {
    const options = [...select.options].filter(option => !option.disabled && !option.hidden && !option.parentElement?.disabled);
    if (!options.length) return;
    const index = options.indexOf(select.selectedOptions[0]);
    const option = options[(index + direction + options.length) % options.length];
    if (select.value === option.value) return;
    select.value = option.value;
    select.dispatchEvent(new Event('input', {bubbles:true}));
    select.dispatchEvent(new Event('change', {bubbles:true}));
  }
  poll(dt, playing) {
    const c=this.command, h=this.held, down=k=>h.has(k)?1:0;
    c.pitch=down('ArrowUp')-down('ArrowDown'); c.roll=Math.max(down('ArrowRight'),down('KeyD'))-Math.max(down('ArrowLeft'),down('KeyA'));
    c.yaw=down('KeyE')-down('KeyQ'); c.throttle=down('KeyW')-down('KeyS'); c.boost=h.has('ShiftLeft')||h.has('ShiftRight'); c.gun=h.has('Space');
    const pads=navigator.getGamepads?.(); const pad=pads && Array.from(pads).find(p=>p?.connected);
    this.pad=pad ? (/dualsense|054c|wireless controller/i.test(pad.id)?'DUALSENSE': 'GAMEPAD') : null;
    if(pad) {
      const axis=n=>Math.abs(pad.axes[n]||0)>0.14 ? (pad.axes[n]-Math.sign(pad.axes[n])*0.14)/0.86 : 0;
      const button=n=>pad.buttons[n]?.pressed || false;
      c.pitch-=axis(1); c.roll+=axis(0); c.yaw+=axis(2);
      c.throttle+=(pad.buttons[7]?.value||0)-(pad.buttons[6]?.value||0)+(button(12)?1:0)-(button(13)?1:0);
      c.boost ||= button(5); c.gun ||= button(0);
      const pressed=n=>button(n) && !this.previousButtons[n];
      if(pressed(9)) this.action('pause');
      if(playing) { if(pressed(2))this.action('missile'); if(pressed(1))this.action('gear'); if(pressed(3))this.action('camera'); }
      else {
        const controls = this.menuControls();
        if (controls.length && !controls.includes(document.activeElement)) controls[0].focus();
        this.menuTime-=dt;
        const vertical=button(13)||axis(1)>0.6?1:button(12)||axis(1)<-0.6?-1:0;
        const horizontal=button(15)||axis(0)>0.6?1:button(14)||axis(0)<-0.6?-1:0;
        const step=vertical||horizontal;
        const direction=vertical ? vertical : horizontal * 2;
        if (direction !== this.menuDirection) this.menuTime=0;
        this.menuDirection=direction;
        if(step && this.menuTime<=0) {
          const el=document.activeElement;
          if (!vertical && el?.tagName==='SELECT' && controls.includes(el)) this.changeSelection(el,horizontal);
          else { const i=controls.indexOf(el); controls[(i+step+controls.length)%controls.length]?.focus(); }
          this.menuTime=0.22;
        }
        if(pressed(0)) {
          const el=document.activeElement;
          if (controls.includes(el)) {
            if(el.tagName==='BUTTON'||el.type==='checkbox')el.click();
            else if(el.tagName==='SELECT')this.changeSelection(el,1);
          }
        }
        if(pressed(1))this.action('back');
      }
      this.previousButtons=pad.buttons.map(b=>b.pressed);
    } else this.previousButtons=[];
    c.pitch=Math.max(-1,Math.min(1,c.pitch))*(this.invertPitch?-1:1);
    c.roll=Math.max(-1,Math.min(1,c.roll)); c.yaw=Math.max(-1,Math.min(1,c.yaw)); c.throttle=Math.max(-1,Math.min(1,c.throttle));
    return c;
  }
}
