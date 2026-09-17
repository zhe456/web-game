import './style.css';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo-display');
const challengeBadge = document.getElementById('challenge-badge');
const magnetBadge = document.getElementById('magnet-badge');
const feverBadge = document.getElementById('fever-badge');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const soundBtn = document.getElementById('sound-btn');
const difficultySelect = document.getElementById('difficulty-select');
const leaderboardEl = document.getElementById('leaderboard');
const missionCard = document.getElementById('mission-card');
const missionReward = document.querySelector('.mission-reward');
const missionText = document.querySelector('.mission-text');
const missionFill = document.querySelector('.mission-fill');
const missionCountNum = document.querySelector('.mission-count-num');
const missionTime = document.querySelector('.mission-time');
const leftBtn = document.getElementById('left-btn');
const rightBtn = document.getElementById('right-btn');

const START_LIVES = 3;
const MAX_LIVES = 5;
const LEVEL_SCORE = 15;
const FEVER_DURATION = 8;
const MAGNET_DURATION = 5;
const CHALLENGE_DURATION = 8;
const HIGH_SCORE_KEY = 'coin-catcher-high-score';
const SOUND_KEY = 'coin-catcher-sound';
const DIFFICULTY_KEY = 'coin-catcher-difficulty';
const LEADERBOARD_KEY = 'coin-catcher-leaderboard';
const LEADERBOARD_SIZE = 5;
const CHALLENGE_LEVELS = new Set([5, 10, 15]);

const DIFFICULTIES = {
  easy: { key: 'easy', label: '簡單', fallMult: 0.8, spawnMult: 1.15, bombMult: 0.5, heartMult: 1.3 },
  normal: { key: 'normal', label: '普通', fallMult: 1, spawnMult: 1, bombMult: 1, heartMult: 1 },
  hard: { key: 'hard', label: '困難', fallMult: 1.15, spawnMult: 0.85, bombMult: 1.8, heartMult: 0.5 },
};

const MISSION_BONUS = {
  normal_coins: 50,
  gold_coins: 80,
  combo_x: 60,
  score_30s: 80,
};

let difficultyKey = safeGet(DIFFICULTY_KEY) || 'normal';
let difficulty = DIFFICULTIES[difficultyKey];

let W = 0;
let H = 0;
let state = 'menu';
let score = 0;
let lives = START_LIVES;
let level = 1;
let maxLevel = 1;
let combo = 0;
let maxCombo = 0;
let highScore = Number(safeGet(HIGH_SCORE_KEY)) || 0;
let playTime = 0;
let stats = { caughtNormal: 0, caughtGold: 0 };
let feverTimer = 0;
let magnetTimer = 0;
let shield = false;

let challengeActive = false;
let challengeTimer = 0;
let challengeFlash = 0;
let feverFlash = 0;

let mission = null;
let missionCooldown = 0;
let missionTick = 0;

const player = { x: 0, y: 0, w: 76, h: 68, speed: 400 };
const input = { left: false, right: false };

let items = [];
let floaters = [];
let announcements = [];
let particles = [];
let rings = [];
let stars = [];
let spawnTimer = 0;
let shake = 0;
let hurtTimer = 0;
let lastTime = performance.now();

const audio = {
  ctx: null,
  enabled: (safeGet(SOUND_KEY) ?? '1') === '1',

  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      /* ignore */
    }
  },

  toggle() {
    this.enabled = !this.enabled;
    safeSet(SOUND_KEY, this.enabled ? '1' : '0');
    return this.enabled;
  },

  tone(freq, dur, type = 'sine', vol = 0.18, slideTo = null, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) {
      /* ignore */
    }
  },

  noise(dur, vol = 0.25, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const size = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < size; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / size);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(g).connect(this.ctx.destination);
      src.start(t0);
    } catch (e) {
      /* ignore */
    }
  },

  coin() {
    this.tone(880, 0.09, 'square', 0.1, 1320);
  },
  gold() {
    this.tone(660, 0.08, 'sine', 0.16);
    this.tone(880, 0.08, 'sine', 0.16, null, 0.07);
    this.tone(1320, 0.12, 'sine', 0.16, null, 0.14);
  },
  bomb() {
    this.tone(200, 0.35, 'sawtooth', 0.22, 40);
    this.noise(0.3, 0.28);
  },
  shieldBlock() {
    this.tone(520, 0.18, 'triangle', 0.2, 340);
  },
  item() {
    this.tone(620, 0.09, 'sine', 0.16);
    this.tone(930, 0.12, 'sine', 0.16, null, 0.09);
  },
  combo() {
    this.tone(740, 0.07, 'square', 0.1, 990);
  },
  fever() {
    this.tone(523, 0.1, 'sine', 0.18);
    this.tone(659, 0.1, 'sine', 0.18, null, 0.1);
    this.tone(784, 0.1, 'sine', 0.18, null, 0.2);
    this.tone(1046, 0.24, 'sine', 0.2, null, 0.3);
  },
  levelup() {
    this.tone(660, 0.09, 'triangle', 0.16);
    this.tone(880, 0.12, 'triangle', 0.16, null, 0.09);
  },
  challenge() {
    this.tone(440, 0.12, 'sawtooth', 0.16);
    this.tone(554, 0.12, 'sawtooth', 0.16, null, 0.12);
    this.tone(659, 0.16, 'sawtooth', 0.16, null, 0.24);
  },
  mission() {
    this.tone(880, 0.1, 'square', 0.14, 1320);
    this.tone(1320, 0.1, 'sine', 0.15, null, 0.1);
    this.tone(1760, 0.22, 'sine', 0.15, null, 0.2);
  },
  gameover() {
    this.tone(440, 0.25, 'sine', 0.2, 330);
    this.tone(330, 0.3, 'sine', 0.2, 220, 0.25);
  },
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* ignore */
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  player.x = player.x > 0 ? clamp(player.x, 26, W - 26) : W / 2;
  player.y = H - 52;

  stars = [];
  for (let i = 0; i < 46; i += 1) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2 + 0.6,
      p: Math.random() * Math.PI * 2,
      s: 0.4 + Math.random() * 0.9,
    });
  }
}

function renderHud() {
  scoreEl.textContent = score;
  highScoreEl.textContent = highScore;
  levelEl.textContent = level;
  livesEl.innerHTML = '❤️'.repeat(lives) + '🖤'.repeat(MAX_LIVES - lives);
}

function comboMultiplier() {
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  return 1;
}

function updateComboDisplay() {
  if (combo >= 2) {
    comboEl.classList.remove('hidden');
    let html = `COMBO <span class="combo-num">x${combo}</span>`;
    if (combo >= 10) html += '<span class="combo-mult x3">x3 分數</span>';
    else if (combo >= 5) html += '<span class="combo-mult x2">x2 分數</span>';
    if (feverTimer > 0) html += '<span class="combo-mult fever">FEVER x2</span>';
    comboEl.innerHTML = html;
  } else {
    comboEl.classList.add('hidden');
  }
}

function updateFxBadges() {
  challengeBadge.classList.toggle('hidden', !challengeActive);
  magnetBadge.classList.toggle('hidden', magnetTimer <= 0);
  feverBadge.classList.toggle('hidden', feverTimer <= 0);
  if (challengeActive) challengeBadge.textContent = `⚔️ 挑戰 ${Math.ceil(challengeTimer)}`;
  if (magnetTimer > 0) magnetBadge.textContent = `🧲 ${Math.ceil(magnetTimer)}`;
  if (feverTimer > 0) feverBadge.textContent = `🔥 Fever ${Math.ceil(feverTimer)}`;
  if (feverTimer > 0 || challengeActive) updateComboDisplay();
}

function showOverlay(title, desc, btnLabel, action) {
  overlayTitle.textContent = title;
  overlayDesc.innerHTML = desc;
  startBtn.textContent = btnLabel;
  overlay.dataset.action = action;
  difficultySelect.classList.toggle('hidden', action !== 'start');
  leaderboardEl.classList.toggle('hidden', action !== 'restart');
  overlay.classList.add('active');
}

function hideOverlay() {
  overlay.classList.remove('active');
}

function refreshPauseBtn() {
  pauseBtn.classList.toggle('hidden', state !== 'playing');
}

function updateDifficultyUI() {
  document.querySelectorAll('.df-buttons button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.difficulty === difficultyKey);
  });
}

function getLeaderboard() {
  try {
    const raw = JSON.parse(safeGet(LEADERBOARD_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e.score === 'number' && e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, LEADERBOARD_SIZE);
  } catch (e) {
    return [];
  }
}

function addLeaderboardEntry(scoreValue, levelValue) {
  if (!(scoreValue > 0)) return -1;
  const entry = { score: scoreValue, level: levelValue, at: Date.now() };
  const list = getLeaderboard();
  list.push(entry);
  const sorted = list.sort((a, b) => b.score - a.score).slice(0, LEADERBOARD_SIZE);
  try {
    safeSet(LEADERBOARD_KEY, JSON.stringify(sorted));
  } catch (e) {
    /* ignore */
  }
  return sorted.indexOf(entry);
}

function fillLeaderboard(highlightIndex = -1) {
  const list = getLeaderboard();
  if (!list.length) {
    leaderboardEl.innerHTML = '<div class="lb-title">🏆 排行榜</div><div class="lb-empty">還沒有紀錄</div>';
    return;
  }
  let html = '<div class="lb-title">🏆 排行榜</div><ol>';
  list.forEach((e, i) => {
    const cls = i === highlightIndex ? ' class="lb-highlight"' : '';
    html += `<li${cls}><span class="lb-rank">${i + 1}</span><span class="lb-score">${e.score}</span><span class="lb-level">Lv${e.level}</span></li>`;
  });
  html += '</ol>';
  leaderboardEl.innerHTML = html;
}

function setMenu() {
  state = 'menu';
  refreshPauseBtn();
  updateDifficultyUI();
  showOverlay(
    '接金幣',
    '用鍵盤 ← → 或螢幕左右按鈕移動角色<br />接住普通金幣 (+1)、黃金金幣 (+3)<br />小心炸彈！吃道具可獲得 <b>❤️生命</b> <b>🧲磁鐵</b> <b>🛡護盾</b><br />連段越高分數倍率越高，Combo 15 進入 FEVER！<br />等級 5 / 10 / 15 進入挑戰關卡，隨機任務等你完成！<br />按 P 暫停，或「🔊」按鈕控制音效。',
    '開始遊戲',
    'start'
  );
}

function startGame() {
  score = 0;
  lives = START_LIVES;
  level = 1;
  maxLevel = 1;
  combo = 0;
  maxCombo = 0;
  playTime = 0;
  stats = { caughtNormal: 0, caughtGold: 0 };
  feverTimer = 0;
  magnetTimer = 0;
  shield = false;
  challengeActive = false;
  challengeTimer = 0;
  challengeFlash = 0;
  feverFlash = 0;
  mission = null;
  missionCooldown = 1.5;
  missionTick = 0;
  items = [];
  floaters = [];
  announcements = [];
  particles = [];
  rings = [];
  spawnTimer = 0.45;
  shake = 0;
  hurtTimer = 0;
  player.x = W / 2;
  hideOverlay();
  renderHud();
  updateComboDisplay();
  updateFxBadges();
  renderMission();
  refreshPauseBtn();
  state = 'playing';
}

function gameOver() {
  state = 'gameover';
  const isRecord = score > highScore && score > 0;
  if (isRecord) highScore = score;
  safeSet(HIGH_SCORE_KEY, String(highScore));
  renderHud();
  updateFxBadges();
  refreshPauseBtn();
  audio.gameover();

  const rank = addLeaderboardEntry(score, maxLevel);
  fillLeaderboard(rank);

  const mm = Math.floor(playTime / 60);
  const ss = String(Math.floor(playTime % 60)).padStart(2, '0');
  const recordLine = isRecord ? '<br />🎉 新紀錄！' : '';
  showOverlay(
    '遊戲結束',
    `本次分數 <b>${score}</b>${recordLine}` +
      `<div class="stat-line">最高分 <b>${highScore}</b><br />` +
      `難度 <b>${difficulty.label}</b> ｜ 接到金幣：普通 <b>x${stats.caughtNormal}</b> 黃金 <b>x${stats.caughtGold}</b><br />` +
      `最高 Combo：<b>x${maxCombo}</b><br />` +
      `最高 Level：<b>${maxLevel}</b><br />` +
      `遊玩時間：<b>${mm}:${ss}</b></div>`,
    '再玩一次',
    'restart'
  );
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  refreshPauseBtn();
  showOverlay('暫停', '按 <b>P</b> 或點擊「繼續」恢復遊戲', '繼續', 'resume');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  hideOverlay();
  refreshPauseBtn();
}

function pickItemType() {
  if (challengeActive) return Math.random() < 0.78 ? 'coin' : 'gold';
  const bombProb = Math.min(0.05 + (level - 1) * 0.0125, 0.15) * difficulty.bombMult;
  const goldProb = 0.055;
  const heartProb = 0.035 * difficulty.heartMult;
  const magnetProb = 0.035;
  const shieldProb = 0.035;
  const p = Math.random();
  if (p < bombProb) return 'bomb';
  if (p < bombProb + goldProb) return 'gold';
  if (p < bombProb + goldProb + heartProb) return 'heart';
  if (p < bombProb + goldProb + heartProb + magnetProb) return 'magnet';
  if (p < bombProb + goldProb + heartProb + magnetProb + shieldProb) return 'shield';
  return 'coin';
}

function itemRadius(type) {
  switch (type) {
    case 'gold':
      return 17;
    case 'bomb':
      return 18;
    case 'heart':
    case 'magnet':
    case 'shield':
      return 16;
    default:
      return 15;
  }
}

function itemSpeed(type) {
  const base = Math.min(180 + (level - 1) * 26, 520) * difficulty.fallMult;
  let v = base * (0.9 + Math.random() * 0.25);
  if (type === 'heart') v *= 0.8;
  if (type === 'magnet' || type === 'shield') v *= 0.85;
  if (type === 'bomb') v *= 1.1;
  return v;
}

function spawnItem(type = null) {
  const t = type || pickItemType();
  const r = itemRadius(t);
  items.push({
    type: t,
    x: r + Math.random() * (W - r * 2),
    y: -r - 6,
    r,
    vy: itemSpeed(t),
    phase: Math.random() * Math.PI * 2,
  });
}

function spawnInterval() {
  let iv = Math.max(0.9 - (level - 1) * 0.055, 0.3) * difficulty.spawnMult;
  if (feverTimer > 0) iv *= 0.55;
  if (challengeActive) iv *= 0.45;
  return iv * (0.85 + Math.random() * 0.3);
}

function addFloater(x, y, text, color = '#ffe98a', size = 18) {
  floaters.push({ x, y, text, color, size, t: 0 });
}

function announce(text, color, size = 42, dur = 1.2) {
  announcements.push({ text, color, size, t: 0, dur });
}

function spawnBurst(x, y, color, n = 18, speed = 180, dur = 0.6) {
  for (let i = 0; i < n; i += 1) {
    const ang = Math.random() * Math.PI * 2;
    const sp = rand(speed * 0.3, speed);
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: rand(2, 4.5),
      color,
      t: 0,
      dur: dur * (0.7 + Math.random() * 0.6),
    });
  }
}

function spawnRing(x, y, color, r0 = 10, vr = 280, dur = 0.5, width = 4) {
  rings.push({ x, y, color, r: r0, vr, dur, t: 0, width });
}

function addScore(points, x, y) {
  score += points;
  if (score > highScore) highScore = score;
  renderHud();

  const newLevel = Math.floor(score / LEVEL_SCORE) + 1;
  if (newLevel > level) {
    level = newLevel;
    maxLevel = Math.max(maxLevel, level);
    audio.levelup();
    announce('LEVEL UP!', '#ffd23f', 44);
    spawnBurst(player.x, player.y, '#ffd23f', 26, 230);
    spawnRing(player.x, player.y - 6, '#ffd23f', 14, 320, 0.6, 5);
    shake = Math.max(shake, 7);
    if (CHALLENGE_LEVELS.has(level)) startChallenge();
    updateFxBadges();
  }
}

function incrementCombo() {
  combo += 1;
  maxCombo = Math.max(maxCombo, combo);
  if (mission && mission.type === 'combo_x') {
    mission.maxComboSeen = Math.max(mission.maxComboSeen, combo);
  }
  updateComboDisplay();
  if (combo % 15 === 0) {
    startFever();
  } else if (combo % 5 === 0) {
    audio.combo();
    announce(`COMBO x${combo}!`, '#34d399', 34);
    spawnBurst(player.x, player.y - 24, '#34d399', 16, 190);
    spawnRing(player.x, player.y - 6, '#34d399', 12, 260, 0.45, 4);
  }
}

function resetCombo() {
  if (combo >= 5) {
    addFloater(player.x, player.y - 70, 'COMBO 中斷', '#94a3b8', 15);
  }
  combo = 0;
  updateComboDisplay();
}

function startFever() {
  feverTimer = FEVER_DURATION;
  feverFlash = 0.6;
  audio.fever();
  announce('FEVER! x2', '#f97316', 50, 1.6);
  spawnBurst(W / 2, H / 2, '#f97316', 40, 270);
  spawnRing(W / 2, H / 2, '#f97316', 30, 420, 0.8, 7);
  spawnRing(W / 2, H / 2, '#ffd23f', 10, 300, 0.7, 5);
  shake = Math.max(shake, 5);
  updateFxBadges();
}

function startChallenge() {
  challengeActive = true;
  challengeTimer = CHALLENGE_DURATION;
  challengeFlash = 0.6;
  audio.challenge();
  announce('CHALLENGE STAGE!', '#22d3ee', 46, 1.6);
  spawnBurst(W / 2, H / 2, '#22d3ee', 34, 250);
  spawnRing(W / 2, H / 2, '#22d3ee', 30, 420, 0.8, 6);
  updateFxBadges();
}

function endChallenge() {
  challengeActive = false;
  audio.mission();
  announce('挑戰完成! +30', '#22d3ee', 34);
  spawnBurst(W / 2, H * 0.3, '#22d3ee', 26, 220);
  addScore(30, W / 2, H * 0.3);
  updateFxBadges();
}

function hitBomb(it) {
  spawnBurst(it.x, it.y, '#ef4444', 22, 210);
  spawnRing(it.x, it.y, '#ef4444', 10, 260, 0.45, 5);
  if (shield) {
    shield = false;
    audio.shieldBlock();
    shake = 6;
    addFloater(it.x, it.y, '護盾擋住!', '#60a5fa', 20);
  } else {
    lives -= 1;
    hurtTimer = 0.4;
    shake = 16;
    audio.bomb();
    resetCombo();
    renderHud();
    if (lives <= 0) {
      gameOver();
    }
  }
}

function catchCoin(it) {
  if (it.type === 'gold') {
    stats.caughtGold += 1;
    audio.gold();
  } else {
    stats.caughtNormal += 1;
    audio.coin();
  }
  incrementCombo();
  const feverMult = feverTimer > 0 ? 2 : 1;
  let gained = (it.type === 'gold' ? 3 : 1) * comboMultiplier() * feverMult;
  if (challengeActive) gained += 2;
  addFloater(it.x, it.y - it.r, `+${gained}`, it.type === 'gold' ? '#ffd23f' : '#ffe98a', it.type === 'gold' ? 22 : 18);
  spawnBurst(it.x, it.y, it.type === 'gold' ? '#ffd23f' : '#ffe98a', it.type === 'gold' ? 12 : 6, 140, 0.4);
  addScore(gained, it.x, it.y);
}

function catchItem(it) {
  audio.item();
  const colors = { heart: '#fda4af', magnet: '#2dd4bf', shield: '#60a5fa' };
  spawnBurst(it.x, it.y, colors[it.type] || '#fff', 14, 170, 0.5);
  spawnRing(it.x, it.y, colors[it.type] || '#fff', 8, 220, 0.4, 4);
  if (it.type === 'heart') {
    if (lives < MAX_LIVES) {
      lives += 1;
      renderHud();
      addFloater(it.x, it.y - it.r, '生命 +1', '#fda4af', 20);
    } else {
      addScore(2, it.x, it.y);
      addFloater(it.x, it.y - it.r, '生命已滿 +2', '#fda4af', 18);
    }
  } else if (it.type === 'magnet') {
    magnetTimer = MAGNET_DURATION;
    addFloater(it.x, it.y - it.r, '磁鐵!', '#2dd4bf', 22);
    updateFxBadges();
  } else if (it.type === 'shield') {
    shield = true;
    addFloater(it.x, it.y - it.r, '護盾!', '#60a5fa', 22);
  }
}

function randomMission() {
  const prev = mission ? mission.type : null;
  const types = ['normal_coins', 'gold_coins', 'combo_x', 'score_30s'].filter((t) => t !== prev);
  const type = types[Math.floor(Math.random() * types.length)];
  if (type === 'normal_coins') {
    mission = { type, target: 10, startValue: stats.caughtNormal };
  } else if (type === 'gold_coins') {
    mission = { type, target: 2, startValue: stats.caughtGold };
  } else if (type === 'combo_x') {
    mission = { type, target: 10, startValue: 0, maxComboSeen: 0 };
  } else {
    mission = { type, target: 20, startScore: score, startValue: 0, timer: 30 };
  }
  renderMission();
}

function missionProgress() {
  if (!mission) return 0;
  if (mission.type === 'normal_coins') {
    return clamp(stats.caughtNormal - mission.startValue, 0, mission.target);
  }
  if (mission.type === 'gold_coins') {
    return clamp(stats.caughtGold - mission.startValue, 0, mission.target);
  }
  if (mission.type === 'combo_x') {
    return clamp(mission.maxComboSeen || 0, 0, mission.target);
  }
  return clamp(score - mission.startScore, 0, mission.target);
}

function missionDesc() {
  if (!mission) return '';
  if (mission.type === 'normal_coins') return `接到 ${mission.target} 個普通金幣`;
  if (mission.type === 'gold_coins') return `接到 ${mission.target} 個黃金金幣`;
  if (mission.type === 'combo_x') return `Combo 達到 x${mission.target}`;
  return `${Math.max(0, Math.ceil(mission.timer))} 秒內獲得 ${mission.target} 分`;
}

function renderMission() {
  if (!mission) {
    missionCard.classList.add('hidden');
    return;
  }
  missionCard.classList.remove('hidden');
  const prog = missionProgress();
  const pct = Math.round((prog / mission.target) * 100);
  missionReward.textContent = `+${MISSION_BONUS[mission.type]}`;
  missionText.textContent = missionDesc();
  missionFill.style.width = `${pct}%`;
  missionCountNum.textContent = `${prog}/${mission.target}`;
  missionTime.textContent = mission.type === 'score_30s' ? `剩 ${Math.max(0, Math.ceil(mission.timer))}s` : '';
}

function checkMission() {
  if (!mission || state !== 'playing') return;
  const prog = missionProgress();
  if (prog >= mission.target) {
    const bonus = MISSION_BONUS[mission.type];
    const color = '#a78bfa';
    mission = null;
    audio.mission();
    announce('任務完成!', color, 38);
    addFloater(W / 2, H * 0.3, `獎勵 +${bonus}`, color, 22);
    spawnBurst(W / 2, H * 0.3, color, 28, 230);
    spawnRing(W / 2, H * 0.3, color, 20, 340, 0.7, 5);
    addScore(bonus, W / 2, H * 0.3);
    missionCooldown = 4;
    renderMission();
  } else if (mission.type === 'score_30s' && mission.timer <= 0) {
    announce('任務失敗', '#94a3b8', 26);
    mission = null;
    missionCooldown = 4;
    renderMission();
  }
}

function update(dt) {
  hurtTimer = Math.max(0, hurtTimer - dt);
  shake = Math.max(0, shake - 34 * dt);
  feverFlash = Math.max(0, feverFlash - dt);
  challengeFlash = Math.max(0, challengeFlash - dt);

  if (feverTimer > 0) {
    feverTimer = Math.max(0, feverTimer - dt);
    if (feverTimer === 0) updateFxBadges();
  }
  if (magnetTimer > 0) {
    magnetTimer = Math.max(0, magnetTimer - dt);
    updateFxBadges();
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 130 * dt;
    if (p.t > p.dur) particles.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    const r = rings[i];
    r.t += dt;
    r.r += r.vr * dt;
    if (r.t > r.dur) rings.splice(i, 1);
  }
  for (let i = announcements.length - 1; i >= 0; i -= 1) {
    const a = announcements[i];
    a.t += dt;
    if (a.t > a.dur) announcements.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i -= 1) {
    const f = floaters[i];
    f.y -= 42 * dt;
    f.t += dt;
    if (f.t > 0.9) floaters.splice(i, 1);
  }

  if (state !== 'playing') return;

  playTime += dt;

  if (challengeActive) {
    challengeTimer = Math.max(0, challengeTimer - dt);
    updateFxBadges();
    if (challengeTimer === 0) endChallenge();
  }

  if (mission && mission.type === 'score_30s') {
    mission.timer = Math.max(0, mission.timer - dt);
  }

  missionTick -= dt;
  if (missionTick <= 0) {
    missionTick = 0.12;
    renderMission();
  }

  if (missionCooldown > 0) {
    missionCooldown = Math.max(0, missionCooldown - dt);
    if (missionCooldown === 0 && !mission) randomMission();
  }

  checkMission();

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnItem();
    if (feverTimer > 0 && Math.random() < 0.45) spawnItem('coin');
    if (challengeActive && Math.random() < 0.5) spawnItem('coin');
    spawnTimer = spawnInterval();
  }

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  player.x += dir * player.speed * dt;
  player.x = clamp(player.x, 26, W - 26);

  const cy = player.y - 14;
  const catchR = 26;

  for (let i = items.length - 1; i >= 0; i -= 1) {
    const it = items[i];

    if (magnetTimer > 0 && (it.type === 'coin' || it.type === 'gold')) {
      const dx = player.x - it.x;
      const dy = cy - it.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1 && dist < 300) {
        const pull = 470;
        it.x += (dx / dist) * pull * dt;
        it.y += (dy / dist) * pull * dt;
      } else {
        it.y += it.vy * dt;
      }
    } else {
      it.y += it.vy * dt;
    }
    it.phase += dt * 5;

    const dx = it.x - player.x;
    const dy = it.y - cy;
    const rr = it.r + catchR;
    if (dx * dx + dy * dy <= rr * rr) {
      items.splice(i, 1);
      if (it.type === 'bomb') hitBomb(it);
      else if (it.type === 'coin' || it.type === 'gold') catchCoin(it);
      else catchItem(it);
      continue;
    }

    if (it.y - it.r > H) {
      items.splice(i, 1);
      if (it.type === 'coin' || it.type === 'gold') resetCombo();
    }
  }
}

function drawCoinShape(x, y, r, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(255, 200, 40, 0.8)';
  ctx.shadowBlur = 14;
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
  g.addColorStop(0, '#ffe98a');
  g.addColorStop(0.55, '#ffd23f');
  g.addColorStop(1, '#e0a006');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(160, 108, 0, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#a87106';
  ctx.font = `bold ${r * 1.1 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', 0, 1);
  ctx.restore();
}

function drawCoin(it) {
  const scale = 1 + Math.sin(it.phase) * 0.06;
  drawCoinShape(it.x, it.y, it.r, scale);
}

function drawGold(it) {
  const pulse = 0.7 + 0.3 * Math.sin(it.phase * 1.6);
  ctx.save();
  ctx.translate(it.x, it.y);

  const beam = ctx.createLinearGradient(0, -70, 0, 0);
  beam.addColorStop(0, 'rgba(255, 220, 120, 0)');
  beam.addColorStop(1, `rgba(255, 220, 120, ${0.28 * pulse})`);
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(-14, -70);
  ctx.lineTo(14, -70);
  ctx.lineTo(8, 0);
  ctx.lineTo(-8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const scale = 1 + Math.sin(it.phase) * 0.08;
  const r = it.r * scale;
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.shadowColor = 'rgba(255, 230, 90, 0.95)';
  ctx.shadowBlur = 24;
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(0.5, '#ffe873');
  g.addColorStop(1, '#f0a800');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#7c4d00';
  ctx.font = `bold ${r * 1.15}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 0, 1);
  ctx.restore();
}

function drawBomb(it) {
  const flicker = Math.random() * 0.3;
  ctx.save();
  ctx.translate(it.x, it.y);

  ctx.shadowColor = `rgba(255, 80, 50, ${0.6 + flicker})`;
  ctx.shadowBlur = 18;
  const g = ctx.createRadialGradient(-it.r * 0.3, -it.r * 0.3, it.r * 0.15, 0, 0, it.r);
  g.addColorStop(0, '#3a3f4b');
  g.addColorStop(0.8, '#131722');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, it.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255, 70, 50, 0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, it.r + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffd23f';
  ctx.font = `bold ${it.r * 1.25}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💣', 0, 0);

  const sx = Math.sin(it.phase * 2) * 4;
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -it.r + 1);
  ctx.lineTo(sx, -it.r - 7);
  ctx.stroke();

  ctx.shadowColor = 'rgba(255, 180, 40, 0.9)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(sx, -it.r - 8, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawHeartItem(it) {
  const s = it.r / 16;
  ctx.save();
  ctx.translate(it.x, it.y + 1);
  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(244, 63, 94, 0.9)';
  ctx.shadowBlur = 16;
  const g = ctx.createLinearGradient(0, -12, 0, 12);
  g.addColorStop(0, '#fb7185');
  g.addColorStop(1, '#e11d48');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 11);
  ctx.bezierCurveTo(-13, 0, -12, -9, -6, -13);
  ctx.bezierCurveTo(-1.5, -16, 0, -11, 0, -11);
  ctx.bezierCurveTo(0, -11, 1.5, -16, 6, -13);
  ctx.bezierCurveTo(12, -9, 13, 0, 0, 11);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.arc(-4, -7, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMagnetItem(it) {
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.shadowColor = 'rgba(45, 212, 191, 0.9)';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-9, -15);
  ctx.lineTo(-9, 3);
  ctx.arc(0, 3, 9, Math.PI, 0, false);
  ctx.lineTo(9, -15);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.rect(-12, -17, 6, 6);
  ctx.rect(6, -17, 6, 6);
  ctx.fill();
  ctx.restore();
}

function drawShieldItem(it) {
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.shadowColor = 'rgba(96, 165, 250, 0.95)';
  ctx.shadowBlur = 16;
  const g = ctx.createLinearGradient(0, -16, 0, 16);
  g.addColorStop(0, '#93c5fd');
  g.addColorStop(1, '#2563eb');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(-13, -4);
  ctx.lineTo(0, 15);
  ctx.lineTo(13, -4);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#dbeafe';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 0, -1);
  ctx.restore();
}

function drawItem(it) {
  switch (it.type) {
    case 'gold':
      drawGold(it);
      break;
    case 'bomb':
      drawBomb(it);
      break;
    case 'heart':
      drawHeartItem(it);
      break;
    case 'magnet':
      drawMagnetItem(it);
      break;
    case 'shield':
      drawShieldItem(it);
      break;
    default:
      drawCoin(it);
  }
}

function drawPlayer() {
  const px = player.x;
  const py = player.y;
  const w = player.w;
  const h = player.h;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const bx = px - w / 2;
  const by = py - h / 2;

  if (magnetTimer > 0) {
    const pulse = 0.35 + 0.25 * Math.sin(performance.now() * 0.01);
    ctx.strokeStyle = `rgba(45, 212, 191, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py - 6, 130, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (shield) {
    const pulse = 0.5 + 0.3 * Math.sin(performance.now() * 0.009);
    ctx.save();
    ctx.shadowColor = 'rgba(96, 165, 250, 0.9)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = `rgba(147, 197, 253, ${0.55 + 0.3 * pulse})`;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(px, py - 6, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(px, py + h * 0.42, w * 0.36, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffa357';
  ctx.beginPath();
  ctx.ellipse(px - w * 0.24, py + h * 0.43, w * 0.17, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(px + w * 0.24, py + h * 0.43, w * 0.17, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createLinearGradient(bx, by, bx, by + h);
  g.addColorStop(0, '#67e8f9');
  g.addColorStop(1, '#22b8cf');
  ctx.fillStyle = g;
  roundRect(ctx, bx, by, w, h, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8, 51, 68, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  roundRect(ctx, bx + w * 0.16, by + h * 0.3, w * 0.68, h * 0.42, 16);
  ctx.fill();

  ctx.fillStyle = '#083b4c';
  roundRect(ctx, px - w * 0.3, by - h * 0.08, w * 0.6, h * 0.26, 12);
  ctx.fill();
  ctx.strokeStyle = '#0b6b82';
  ctx.lineWidth = 3;
  roundRect(ctx, px - w * 0.3, by - h * 0.08, w * 0.6, h * 0.26, 12);
  ctx.stroke();

  const ex = px + dir * 3;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ex - 13, py - 4, 7.5, 0, Math.PI * 2);
  ctx.arc(ex + 13, py - 4, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(ex - 12 + dir * 2, py - 3.5, 3.4, 0, Math.PI * 2);
  ctx.arc(ex + 14 + dir * 2, py - 3.5, 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 138, 138, 0.6)';
  ctx.beginPath();
  ctx.arc(ex - 20, py + 6, 4.5, 0, Math.PI * 2);
  ctx.arc(ex + 20, py + 6, 4.5, 0, Math.PI * 2);
  ctx.fill();
}

function renderAnnouncements() {
  for (const a of announcements) {
    const pop = Math.min(1, a.t / 0.15);
    const scaleIn = 0.6 + 0.4 * pop;
    const alpha = 1 - a.t / a.dur;
    const wobble = Math.sin(a.t * 14) * 0.02;
    ctx.save();
    ctx.translate(W / 2, H * 0.3);
    ctx.scale(scaleIn + wobble, scaleIn - wobble);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `900 ${a.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = a.color;
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(a.text, 0, 0);
    ctx.fillStyle = a.color;
    ctx.fillText(a.text, 0, 0);
    ctx.restore();
  }
}

function render(now) {
  let sx = 0;
  let sy = 0;
  if (shake > 0) {
    sx = (Math.random() - 0.5) * shake;
    sy = (Math.random() - 0.5) * shake;
  }

  ctx.save();
  ctx.translate(sx, sy);

  ctx.clearRect(-20, -20, W + 40, H + 40);

  const bg = ctx.createLinearGradient(0, -20, 0, H);
  bg.addColorStop(0, '#0f1730');
  bg.addColorStop(1, '#1e1440');
  ctx.fillStyle = bg;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  for (const s of stars) {
    const a = 0.22 + 0.25 * Math.sin(now * 0.001 * s.s + s.p);
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(139, 92, 246, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - 12);
  ctx.lineTo(W, H - 12);
  ctx.stroke();

  if (feverTimer > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);
    const fg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.75);
    fg.addColorStop(0, 'rgba(255, 190, 60, 0)');
    fg.addColorStop(1, `rgba(255, 150, 40, ${0.14 + 0.1 * pulse})`);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 5; i += 1) {
      const y = ((now * 0.06 + i * 0.26) % 1.3 - 0.15) * H;
      ctx.strokeStyle = `rgba(255, 220, 130, ${0.08 + 0.07 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W * 0.1 + i * W * 0.06, y - 90);
      ctx.quadraticCurveTo(W * 0.3 + i * W * 0.08, y, W * 0.15 + i * W * 0.1, y + 90);
      ctx.stroke();
    }
  }

  if (challengeActive) {
    const cp = 0.5 + 0.5 * Math.sin(now * 0.02);
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.22 + 0.2 * cp})`;
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.strokeStyle = `rgba(103, 232, 249, ${0.12 + 0.1 * cp})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, W - 36, H - 36);

    const cg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    cg.addColorStop(0, 'rgba(34, 211, 238, 0)');
    cg.addColorStop(1, `rgba(34, 211, 238, ${0.08 + 0.06 * cp})`);
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);
  }

  for (const it of items) drawItem(it);
  drawPlayer();

  for (const r of rings) {
    const a = 1 - r.t / r.dur;
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = Math.max(0, a);
    ctx.lineWidth = Math.max(0.5, r.width * a);
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const p of particles) {
    const a = 1 - p.t / p.dur;
    ctx.globalAlpha = Math.max(0, a);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (const f of floaters) {
    const a = 1 - f.t / 0.9;
    ctx.font = `800 ${f.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.45})`;
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  ctx.shadowBlur = 0;

  renderAnnouncements();

  if (feverFlash > 0) {
    ctx.fillStyle = `rgba(255, 180, 60, ${feverFlash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (challengeFlash > 0) {
    ctx.fillStyle = `rgba(34, 170, 210, ${challengeFlash * 0.3})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (hurtTimer > 0) {
    ctx.fillStyle = `rgba(239, 68, 68, ${hurtTimer * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  render(now);
  requestAnimationFrame(loop);
}

function bindPointer(btn, key) {
  const press = (v) => (e) => {
    e.preventDefault();
    input[key] = v;
  };
  btn.addEventListener('pointerdown', press(true));
  btn.addEventListener('pointerup', press(false));
  btn.addEventListener('pointercancel', press(false));
  btn.addEventListener('pointerleave', press(false));
}

window.addEventListener('resize', resize);

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft') {
    input.left = true;
    e.preventDefault();
  } else if (e.code === 'ArrowRight') {
    input.right = true;
    e.preventDefault();
  } else if (e.code === 'KeyP') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
    e.preventDefault();
  } else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'menu' || state === 'gameover') startGame();
    else if (state === 'paused') resumeGame();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') input.left = false;
  else if (e.code === 'ArrowRight') input.right = false;
});

window.addEventListener('blur', () => {
  input.left = false;
  input.right = false;
});

document.querySelectorAll('.df-buttons button').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    difficultyKey = btn.dataset.difficulty;
    difficulty = DIFFICULTIES[difficultyKey] || DIFFICULTIES.normal;
    safeSet(DIFFICULTY_KEY, difficultyKey);
    updateDifficultyUI();
  });
});

startBtn.addEventListener('click', () => {
  audio.init();
  const action = overlay.dataset.action || 'start';
  if (action === 'resume') resumeGame();
  else startGame();
});

pauseBtn.addEventListener('click', () => {
  audio.init();
  pauseGame();
});

soundBtn.addEventListener('click', () => {
  audio.init();
  audio.toggle();
  soundBtn.textContent = audio.enabled ? '🔊' : '🔇';
});

function primeAudio() {
  audio.init();
  window.removeEventListener('pointerdown', primeAudio);
  window.removeEventListener('keydown', primeAudio);
}
window.addEventListener('pointerdown', primeAudio);
window.addEventListener('keydown', primeAudio);

bindPointer(leftBtn, 'left');
bindPointer(rightBtn, 'right');

soundBtn.textContent = audio.enabled ? '🔊' : '🔇';

resize();
renderHud();
updateComboDisplay();
updateFxBadges();
setMenu();
requestAnimationFrame(loop);