import './style.css';

const MISSIONS = [
  { id: 'takeoff', n: '01', name: 'First light', type: 'TAKEOFF', icon: '↗', detail: 'Bring the Lightning to life. Accelerate down runway 36 and climb through your qualification gates.', tags: 'RUNWAY 36 · FLIGHT SCHOOL' },
  { id: 'waypoints', n: '02', name: 'City circuit', type: 'WAYPOINT RUN', icon: '◇', detail: 'Follow seven amber gates on a sweeping navigation flight around the city skyline.', tags: 'CITY ROUTE · PRECISION' },
  { id: 'skill', n: '03', name: 'Knife edge', type: 'SKILL COURSE', icon: '⌁', detail: 'Stay low and keep your turns tight through eight coastal gates. A clean line makes the difference.', tags: 'COASTAL COURSE · AGILITY' },
  { id: 'dogfight', n: '04', name: 'Air superiority', type: 'DOGFIGHT', icon: '⌖', detail: 'Meet hostile aircraft over the coast. Close the distance, find your lock, and clear the sky.', tags: 'AIR-TO-AIR · COMBAT' },
  { id: 'strike', n: '05', name: 'Thunder run', type: 'GROUND STRIKE', icon: '⊞', detail: 'Locate marked ground targets and make precise attack passes with guns and missiles.', tags: 'AIR-TO-GROUND · COMBAT' },
  { id: 'landing', n: '06', name: 'Coming home', type: 'LANDING', icon: '↘', detail: 'Line up with runway 36, lower the gear, and make a gentle touchdown. Brake to complete your flight.', tags: 'RUNWAY 36 · APPROACH' },
  { id: 'free', n: '07', name: 'Open skies', type: 'FREE FLIGHT', icon: '∞', detail: 'No clock. No route. Explore the city, harbor, and mountains at your own pace.', tags: 'OPEN WORLD · EXPLORATION' },
];

const bolt = '<span class="brand-bolt" aria-hidden="true"></span>';
const arrow = '<span aria-hidden="true">↗</span>';
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const duration = (seconds = 0) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export class UI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.mode = 'menu';
    this.records = {};
    this.modal = null;
    this.noticeTimer = 0;
    this.settings = { muted: false, quality: 'high', timeOfDay: 'cycle', invertPitch: false };
    this.el = document.getElementById('ui');
    this.el.innerHTML = `
      <div class="screen-vignette"></div>
      <section id="menu" class="menu-screen" aria-label="Main menu">
        <header class="menu-header">
          <a class="brand" href="#" aria-label="Lightning Sortie home">${bolt}<span>LIGHTNING<span>SORTIE<span class="brand-small">™</span></span></span></a>
          <nav class="header-nav" aria-label="Game information"><button data-action="controls">FLIGHT MANUAL <span>↗</span></button><button data-action="settings" aria-label="Open settings">SETTINGS <span>⊙</span></button><span class="system-status"><i></i> SYSTEMS ONLINE</span></nav>
        </header>
        <main class="menu-content">
          <div class="eyebrow"><span class="tiny-line"></span> THE SKY IS YOURS <span class="edition">/ ARCADE FLIGHT</span></div>
          <h1>OWN THE<br><span>HORIZON.</span></h1>
          <p class="menu-description">One aircraft. A world of possibilities.<br>Take the Lightning from first takeoff to final approach.</p>
          <div class="menu-actions"><button class="button primary" data-action="begin"><span>BEGIN SORTIE</span>${arrow}</button><button class="button secondary" data-action="free"><span>FREE FLIGHT</span><span aria-hidden="true">∞</span></button></div>
          <button class="stage-link" data-action="stages"><span class="grid-icon" aria-hidden="true">▦</span> SELECT A MISSION <span class="stage-count">07</span><span aria-hidden="true">→</span></button>
          <div class="input-ready"><span class="key-icon" aria-hidden="true">⌨</span><span id="menu-input">KEYBOARD READY</span><span class="input-divider">/</span><span>CONTROLLER SUPPORTED</span></div>
        </main>
        <aside class="aircraft-caption"><span class="aircraft-line"></span><div class="eyebrow">YOUR AIRCRAFT <span>01 / 01</span></div><h2>F-35A <span>LIGHTNING II</span></h2><div class="aircraft-tags"><span>MULTIROLE FIGHTER</span><span>AFTERBURNING TURBOFAN</span></div></aside>
        <footer class="menu-footer"><div class="world-stats"><span><strong>64 × 64</strong> KM OPEN WORLD</span><i></i><span><strong>07</strong> FLIGHT EXPERIENCES</span><i></i><span>PROCEDURALLY BUILT. <strong>READY TO FLY.</strong></span></div><span class="footer-build">LIGHTNING SORTIE <span>·</span> V1.0</span></footer>
      </section>

      <section id="hud" class="hud" aria-label="Flight instruments" hidden>
        <div class="hud-top-left"><div class="hud-wordmark">${bolt}<span>LIGHTNING SORTIE</span></div><div class="mission-eyebrow">ACTIVE SORTIE <span id="mission-number">01</span></div><h2 id="mission-title">First light</h2><p id="objective">Accelerate down the runway.</p><div class="objective-progress"><span id="mission-progress"></span></div><span id="progress-label" class="progress-label">0% COMPLETE</span></div>
        <div class="compass"><div class="compass-cardinal"><span>W</span><span>NW</span><b id="heading-cardinal">N</b><span>NE</span><span>E</span></div><div class="compass-ticks"></div><div class="heading-mark">▼</div><div id="heading" class="heading-value">000</div></div>
        <div class="hud-top-right"><button class="hud-pause" data-action="pause" aria-label="Pause game">Ⅱ <span>ESC</span></button><div class="score-label">SORTIE SCORE</div><div id="score">000000</div><div class="flight-time"><span>FLIGHT TIME</span><strong id="flight-time">00:00</strong></div></div>
        <div class="flight-instrument speed-instrument"><span class="instrument-label">AIRSPEED</span><div class="instrument-reading"><span id="speed">0</span><small>KTS</small></div><div class="instrument-baseline"></div><div class="instrument-detail"><span>THR</span><b id="throttle-number">0%</b></div></div>
        <div class="flight-instrument altitude-instrument"><span class="instrument-label">ALTITUDE</span><div class="instrument-reading"><span id="altitude">0</span><small>FT</small></div><div class="instrument-baseline"></div><div class="instrument-detail"><span>GEAR</span><b id="gear-label">DOWN</b></div></div>
        <div class="flight-reticle" aria-hidden="true"><div class="reticle-side left"></div><div class="reticle-dot"></div><div class="reticle-side right"></div><div class="reticle-tail"></div></div>
        <div class="attitude-window" aria-hidden="true"><div id="attitude-ladder"><div class="ladder-line top"><span>10</span><i></i><i></i><span>10</span></div><div class="ladder-line level"><i></i><i></i></div><div class="ladder-line bottom"><span>10</span><i></i><i></i><span>10</span></div></div></div>
        <div id="target-marker" class="target-marker" hidden><div class="target-corners"></div><span id="target-label">TARGET</span></div>
        <div class="hud-bottom-left"><div class="radar-shell"><canvas id="radar" width="180" height="180" aria-label="Navigation radar"></canvas><span class="radar-north">N</span><span class="radar-label">TAC MAP</span><span class="radar-range">8 KM</span></div><div class="airframe"><span>AIRFRAME</span><div class="health-track"><i id="health-bar"></i></div><b id="health-number">100%</b></div></div>
        <div class="hud-bottom-center"><div id="flight-warning" class="flight-warning" hidden></div><div class="weapons"><div class="weapon"><span class="weapon-symbol">⊕</span><div><span class="micro-label">CANNON</span><strong>25 MM <small id="cannon-state">READY</small></strong><div class="cannon-heat" aria-label="Cannon heat"><i id="cannon-heat-bar"></i></div></div></div><div class="weapon-divider"></div><div class="weapon"><span class="weapon-symbol">↟</span><div><span class="micro-label">MISSILES</span><strong id="missiles">06 <small>READY</small></strong></div></div></div><div class="throttle-control"><span>THR</span><div class="throttle-track"><i id="throttle-bar"></i><em></em></div><b id="afterburner">MIL</b></div></div>
        <div class="hud-bottom-right"><span id="input-device"><i></i> KEYBOARD</span><div id="flight-hints"><span><kbd>↑ ↓</kbd> PITCH</span><span><kbd>A D</kbd> ROLL</span><span><kbd>SPACE</kbd> CANNON</span><span><kbd>F</kbd> MISSILE</span></div><span class="hud-aircraft">F-35A <b>LIGHTNING II</b></span></div>
      </section>

      <section id="pause" class="overlay centered-overlay" aria-label="Game paused" hidden><div class="pause-card"><div class="eyebrow">FLIGHT SYSTEM / STANDBY</div><h2>TAKE A<br><span>BREATHER.</span></h2><p>Your sortie is on hold. The sky can wait.</p><div class="vertical-actions"><button class="button primary" data-action="resume">RESUME FLIGHT <span>→</span></button><button class="button secondary" data-action="restart">RESTART SORTIE <span>↻</span></button><div class="pause-inline"><button data-action="controls">FLIGHT MANUAL</button><button data-action="settings">SETTINGS</button></div><button class="text-button" data-action="menu">RETURN TO HANGAR <span>↗</span></button></div><span class="pause-tip"><kbd>ESC</kbd> TO RESUME</span></div></section>

      <section id="result" class="overlay centered-overlay" aria-label="Sortie results" hidden><div class="result-card"><div id="result-eyebrow" class="eyebrow">MISSION DEBRIEF / SORTIE COMPLETE</div><div class="result-title-row"><h2 id="result-title">MISSION<br><span>COMPLETE.</span></h2><div class="grade-wrap"><span>FLIGHT GRADE</span><strong id="result-grade">A</strong></div></div><p id="result-detail">A good day in the sky.</p><div class="result-stats"><div><span>TOTAL SCORE</span><strong id="result-score">000000</strong></div><div><span>FLIGHT TIME</span><strong id="result-time">00:00</strong></div></div><div class="result-actions"><button class="button primary" data-action="next" id="next-button">NEXT SORTIE <span>→</span></button><button class="button secondary" data-action="restart">FLY AGAIN <span>↻</span></button></div><button class="text-button" data-action="menu">RETURN TO HANGAR <span>↗</span></button></div></section>

      <div id="modal" class="overlay modal-overlay" hidden></div>
      <div id="notice" class="notice" role="status" aria-live="polite" hidden><span class="notice-symbol">◇</span><span id="notice-text"></span></div>
      <div id="damage-flash" class="damage-flash"></div>
    `;
    this.refs = Object.fromEntries([...this.el.querySelectorAll('[id]')].map(el => [el.id, el]));
    this.radar = this.refs.radar;
    this.compassLabels = [...this.el.querySelectorAll('.compass-cardinal > *')];
    this.compassTicks = this.el.querySelector('.compass-ticks');
    this.el.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (button) this.action(button.dataset.action, button.dataset.mission);
      if (event.target.closest('.brand')) event.preventDefault();
    });
    this.el.addEventListener('change', event => {
      const key = event.target.dataset.setting;
      if (!key) return;
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      this.settings[key] = value;
      this.callbacks.setting?.(key, value);
    });
    document.addEventListener('keydown', event => {
      if (event.code === 'Escape' && this.modal) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.closeModal();
      }
      if (event.code === 'Tab' && (this.modal || this.mode !== 'playing')) this.trapFocus(event);
    }, true);
    this.setMode('menu');
  }

  action(action, id) {
    if (action === 'stages') return this.showStages();
    if (action === 'controls') return this.showControls();
    if (action === 'settings') return this.showSettings();
    if (action === 'close') return this.closeModal();
    if (['begin', 'free', 'start'].includes(action)) {
      this.closeModal();
      this.callbacks.start?.(action === 'begin' ? 'takeoff' : action === 'free' ? 'free' : id);
      return;
    }
    this.callbacks[action]?.();
  }

  setMode(mode) {
    this.mode = mode;
    this.closeModal();
    this.el.dataset.mode = mode;
    this.refs.menu.hidden = mode !== 'menu';
    this.refs.hud.hidden = mode === 'menu' || mode === 'result';
    this.refs.pause.hidden = mode !== 'paused';
    this.refs.result.hidden = mode !== 'result';
    this.refs.notice.hidden = true;
    document.body.classList.toggle('in-flight', mode === 'playing');
    if (mode !== 'playing') requestAnimationFrame(() => { const panel=this.activePanel(); (panel?.querySelector('.button.primary') || panel?.querySelector('button'))?.focus({ preventScroll: true }); });
    else document.activeElement?.blur?.();
  }

  activePanel() { return this.modal ? this.refs.modal : this.refs[this.mode === 'paused' ? 'pause' : this.mode === 'result' ? 'result' : 'menu']; }

  trapFocus(event) {
    const controls = [...(this.activePanel()?.querySelectorAll('button, select, input, a[href]') || [])].filter(el => !el.disabled && el.offsetParent !== null);
    if (!controls.length) return;
    if (event.shiftKey && (document.activeElement === controls[0] || !controls.includes(document.activeElement))) { controls.at(-1).focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { controls[0].focus(); event.preventDefault(); }
  }

  openModal(type, content, className = '') {
    this.modal = type;
    this.previousFocus = document.activeElement;
    this.refs.modal.innerHTML = `<section class="modal-panel ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="close-button" data-action="close" aria-label="Close dialog">×</button>${content}</section>`;
    this.refs.modal.hidden = false;
    requestAnimationFrame(() => this.refs.modal.querySelector('button')?.focus({ preventScroll: true }));
  }

  closeModal() {
    this.modal = null;
    if (this.refs?.modal) this.refs.modal.hidden = true;
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  showStages() {
    this.openModal('stages', `<div class="eyebrow">MISSION CONTROL / CHOOSE YOUR FLIGHT</div><h2 id="modal-title">YOUR NEXT <span>SORTIE.</span></h2><p class="modal-description">Learn the aircraft. Test your limits. Or simply get lost in the sky.</p><div class="mission-grid">${MISSIONS.map(m => {
      const record = this.records[m.id];
      return `<button class="mission-card ${m.id === 'free' ? 'free-card' : ''}" data-action="start" data-mission="${m.id}"><div class="mission-card-top"><span>${m.n} / ${m.type}</span><span class="mission-icon">${m.icon}</span></div><h3>${m.name}</h3><p>${m.detail}</p><div class="mission-card-bottom"><span>${record ? `BEST ${escapeHTML(record.grade || '—')} · ${Number(record.score || record).toLocaleString()}` : m.tags}</span><b>↗</b></div></button>`;
    }).join('')}</div><div class="modal-footnote"><span><i class="status-dot"></i> ALL SORTIES AVAILABLE</span><span>SELECT ANY MISSION TO DEPLOY</span></div>`, 'stages-panel');
  }

  showControls() {
    this.openModal('controls', `<div class="eyebrow">PILOT'S HANDBOOK / F-35A</div><h2 id="modal-title">READY FOR <span>FLIGHT.</span></h2><p class="modal-description">Small inputs. Smooth turns. Your next great flight starts here.</p><div class="controls-columns"><div><h3><span>01</span> KEYBOARD</h3><dl class="controls-list"><div><dt>Pitch up / down</dt><dd><kbd>↑</kbd> <kbd>↓</kbd></dd></div><div><dt>Roll left / right</dt><dd><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></dd></div><div><dt>Rudder left / right</dt><dd><kbd>Q</kbd> <kbd>E</kbd></dd></div><div><dt>Throttle up / down</dt><dd><kbd>W</kbd> <kbd>S</kbd></dd></div><div><dt>Afterburner</dt><dd><kbd>SHIFT</kbd></dd></div><div><dt>Fire cannon</dt><dd><kbd>SPACE</kbd></dd></div><div><dt>Launch missile</dt><dd><kbd>F</kbd></dd></div><div><dt>Landing gear</dt><dd><kbd>G</kbd></dd></div><div><dt>Camera view</dt><dd><kbd>C</kbd></dd></div><div><dt>Pause flight</dt><dd><kbd>ESC</kbd></dd></div><div><dt>Restart sortie</dt><dd><kbd>R</kbd></dd></div><div><dt>Change time of day</dt><dd><kbd>N</kbd></dd></div></dl></div><div><h3><span>02</span> CONTROLLER</h3><dl class="controls-list"><div><dt>Pitch / roll</dt><dd>LEFT STICK</dd></div><div><dt>Rudder</dt><dd>RIGHT STICK ↔</dd></div><div><dt>Throttle up / down</dt><dd>R2 / L2</dd></div><div><dt>Afterburner</dt><dd>R1</dd></div><div><dt>Fire cannon</dt><dd>✕ / A</dd></div><div><dt>Launch missile</dt><dd>□ / X</dd></div><div><dt>Landing gear</dt><dd>○ / B</dd></div><div><dt>Camera view</dt><dd>△ / Y</dd></div><div><dt>Pause flight</dt><dd>OPTIONS / START</dd></div></dl><div class="controller-tip"><span class="status-dot"></span>DualSense and standard gamepads supported. Connect your controller and press any button.</div></div></div><div class="flight-tip"><span>FLIGHT TIP</span><p>For takeoff, apply full throttle and gently pull up as speed builds. For landing, lower your gear, reduce throttle, and approach the runway with wings level.</p></div>`, 'controls-panel');
  }

  showSettings() {
    this.openModal('settings', `<div class="eyebrow">FLIGHT SYSTEM / PREFERENCES</div><h2 id="modal-title">YOUR <span>COCKPIT.</span></h2><p class="modal-description">Make yourself comfortable. Changes apply immediately.</p><div class="settings-list"><label class="setting-row"><span><strong>Graphics quality</strong><small>Rendering resolution and atmospheric distance</small></span><select data-setting="quality" aria-label="Graphics quality"><option value="high" ${this.settings.quality === 'high' ? 'selected' : ''}>High</option><option value="medium" ${this.settings.quality === 'medium' ? 'selected' : ''}>Medium</option><option value="low" ${this.settings.quality === 'low' ? 'selected' : ''}>Low</option></select></label><label class="setting-row"><span><strong>Time of day</strong><small>Choose your light, or let the world turn</small></span><select data-setting="timeOfDay" aria-label="Time of day"><option value="cycle" ${this.settings.timeOfDay === 'cycle' ? 'selected' : ''}>Day / night cycle</option><option value="day" ${this.settings.timeOfDay === 'day' ? 'selected' : ''}>Daylight</option><option value="dusk" ${this.settings.timeOfDay === 'dusk' ? 'selected' : ''}>Golden hour</option><option value="night" ${this.settings.timeOfDay === 'night' ? 'selected' : ''}>Night flight</option></select></label><label class="setting-row"><span><strong>Mute audio</strong><small>Engine, weapons, and flight feedback</small></span><input type="checkbox" data-setting="muted" ${this.settings.muted ? 'checked' : ''} aria-label="Mute audio"><i class="toggle" aria-hidden="true"></i></label><label class="setting-row"><span><strong>Invert pitch</strong><small>Reverse vertical flight input</small></span><input type="checkbox" data-setting="invertPitch" ${this.settings.invertPitch ? 'checked' : ''} aria-label="Invert pitch"><i class="toggle" aria-hidden="true"></i></label></div><div class="modal-footnote"><span><i class="status-dot"></i> SETTINGS SAVED LOCALLY</span></div>`, 'settings-panel');
  }

  setRecords(records = {}) { this.records = records; }

  update(state) {
    const text = (key, value) => { const el = this.refs[key]; if (el && el.textContent !== String(value)) el.textContent = value; };
    const heading = ((state.heading || 0) % 360 + 360) % 360;
    text('speed', Math.max(0, Math.round(state.speed || 0)));
    text('altitude', Math.max(0, Math.round(state.altitude || 0)).toLocaleString());
    text('heading', Math.round(heading).toString().padStart(3, '0') + '°');
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const compassSector = Math.round(heading / 45);
    this.compassLabels.forEach((el, index) => { el.textContent = directions[(compassSector + index + 6) % 8]; });
    this.compassTicks.style.backgroundPositionX = `${-heading * 1.4}px`;
    text('score', Math.round(state.score || 0).toString().padStart(6, '0'));
    text('flight-time', duration(state.time));
    text('mission-title', state.missionTitle || 'Free flight');
    text('objective', state.objective || 'The sky is yours.');
    const mission = MISSIONS.find(m => m.name === state.missionTitle || m.id === state.missionId || m.type.toLowerCase() === state.missionTitle?.toLowerCase());
    text('mission-number', mission?.n || 'LIVE');
    const progress = Math.max(0, Math.min(1, state.progress || 0));
    this.refs['mission-progress'].style.width = `${progress * 100}%`;
    text('progress-label', `${Math.round(progress * 100)}% COMPLETE`);
    const throttle = Math.max(0, Math.min(1, state.throttle || 0));
    this.refs['throttle-bar'].style.width = `${throttle * 100}%`;
    text('throttle-number', `${Math.round(throttle * 100)}%`);
    text('afterburner', state.afterburner ? 'AB' : 'MIL');
    this.refs.afterburner.classList.toggle('active', !!state.afterburner);
    text('gear-label', state.gear ? 'DOWN' : 'UP');
    this.refs['gear-label'].classList.toggle('active', !!state.gear);
    const health = Math.max(0, Math.min(100, state.health ?? 100));
    this.refs['health-bar'].style.width = `${health}%`;
    this.refs['health-bar'].classList.toggle('critical', health < 35);
    text('health-number', `${Math.round(health)}%`);
    if (this.previousHealth != null && health < this.previousHealth) {
      this.refs['damage-flash'].classList.remove('flash');
      void this.refs['damage-flash'].offsetWidth;
      this.refs['damage-flash'].classList.add('flash');
    }
    this.previousHealth = health;
    const missiles = String(state.missiles ?? 6).padStart(2, '0');
    if (this.lastMissiles !== missiles) { this.refs.missiles.innerHTML = `${missiles} <small>${Number(state.missiles) === 0 ? 'EMPTY' : 'READY'}</small>`; this.lastMissiles = missiles; }
    const cannonHeat = Math.max(0, Math.min(1, state.cannonHeat || 0));
    this.refs['cannon-heat-bar'].style.width = `${cannonHeat * 100}%`;
    this.refs['cannon-heat-bar'].classList.toggle('hot', !!state.cannonOverheated);
    text('cannon-state', state.cannonOverheated ? 'COOLING' : 'READY');
    this.refs['cannon-state'].classList.toggle('hot', !!state.cannonOverheated);
    text('flight-warning', state.warning || '');
    this.refs['flight-warning'].hidden = !state.warning;
    const pad = state.pad ? (/dualsense|wireless|sony/i.test(state.pad) ? 'DUALSENSE' : 'CONTROLLER') : 'KEYBOARD';
    if (pad !== this.previousPad) {
      this.refs['input-device'].innerHTML = `<i></i> ${pad}`;
      text('menu-input', `${pad} READY`);
      this.refs['flight-hints'].innerHTML = state.pad ? '<span><kbd>LS</kbd> FLIGHT</span><span><kbd>R2 L2</kbd> THROTTLE</span><span><kbd>✕ / A</kbd> CANNON</span><span><kbd>□ / X</kbd> MISSILE</span>' : '<span><kbd>↑ ↓</kbd> PITCH</span><span><kbd>A D</kbd> ROLL</span><span><kbd>SPACE</kbd> CANNON</span><span><kbd>F</kbd> MISSILE</span>';
      this.previousPad = pad;
    }
    this.refs['attitude-ladder'].style.transform = `translateY(${Math.max(-35, Math.min(35, (state.pitch || 0) * 1.3))}px) rotate(${-(state.roll || 0)}deg)`;
    const target = state.target;
    this.refs['target-marker'].hidden = !target?.visible;
    if (target?.visible) {
      this.refs['target-marker'].style.left = `${target.x}px`;
      this.refs['target-marker'].style.top = `${target.y}px`;
      this.refs['target-marker'].classList.toggle('locked', !!target.locked);
      text('target-label', target.label || (target.locked ? 'LOCK' : 'TARGET'));
    }
  }

  notify(message) {
    clearTimeout(this.noticeTimer);
    this.refs['notice-text'].textContent = message;
    this.refs.notice.hidden = false;
    this.noticeTimer = setTimeout(() => { this.refs.notice.hidden = true; }, 4300);
  }

  result({ success, title, grade, score, time, detail }) {
    this.setMode('result');
    this.refs['result-eyebrow'].textContent = success ? 'MISSION DEBRIEF / SORTIE COMPLETE' : 'MISSION DEBRIEF / SORTIE ENDED';
    this.refs['result-title'].innerHTML = title ? escapeHTML(title) : success ? 'MISSION<br><span>COMPLETE.</span>' : 'LIVE TO FLY<br><span>AGAIN.</span>';
    this.refs['result-grade'].textContent = grade || '—';
    this.refs['result-score'].textContent = Math.round(score || 0).toString().padStart(6, '0');
    this.refs['result-time'].textContent = duration(time);
    this.refs['result-detail'].textContent = detail || (success ? 'A good day in the sky. Your next sortie is ready.' : 'Every great pilot starts somewhere. Take another run.');
    this.refs['next-button'].hidden = !success;
    this.refs.result.classList.toggle('failed', !success);
  }
}

export { MISSIONS };
