// hud.js — everything drawn over the 3D view: cash, health, wanted stars,
// speed, the mission objective banner, context prompts, toasts, and the
// circular minimap (streets, bay, player arrow, police blips, mission gold).

import { LAYOUT } from './city.js';

const STAR = '★';

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.cashVal = document.getElementById('cashVal');
    this.healthFill = document.getElementById('healthFill');
    this.starsEl = document.getElementById('stars');
    this.objectiveEl = document.getElementById('objective');
    this.objTitle = document.getElementById('objTitle');
    this.objText = document.getElementById('objText');
    this.objTimer = document.getElementById('objTimer');
    this.speedBox = document.getElementById('speedBox');
    this.speedVal = document.getElementById('speedVal');
    this.promptEl = document.getElementById('prompt');
    this.toastEl = document.getElementById('toast');
    this.startScreen = document.getElementById('startScreen');
    this.saveLine = document.getElementById('saveLine');
    this.pauseScreen = document.getElementById('pauseScreen');
    this.wastedScreen = document.getElementById('wastedScreen');
    this.wastedText = document.getElementById('wastedText');
    this.mapCtx = document.getElementById('minimap').getContext('2d');
    this.toastTimer = null;
    this.lastStars = -1;
  }

  showHud() {
    this.root.classList.add('on');
  }

  setCash(amount) {
    this.cashVal.textContent = Math.max(0, Math.floor(amount)).toLocaleString('en-US');
  }

  setHealth(health) {
    this.healthFill.style.width = `${Math.max(0, Math.min(100, health))}%`;
  }

  setWanted(level) {
    const lit = Math.round(level);
    if (lit === this.lastStars) return;
    this.lastStars = lit;
    let html = '';
    for (let i = 0; i < 5; i++) html += `<span class="${i < lit ? 'lit' : ''}">${STAR}</span>`;
    this.starsEl.innerHTML = html;
  }

  setSpeed(kmh) {
    if (kmh === null) {
      this.speedBox.classList.remove('on');
      return;
    }
    this.speedBox.classList.add('on');
    this.speedVal.textContent = String(Math.round(Math.abs(kmh)));
  }

  setObjective(title, text, timerSeconds) {
    this.objectiveEl.classList.add('on');
    this.objTitle.textContent = title;
    this.objText.textContent = text;
    if (timerSeconds !== null && timerSeconds !== undefined) {
      this.objTimer.style.display = 'block';
      const s = Math.max(0, Math.ceil(timerSeconds));
      this.objTimer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      this.objTimer.style.color = s < 20 ? '#ff5a3c' : '#ffd23e';
    } else {
      this.objTimer.style.display = 'none';
    }
  }

  clearObjective() {
    this.objectiveEl.classList.remove('on');
  }

  showPrompt(html) {
    if (html) {
      this.promptEl.innerHTML = html;
      this.promptEl.classList.add('on');
    } else {
      this.promptEl.classList.remove('on');
    }
  }

  toast(text, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  setSaveLine(text) {
    this.saveLine.textContent = text;
  }

  hideStart() {
    this.startScreen.classList.remove('on');
  }

  showStart() {
    this.startScreen.classList.add('on');
  }

  setPaused(paused) {
    this.pauseScreen.classList.toggle('on', paused);
  }

  showWasted(title, text) {
    this.wastedScreen.querySelector('.bigMsg').textContent = title;
    this.wastedText.textContent = text;
    this.wastedScreen.classList.add('on');
  }

  hideWasted() {
    this.wastedScreen.classList.remove('on');
  }

  // Minimap: world x in [-280, 330], z in [-200, 200] mapped into the disc.
  drawMinimap({ playerPos, playerHeading, police, target }) {
    const ctx = this.mapCtx;
    const S = 190;
    const cx = S / 2;
    const cy = S / 2;
    const scale = S / 620;
    const toMap = (x, z) => ({ x: cx + (x - 20) * scale, y: cy + (z - 0) * scale });
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 1, 0, Math.PI * 2);
    ctx.clip();
    // Water, then land.
    ctx.fillStyle = '#17455e';
    ctx.fillRect(0, 0, S, S);
    const landTL = toMap(LAYOUT.cityMinX, LAYOUT.cityMinZ);
    const landBR = toMap(LAYOUT.beachX, LAYOUT.cityMaxZ);
    ctx.fillStyle = '#3d4148';
    ctx.fillRect(landTL.x, landTL.y, landBR.x - landTL.x, landBR.y - landTL.y);
    const sandTL = toMap(LAYOUT.cityMaxX, LAYOUT.cityMinZ);
    ctx.fillStyle = '#a8895a';
    ctx.fillRect(sandTL.x, sandTL.y, landBR.x - sandTL.x, landBR.y - sandTL.y);
    // Streets.
    ctx.strokeStyle = '#6d7278';
    ctx.lineWidth = 2.4;
    for (const sx of LAYOUT.streetX) {
      const a = toMap(sx, LAYOUT.cityMinZ);
      const b = toMap(sx, LAYOUT.cityMaxZ);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const sz of LAYOUT.streetZ) {
      const a = toMap(LAYOUT.cityMinX, sz);
      const b = toMap(LAYOUT.cityMaxX, sz);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // Mission target: pulsing gold diamond.
    if (target) {
      const p = toMap(target.x, target.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 1.6;
      ctx.fillStyle = '#ffd23e';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-pulse / 1.4, -pulse / 1.4, pulse * 1.4, pulse * 1.4);
      ctx.restore();
    }
    // Police blips, alternating red/blue like their light bars.
    const flashBlue = Math.sin(performance.now() * 0.012) > 0;
    for (const unit of police) {
      const p = toMap(unit.x, unit.z);
      ctx.fillStyle = flashBlue ? '#3a86ff' : '#ff3b30';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const pp = toMap(playerPos.x, playerPos.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(Math.PI - playerHeading); // arrow geometry points up; world +z is canvas-down
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6.4);
    ctx.lineTo(4.2, 4.6);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.2, 4.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }
}
