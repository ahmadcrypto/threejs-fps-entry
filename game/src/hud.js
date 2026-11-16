// The DOM HUD: crosshair with spread feedback, hit marker, health, ammo, money,
// timer, score, alive counts, kill feed, round banners, plant/defuse progress,
// the buy menu and the one overlay panel. It never touches the simulation;
// main.js pushes numbers in and reads the buy callbacks out.
import { WEAPONS, BUY_ORDER, GRENADE } from './weapons.js';

const OVERLAY_COPY = {
  menu: {
    title: 'EMBERLINE',
    copy: 'A round-based tactical strike in Foundry Yard. Vanguard attacks two sites; Revenant holds them. Win the round by eliminating the other team — or by the bomb.',
    action: 'Click to deploy',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playButton = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('damage-vignette');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreV = $('score-v');
  const scoreR = $('score-r');
  const roundValue = $('round-value');
  const aliveV = $('alive-v');
  const aliveR = $('alive-r');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const bombTimer = $('bomb-timer');
  const bombTimerValue = $('bomb-timer-value');
  const channel = $('channel');
  const channelLabel = $('channel-label');
  const channelFill = $('channel-fill');
  const hint = $('hint');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const buyClose = $('buy-close');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastHealth = -1;
  let lastMag = -1;
  let lastReserve = -1;
  let lastMoney = -1;
  let lastTimer = -1;
  let lastScore = '';
  let lastAlive = '';

  function renderBuyMenu(money, ownedId, grenades) {
    buyItems.innerHTML = '';
    BUY_ORDER.forEach((id, index) => {
      const def = WEAPONS[id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.weapon = id;
      const owned = id === ownedId;
      const afford = money >= def.price;
      button.disabled = owned || !afford;
      button.innerHTML = `<span class="buy-key">${index + 1}</span>
        <span class="buy-name">${def.name}</span>
        <span class="buy-stat">${def.damage} dmg · ${def.magSize} mag</span>
        <span class="buy-price">${owned ? 'OWNED' : '$' + def.price}</span>`;
      buyItems.appendChild(button);
    });
    const grenade = document.createElement('button');
    grenade.type = 'button';
    grenade.className = 'buy-item';
    grenade.dataset.grenade = '1';
    grenade.disabled = money < GRENADE.price;
    grenade.innerHTML = `<span class="buy-key">5</span>
      <span class="buy-name">${GRENADE.name}</span>
      <span class="buy-stat">Blast radius ${GRENADE.radius} m · have ${grenades}</span>
      <span class="buy-price">$${GRENADE.price}</span>`;
    buyItems.appendChild(grenade);
    buyMoney.textContent = '$' + money;
  }

  return {
    setHealth(hp) {
      const value = Math.max(0, Math.round(hp));
      if (value === lastHealth) return;
      lastHealth = value;
      healthFill.style.width = value + '%';
      healthFill.classList.toggle('low', value <= 30);
      healthValue.textContent = String(value);
    },
    setAmmo(mag, reserve, name, grenades) {
      if (mag !== lastMag || reserve !== lastReserve) {
        lastMag = mag;
        lastReserve = reserve;
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = '/ ' + reserve;
        document.getElementById('ammo').classList.toggle('empty', mag === 0);
      }
      weaponName.textContent = name;
      grenadeCount.textContent = '◉ ' + grenades;
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = '$' + value;
    },
    setTimer(seconds, phase) {
      const value = Math.max(0, Math.ceil(seconds));
      const key = value + phase;
      if (key === lastTimer) return;
      lastTimer = key;
      timerValue.textContent = phase === 'buy' ? 'BUY ' + value : String(value);
      timerValue.classList.toggle('urgent', phase === 'round' && value <= 10);
    },
    setScore(v, r, round) {
      const key = `${v}-${r}-${round}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreV.textContent = String(v);
      scoreR.textContent = String(r);
      roundValue.textContent = 'ROUND ' + round;
    },
    setAlive(v, r) {
      const key = `${v}-${r}`;
      if (key === lastAlive) return;
      lastAlive = key;
      aliveV.textContent = '◆'.repeat(Math.max(0, v)) + '◇'.repeat(Math.max(0, 5 - v));
      aliveR.textContent = '◆'.repeat(Math.max(0, r)) + '◇'.repeat(Math.max(0, 5 - r));
    },
    killfeed(killer, victim, headshot, killerTeam) {
      const line = document.createElement('div');
      line.className = 'feed-line ' + killerTeam;
      line.innerHTML = `<span class="feed-killer">${killer}</span> ${headshot ? '<span class="feed-head">◎</span>' : '—'} <span class="feed-victim">${victim}</span>`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.classList.add('fade'), 4200);
      setTimeout(() => line.remove(), 5000);
    },
    banner(title, sub, team) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub || '';
      banner.className = 'show' + (team ? ' ' + team : '');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.className = ''; }, 3400);
    },
    hideBanner() {
      banner.className = '';
      clearTimeout(bannerTimer);
    },
    hitMarker(killed, holdMs = 120) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.remove('flash');
      void vignette.offsetWidth;
      vignette.classList.add('flash');
    },
    crosshairGap(px) {
      crosshair.style.setProperty('--gap', Math.round(px) + 'px');
    },
    setBombTimer(seconds) {
      if (seconds === null) {
        bombTimer.hidden = true;
        return;
      }
      bombTimer.hidden = false;
      bombTimerValue.textContent = Math.max(0, seconds).toFixed(1);
    },
    setChannel(progress, label) {
      if (progress === null) {
        channel.hidden = true;
        return;
      }
      channel.hidden = false;
      channelLabel.textContent = label;
      channelFill.style.width = Math.round(Math.min(1, Math.max(0, progress)) * 100) + '%';
    },
    showHint(text) {
      hint.textContent = text;
      hint.hidden = false;
    },
    hideHint() {
      hint.hidden = true;
    },
    showBuyMenu(money, ownedId, grenades) {
      renderBuyMenu(money, ownedId, grenades);
      buyMenu.hidden = false;
    },
    hideBuyMenu() {
      buyMenu.hidden = true;
    },
    refreshBuyMenu(money, ownedId, grenades) {
      if (!buyMenu.hidden) renderBuyMenu(money, ownedId, grenades);
    },
    onBuy(handler) {
      buyItems.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (button.dataset.weapon) handler({ weapon: button.dataset.weapon });
        else if (button.dataset.grenade) handler({ grenade: true });
      });
    },
    onBuyClose(handler) {
      buyClose.addEventListener('click', handler);
    },
    showOverlay(mode, detail) {
      const text = OVERLAY_COPY[mode];
      overlayTitle.textContent = text.title;
      overlayCopy.textContent = detail || text.copy;
      playButton.textContent = text.action;
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
  };
}
