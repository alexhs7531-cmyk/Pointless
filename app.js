/* ============================================================
   POINTLESS — Family Edition
   Single script powering both the host window and any
   popped-out display windows (index.html?view=display).
   ============================================================ */

(() => {
'use strict';

/* ---------------------------------------------------------- */
/* Utilities                                                    */
/* ---------------------------------------------------------- */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const deep = (o) => JSON.parse(JSON.stringify(o));
const uid = () => 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const IS_DISPLAY = (() => {
  try { return new URLSearchParams(location.search).get('view') === 'display'; }
  catch (e) { return false; }
})();

/* ---------------------------------------------------------- */
/* State & persistence                                          */
/* ---------------------------------------------------------- */

const STORE_KEY = 'pointless-family-v1';

function sampleQuestions() {
  return [
    {
      id: uid(), text: "Countries that have won the men's football World Cup",
      answers: [
        { text: 'Brazil', score: 71 }, { text: 'England', score: 65 },
        { text: 'Germany', score: 52 }, { text: 'France', score: 58 },
        { text: 'Argentina', score: 60 }, { text: 'Italy', score: 38 },
        { text: 'Spain', score: 41 }, { text: 'Uruguay', score: 12 }
      ]
    },
    {
      id: uid(), text: 'Actors who have played James Bond in the official films',
      answers: [
        { text: 'Sean Connery', score: 68 }, { text: 'Roger Moore', score: 54 },
        { text: 'Daniel Craig', score: 79 }, { text: 'Pierce Brosnan', score: 47 },
        { text: 'Timothy Dalton', score: 15 }, { text: 'George Lazenby', score: 0 }
      ]
    },
    {
      id: uid(), text: 'Planets in our solar system',
      answers: [
        { text: 'Earth', score: 84 }, { text: 'Mars', score: 76 },
        { text: 'Jupiter', score: 58 }, { text: 'Saturn', score: 55 },
        { text: 'Venus', score: 41 }, { text: 'Mercury', score: 39 },
        { text: 'Neptune', score: 27 }, { text: 'Uranus', score: 24 }
      ]
    },
    {
      id: uid(), text: 'UK Prime Ministers since 1990',
      answers: [
        { text: 'Tony Blair', score: 74 }, { text: 'Boris Johnson', score: 66 },
        { text: 'Keir Starmer', score: 63 }, { text: 'David Cameron', score: 59 },
        { text: 'Rishi Sunak', score: 57 }, { text: 'Theresa May', score: 51 },
        { text: 'Gordon Brown', score: 45 }, { text: 'John Major', score: 40 },
        { text: 'Liz Truss', score: 32 }
      ]
    },
    {
      id: uid(), text: 'Colours of the rainbow',
      answers: [
        { text: 'Red', score: 88 }, { text: 'Blue', score: 83 },
        { text: 'Green', score: 81 }, { text: 'Yellow', score: 79 },
        { text: 'Orange', score: 74 }, { text: 'Violet', score: 35 },
        { text: 'Indigo', score: 22 }
      ]
    }
  ];
}

function defaultState() {
  return {
    version: 1,
    settings: { tickMs: 75, sound: true, blur: false, suspense: true },
    players: [
      { name: 'Player 1', total: 0 },
      { name: 'Player 2', total: 0 }
    ],
    questions: sampleQuestions(),
    playedIds: [],
    roundNumber: 1,
    game: null,       // live round, see actPlay()
    over: false,
    ui: { showAll: false }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.players) || !Array.isArray(s.questions)) return null;
    s.ui = { showAll: false };
    s.settings = Object.assign({ tickMs: 75, sound: true, blur: false, suspense: true }, s.settings || {});
    return s;
  } catch (e) { return null; }
}

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

let state = loadState() || defaultState();
saveState();

const snapshots = [];   // undo stack (controller only)

/* ---------------------------------------------------------- */
/* Cross-window sync                                            */
/* ---------------------------------------------------------- */

const chan = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('pointless-family-sync') : null;

function send(msg) { if (chan) { try { chan.postMessage(msg); } catch (e) {} } }

if (chan) {
  chan.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type === 'hello' && !IS_DISPLAY) {
      // A display window just opened — send it the current state.
      send({ type: 'action', state: deep(state), ev: { t: 'soft' } });
    } else if (msg.type === 'action' && IS_DISPLAY) {
      if (msg.state) state = msg.state;
      if (msg.ev) enqueue(msg.ev);
    }
  };
}

/** Controller helper: persist, mirror to displays, run the event locally. */
function commit(ev) {
  saveState();
  send({ type: 'action', state: deep(state), ev: deep(ev) });
  enqueue(ev);
}

/* ---------------------------------------------------------- */
/* Sound effects (all synthesised — no audio files needed)      */
/* ---------------------------------------------------------- */

let localMuted = false;
try { localMuted = sessionStorage.getItem('pl-muted') === '1'; } catch (e) {}

const sfx = {
  ctx: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) { this.ctx = null; }
  },
  ok() { return this.ctx && state.settings.sound && !localMuted; },
  tone(freq, dur, type, gain, delay, slideTo) {
    if (!this.ok()) return;
    try {
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.1, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) {}
  },
  tick(value) {
    // Pizzicato-style pluck that falls in pitch as the number drops.
    this.tone(560 + value * 4.4, 0.07, 'triangle', 0.07);
  },
  land() {
    this.tone(240, 0.22, 'sine', 0.18);
    this.tone(170, 0.30, 'sine', 0.16, 0.05);
  },
  wrong() {
    this.tone(210, 0.55, 'sawtooth', 0.16, 0, 88);
    this.tone(105, 0.55, 'square', 0.10, 0.02, 60);
  },
  pointless() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.34, 'triangle', 0.13, i * 0.11));
    this.tone(1567.98, 0.7, 'sine', 0.07, notes.length * 0.11);
    this.tone(1046.5, 0.9, 'triangle', 0.09, notes.length * 0.11);
  },
  whoosh() {
    this.tone(180, 0.28, 'sine', 0.08, 0, 640);
  },
  bank() {
    this.tone(392, 0.16, 'triangle', 0.10);
    this.tone(523.25, 0.22, 'triangle', 0.10, 0.10);
  },
  fanfare() {
    [523.25, 523.25, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this.tone(f, 0.26, 'triangle', 0.12, i * 0.14));
  }
};

/* ---------------------------------------------------------- */
/* Stage element refs & scaling                                 */
/* ---------------------------------------------------------- */

const el = {};
function grabEls() {
  ['stage', 'stars', 'beams', 'tower', 'towerOval', 'towerValue', 'towerFill',
   'pointlessLetters', 'boardScreen', 'idleWrap', 'qLozenge', 'qText',
   'answerBlock', 'answerTag', 'answerText', 'promptLine', 'bigMsg',
   'allAnswers', 'allAnswersRows', 'podiumRow', 'stageFlash',
   'hostToggle', 'hostDrawer', 'drawerClose', 'toast', 'soundGate']
    .forEach(id => { el[id] = document.getElementById(id); });
}

function fitStage() {
  const iw = window.innerWidth, ih = window.innerHeight;
  let availH = ih;
  if (!IS_DISPLAY && el.hostDrawer && el.hostDrawer.classList.contains('open')) {
    availH = ih - Math.max(ih * 0.47, 340);
  }
  const s = Math.max(0.05, Math.min(iw / 1600, availH / 900) * 0.985);
  el.stage.style.left = '50%';
  el.stage.style.top = (availH / 2) + 'px';
  el.stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
}

function buildBackground() {
  // Random starfield
  let stars = '';
  for (let i = 0; i < 55; i++) {
    const x = Math.random() * 100, y = Math.random() * 60;
    const d = (Math.random() * 3).toFixed(2);
    const sc = (0.5 + Math.random()).toFixed(2);
    stars += '<span style="left:' + x + '%;top:' + y + '%;animation-delay:' + d +
             's;transform:scale(' + sc + ')"></span>';
  }
  el.stars.innerHTML = stars;
  // Uplighter beams along the floor
  let beams = '';
  [6, 15, 24, 33, 42, 88, 95].forEach((x, i) => {
    beams += '<span style="left:' + x + '%;animation-delay:' + (i * 0.7) + 's"></span>';
  });
  el.beams.innerHTML = beams;
  // POINTLESS letters inside the shaft (hidden until a pointless answer)
  el.pointlessLetters.innerHTML = 'POINTLESS'.split('')
    .map(c => '<span>' + c + '</span>').join('');
}

/* ---------------------------------------------------------- */
/* Tower                                                        */
/* ---------------------------------------------------------- */

let towerAnimId = null;

function towerValueSet(v) { el.towerValue.textContent = v; }
function towerLevelSet(v) { el.towerFill.style.height = clamp(v, 0, 100) + '%'; }

function towerClearStates() {
  el.tower.classList.remove('wrong', 'zero');
  $$('.pointless-letters span', el.tower).forEach(s => s.classList.remove('on'));
  if (towerAnimId) { cancelAnimationFrame(towerAnimId); towerAnimId = null; }
}

function towerReset() {
  towerClearStates();
  towerValueSet(100);
  towerLevelSet(100);
}

function towerShowX() {
  towerClearStates();
  towerLevelSet(100);
  el.tower.classList.add('wrong');
  towerValueSet('✕');
}

function towerCountdown(target, tickMs, suspense, done) {
  towerClearStates();
  towerValueSet(100);
  towerLevelSet(100);
  target = clamp(Math.round(target), 0, 100);
  const steps = 100 - target;
  if (steps <= 0) { sfx.land(); setTimeout(done, 700); return; }

  const base = clamp(tickMs || state.settings.tickMs || 75, 30, 220);

  // ── Suspense tuning ──────────────────────────────────────────
  // SUSPENSE_START : counter value where the ticks begin to slow.
  // SUSPENSE_MAX   : how many times slower than base the final
  //                  tick onto 0 is (19 × 75ms ≈ a 1.4s agoniser).
  // SUSPENSE_CURVE : ramp shape. 2 = gentle creep that bites hard
  //                  at the end (show-like). Lower (e.g. 1.4) makes
  //                  the slowdown obvious straight away at the start
  //                  value; higher (e.g. 3) saves it for the death.
  const SUSPENSE_START = 40;
  const SUSPENSE_MAX   = 8;
  const SUSPENSE_CURVE = 2.8;

  function suspMult(v) {
    if (v > SUSPENSE_START) return 1;
    const p = (SUSPENSE_START - v) / SUSPENSE_START;
    return 1 + (SUSPENSE_MAX - 1) * Math.pow(p, SUSPENSE_CURVE);
  }

  const durs = [];
  for (let v = 99; v >= target; v--) {
    durs.push(base * (suspense ? suspMult(v) : 1));
  }
  const cum = [0];
  for (let i = 0; i < durs.length; i++) cum.push(cum[i] + durs[i]);
  const total = cum[cum.length - 1];

  let startT = null;
  let idx = 0;        // completed steps
  let shown = 100;

  function frame(now) {
    if (startT === null) startT = now;
    const t = Math.min(now - startT, total);
    while (idx < durs.length && t >= cum[idx + 1]) {
      idx++;
      const v = 100 - idx;
      if (v < shown) { shown = v; towerValueSet(v); sfx.tick(v); }
    }
    if (t >= total) {
      towerAnimId = null;
      towerValueSet(target);
      towerLevelSet(target);
      if (target > 0) sfx.land();
      done();
      return;
    }
    const frac = (t - cum[idx]) / durs[idx];
    towerLevelSet((100 - idx) - frac);
    towerAnimId = requestAnimationFrame(frame);
  }
  towerAnimId = requestAnimationFrame(frame);
}

function towerPointless(done) {
  el.tower.classList.add('zero');
  sfx.pointless();
  if (el.stageFlash) {
    el.stageFlash.classList.remove('go');
    void el.stageFlash.offsetWidth;
    el.stageFlash.classList.add('go');
  }
  const letters = $$('.pointless-letters span', el.tower);
  letters.forEach((s, i) => setTimeout(() => s.classList.add('on'), 120 + i * 95));
  setTimeout(done, 120 + letters.length * 95 + 900);
}

/* ---------------------------------------------------------- */
/* Board                                                        */
/* ---------------------------------------------------------- */

function boardMode(mode) {
  el.idleWrap.classList.toggle('hidden', mode !== 'idle');
  el.qLozenge.classList.toggle('hidden', mode !== 'question');
  if (mode !== 'question') el.answerBlock.classList.add('hidden');
}

function boardQuestion(text, animate) {
  boardMode('question');
  el.qText.textContent = text;
  el.answerBlock.classList.add('hidden');
  el.qLozenge.classList.remove('pop-in');
  if (animate) { void el.qLozenge.offsetWidth; el.qLozenge.classList.add('pop-in'); }
}

function boardAnswer(tagText, text, animate) {
  el.answerTag.textContent = tagText;
  el.answerText.textContent = text;
  el.answerBlock.classList.remove('hidden', 'pop-in');
  if (animate) { void el.answerBlock.offsetWidth; el.answerBlock.classList.add('pop-in'); }
}

function boardPrompt(text) { el.promptLine.textContent = text || ''; }

function boardBig(text, cls) {
  el.bigMsg.className = 'big-msg';
  el.bigMsg.textContent = text;
  if (cls) el.bigMsg.classList.add(cls);
  void el.bigMsg.offsetWidth;
  el.bigMsg.classList.add('show');
}

function boardAllAnswers(rows) {
  if (!rows) { el.allAnswers.classList.add('hidden'); return; }
  el.allAnswersRows.innerHTML = rows.map(r =>
    '<div class="arow' + (r.score === 0 ? ' zero' : '') + '">' +
      '<div class="atxt">' + esc(r.text) + '</div>' +
      (r.who ? '<div class="who">' + esc(r.who) + ' ✓</div>' : '') +
      '<div class="ascore">' + r.score + '</div>' +
    '</div>').join('');
  el.allAnswers.classList.remove('hidden');
}

function boardGameOver(names, totals, winner) {
  boardMode('question');
  el.qLozenge.classList.remove('pop-in');
  const finals = names.map((n, i) => n + ' ' + totals[i]).join('  ·  ');
  if (winner === -1) {
    el.qText.textContent = "It's a tie!";
    boardAnswer('Final scores', finals, true);
  } else {
    el.qText.textContent = '🏆 Tonight\'s winner';
    boardAnswer('With the lowest score — ' + totals[winner] + ' points', names[winner], true);
  }
  void el.qLozenge.offsetWidth;
  el.qLozenge.classList.add('pop-in');
  boardPrompt('Final: ' + finals);
}

/* ---------------------------------------------------------- */
/* Podiums                                                      */
/* ---------------------------------------------------------- */

function chipHtml(a) {
  if (!a) return '';
  if (a.kind === 'wrong') return '<div class="chip wrongc">+100</div>';
  if (a.score === 0) return '<div class="chip zeroc">POINTLESS</div>';
  return '<div class="chip">+' + a.score + '</div>';
}

function renderPodiums(activeIdx) {
  const g = state.game;
  el.podiumRow.classList.toggle('three', state.players.length >= 3);
  el.podiumRow.innerHTML = state.players.map((p, i) => {
    const a = g && g.answers ? g.answers[i] : null;
    return '<div class="podium' + (activeIdx === i ? ' active' : '') + '" data-pi="' + i + '">' +
      '<div class="turntag">Answering…</div>' +
      chipHtml(a) +
      '<div class="pname">' + esc(p.name) + '</div>' +
      '<div class="scorebox"><div class="val">' + p.total + '</div></div>' +
    '</div>';
  }).join('');
}

function setActivePodium(idx) {
  $$('.podium', el.podiumRow).forEach((p, i) => p.classList.toggle('active', i === idx));
}

function addChip(playerIdx, a) {
  const pod = $('.podium[data-pi="' + playerIdx + '"]', el.podiumRow);
  if (!pod) return;
  const old = $('.chip', pod);
  if (old) old.remove();
  pod.insertAdjacentHTML('afterbegin', chipHtml(a));
}

function countUpTotals(prev, next, done) {
  const vals = $$('.podium .scorebox .val', el.podiumRow);
  const dur = 850;
  let startT = null;
  function frame(now) {
    if (startT === null) startT = now;
    const p = Math.min((now - startT) / dur, 1);
    vals.forEach((v, i) => {
      v.textContent = Math.round(prev[i] + (next[i] - prev[i]) * p);
    });
    if (p < 1) requestAnimationFrame(frame);
    else { vals.forEach((v, i) => v.textContent = next[i]); if (done) done(); }
  }
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------- */
/* Event queue — animations play in order in every window       */
/* ---------------------------------------------------------- */

const evQueue = [];
let evBusy = false;

function enqueue(ev) { evQueue.push(ev); pump(); }

function pump() {
  if (evBusy) return;
  const ev = evQueue.shift();
  if (!ev) return;
  evBusy = true;
  try {
    playEvent(ev, () => { evBusy = false; pump(); });
  } catch (e) {
    evBusy = false;
    renderStatic();
    pump();
  }
}

function playEvent(ev, done) {
  switch (ev.t) {

    case 'soft':      // silent state refresh (settings, bank edits, catch-up)
      renderStatic();
      done();
      break;

    case 'question': {
      towerReset();
      boardAllAnswers(null);
      el.bigMsg.className = 'big-msg';
      boardQuestion(ev.text, true);
      boardPrompt(ev.firstName + ' to answer first');
      renderPodiums(ev.firstIdx);
      sfx.whoosh();
      setTimeout(done, 600);
      break;
    }

    case 'answer': {
      towerReset();
      boardAnswer(ev.name + ' says', ev.text, true);
      boardPrompt('');
      setTimeout(() => {
        towerCountdown(ev.score, ev.tickMs, ev.susp !== false, () => {
          const finish = () => {
            addChip(ev.player, { kind: 'listed', score: ev.score });
            if (ev.after === 'turn') {
              boardPrompt(ev.nextName + ' to answer');
              setActivePodium(ev.nextIdx);
            } else {
              boardPrompt('Scores on the board — ready to bank');
              setActivePodium(-1);
            }
            setTimeout(done, 500);
          };
          if (ev.score === 0) {
            boardBig('POINTLESS!', 'green');
            towerPointless(finish);
          } else {
            setTimeout(finish, 650);
          }
        });
      }, 550);
      break;
    }

    case 'wrong': {
      towerReset();
      boardAnswer(ev.name + ' says', ev.text || 'Incorrect answer', true);
      boardPrompt('');
      setTimeout(() => {
        towerShowX();
        sfx.wrong();
        boardBig('+100', 'red');
        addChip(ev.player, { kind: 'wrong', score: 100 });
        setTimeout(() => {
          if (ev.after === 'turn') {
            boardPrompt(ev.nextName + ' to answer');
            setActivePodium(ev.nextIdx);
          } else {
            boardPrompt('Scores on the board — ready to bank');
            setActivePodium(-1);
          }
          setTimeout(done, 500);
        }, 1400);
      }, 550);
      break;
    }

    case 'bank': {
      boardAllAnswers(null);
      renderPodiums(-1);            // fresh podiums (chips cleared) at previous totals
      $$('.podium .scorebox .val', el.podiumRow).forEach((v, i) => v.textContent = ev.prev[i]);
      boardMode('idle');
      boardPrompt('Round ' + ev.round + ' banked — lowest score wins');
      towerReset();
      sfx.bank();
      setTimeout(() => countUpTotals(ev.prev, ev.totals, () => setTimeout(done, 300)), 350);
      break;
    }

    case 'allans':
      boardAllAnswers(ev.on ? ev.rows : null);
      done();
      break;

    case 'gameover': {
      towerReset();
      boardAllAnswers(null);
      renderPodiums(-1);
      boardGameOver(ev.names, ev.totals, ev.winner);
      if (ev.winner !== -1) boardBig('POINTLESS CHAMPION', 'gold');
      sfx.fanfare();
      if (el.stageFlash) {
        el.stageFlash.classList.remove('go');
        void el.stageFlash.offsetWidth;
        el.stageFlash.classList.add('go');
      }
      setTimeout(done, 1200);
      break;
    }

    case 'reset': {
      renderStatic();
      boardBig('NEW GAME', 'gold');
      sfx.whoosh();
      setTimeout(done, 600);
      break;
    }

    case 'undo':
      renderStatic();
      done();
      break;

    default:
      renderStatic();
      done();
  }
}

/* ---------------------------------------------------------- */
/* Static render — draws current state without animations       */
/* ---------------------------------------------------------- */

function renderStatic() {
  const g = state.game;

  if (state.over) {
    renderPodiums(-1);
    towerReset();
    boardGameOver(state.players.map(p => p.name), state.players.map(p => p.total), overWinner());
    return;
  }

  if (!g) {
    renderPodiums(-1);
    towerReset();
    boardMode('idle');
    boardPrompt(state.roundNumber > 1
      ? 'Lowest score wins — waiting for the next question'
      : 'Waiting for your host…');
    boardAllAnswers(null);
    return;
  }

  // Live round (e.g. a display window opening mid-game)
  const active = (g.phase === 'complete') ? -1 : g.turn;
  renderPodiums(active);
  boardQuestion(qById(g.qid) ? qById(g.qid).text : g.text, false);
  const last = lastAnswerGiven();
  if (last) {
    boardAnswer(state.players[last.player].name + ' says',
      last.a.kind === 'wrong' ? (last.a.text || 'Incorrect answer') : last.a.text, false);
  }
  if (g.phase === 'complete') boardPrompt('Scores on the board — ready to bank');
  else boardPrompt(state.players[g.turn].name + ' to answer' + (noAnswersYet() ? ' first' : ''));

  if (state.ui.showAll) boardAllAnswers(allRowsFor(g));
  else boardAllAnswers(null);
}

function overWinner() {
  const totals = state.players.map(p => p.total);
  const min = Math.min.apply(null, totals);
  const winners = totals.reduce((acc, t, i) => (t === min ? acc.concat(i) : acc), []);
  return winners.length === 1 ? winners[0] : -1;
}

function lastAnswerGiven() {
  const g = state.game;
  if (!g) return null;
  const order = g.answerOrder || [];
  if (!order.length) return null;
  const player = order[order.length - 1];
  return { player, a: g.answers[player] };
}

function noAnswersYet() {
  const g = state.game;
  return g && !g.answers[0] && !g.answers[1];
}

function qById(id) { return state.questions.find(q => q.id === id) || null; }

function allRowsFor(g) {
  const q = qById(g.qid);
  if (!q) return [];
  const rows = q.answers.map((a, i) => {
    const whos = [];
    g.answers.forEach((given, pi) => {
      if (given && given.kind === 'listed' && given.answerIndex === i) {
        whos.push(state.players[pi].name);
      }
    });
    return { text: a.text, score: a.score, who: whos.join(' & ') };
  });
  rows.sort((x, y) => x.score - y.score);
  return rows;
}

/* ---------------------------------------------------------- */
/* Actions (controller only)                                    */
/* ---------------------------------------------------------- */

function pushSnapshot() {
  snapshots.push(deep({
    players: state.players, playedIds: state.playedIds,
    roundNumber: state.roundNumber, game: state.game, over: state.over
  }));
  if (snapshots.length > 25) snapshots.shift();
}

function actPlay(id) {
  const q = qById(id);
  if (!q) return toast('Question not found');
  pushSnapshot();
  const firstIdx = (state.roundNumber - 1) % state.players.length;
  state.over = false;
  state.ui.showAll = false;
  state.game = {
    qid: q.id,
    text: q.text,
    firstPlayer: firstIdx,
    turn: firstIdx,
    phase: 'answering',
    answers: state.players.map(() => null),
    answerOrder: []
  };
  commit({
    t: 'question', text: q.text, round: state.roundNumber,
    firstIdx, firstName: state.players[firstIdx].name
  });
  renderHost();
}

function recordAnswer(a) {
  const g = state.game;
  const n = state.players.length;
  const p = g.turn;
  g.answers[p] = a;
  g.answerOrder.push(p);
  const allDone = g.answers.every(Boolean);
  let after, nextIdx = -1, nextName = '';
  if (allDone) {
    g.phase = 'complete';
    after = 'complete';
  } else {
    g.turn = (p + 1) % n;
    nextIdx = g.turn;
    nextName = state.players[nextIdx].name;
    after = 'turn';
  }
  return { p, after, nextIdx, nextName };
}

function actAnswer(answerIndex) {
  const g = state.game;
  if (!g || g.phase !== 'answering') return;
  const q = qById(g.qid);
  if (!q || !q.answers[answerIndex]) return;
  pushSnapshot();
  const ans = q.answers[answerIndex];
  const meta = recordAnswer({
    kind: 'listed', answerIndex, text: ans.text, score: ans.score
  });
  commit({
    t: 'answer', player: meta.p, name: state.players[meta.p].name,
    text: ans.text, score: ans.score, tickMs: state.settings.tickMs,
    susp: state.settings.suspense !== false,
    after: meta.after, nextIdx: meta.nextIdx, nextName: meta.nextName
  });
  renderHost();
}

function actWrong(text) {
  const g = state.game;
  if (!g || g.phase !== 'answering') return;
  pushSnapshot();
  const meta = recordAnswer({ kind: 'wrong', text: (text || '').trim(), score: 100 });
  commit({
    t: 'wrong', player: meta.p, name: state.players[meta.p].name,
    text: (text || '').trim(),
    after: meta.after, nextIdx: meta.nextIdx, nextName: meta.nextName
  });
  renderHost();
}

function actBank() {
  const g = state.game;
  if (!g || g.phase !== 'complete') return;
  pushSnapshot();
  const prev = state.players.map(p => p.total);
  state.players.forEach((p, i) => { p.total += g.answers[i].score; });
  if (!state.playedIds.includes(g.qid)) state.playedIds.push(g.qid);
  const finishedRound = state.roundNumber;
  state.roundNumber++;
  state.game = null;
  state.ui.showAll = false;
  commit({
    t: 'bank', prev, totals: state.players.map(p => p.total),
    names: state.players.map(p => p.name), round: finishedRound
  });
  renderHost();
}

function actAbandon() {
  if (!state.game) return;
  pushSnapshot();
  state.game = null;
  state.ui.showAll = false;
  commit({ t: 'undo' });
  renderHost();
  toast('Question abandoned — no scores added');
}

function actShowAll(on) {
  const g = state.game;
  if (!g) return;
  state.ui.showAll = !!on;
  commit({ t: 'allans', on: state.ui.showAll, rows: allRowsFor(g) });
  renderHost();
}

function actUndo() {
  const snap = snapshots.pop();
  if (!snap) return toast('Nothing to undo');
  Object.assign(state, deep(snap));
  state.ui.showAll = false;
  commit({ t: 'undo' });
  renderHost();
  toast('Undone');
}

function actEndGame() {
  pushSnapshot();
  state.game = null;
  state.over = true;
  state.ui.showAll = false;
  commit({
    t: 'gameover',
    names: state.players.map(p => p.name),
    totals: state.players.map(p => p.total),
    winner: overWinner()
  });
  renderHost();
}

function actNewGame() {
  pushSnapshot();
  state.players.forEach(p => { p.total = 0; });
  state.playedIds = [];
  state.roundNumber = 1;
  state.game = null;
  state.over = false;
  state.ui.showAll = false;
  commit({ t: 'reset' });
  renderHost();
}

function softCommit() { commit({ t: 'soft' }); }

function setName(i, v) {
  if (!state.players[i]) return;
  state.players[i].name = (v || '').trim() || ('Player ' + (i + 1));
  softCommit();
  renderHost();
}

/* ------- question bank actions ------- */

function normaliseAnswers(rows) {
  return rows
    .map(r => ({ text: String(r.text || '').trim(), score: clamp(parseInt(r.score, 10) || 0, 0, 100) }))
    .filter(r => r.text.length > 0);
}

function addQuestion(text, answers) {
  const q = { id: uid(), text: String(text || '').trim(), answers: normaliseAnswers(answers) };
  if (!q.text) { toast('Give the question some text'); return null; }
  if (q.answers.length < 1) { toast('Add at least one answer'); return null; }
  state.questions.push(q);
  softCommit();
  return q.id;
}

function updateQuestion(id, text, answers) {
  const q = qById(id);
  if (!q) return false;
  const t = String(text || '').trim();
  const a = normaliseAnswers(answers);
  if (!t || a.length < 1) { toast('Question needs text and at least one answer'); return false; }
  q.text = t;
  q.answers = a;
  softCommit();
  return true;
}

function deleteQuestion(id) {
  if (state.game && state.game.qid === id) { toast("Can't delete the live question"); return; }
  state.questions = state.questions.filter(q => q.id !== id);
  state.playedIds = state.playedIds.filter(p => p !== id);
  softCommit();
  renderHost();
}

function duplicateQuestion(id) {
  const q = qById(id);
  if (!q) return;
  const copy = deep(q);
  copy.id = uid();
  copy.text = q.text + ' (copy)';
  const idx = state.questions.indexOf(q);
  state.questions.splice(idx + 1, 0, copy);
  softCommit();
  renderHost();
}

function importQuestions(jsonText) {
  try {
    const arr = JSON.parse(jsonText);
    if (!Array.isArray(arr)) throw new Error('not an array');
    let added = 0;
    arr.forEach(item => {
      if (item && item.question !== undefined) item.text = item.question;
      if (item && item.text && Array.isArray(item.answers)) {
        const a = normaliseAnswers(item.answers);
        if (a.length) {
          state.questions.push({ id: uid(), text: String(item.text).trim(), answers: a });
          added++;
        }
      }
    });
    softCommit();
    renderHost();
    toast('Imported ' + added + ' question' + (added === 1 ? '' : 's'));
  } catch (e) {
    toast('Import failed — check the JSON format');
  }
}

function exportQuestions() {
  try {
    const data = state.questions.map(q => ({ question: q.text, answers: q.answers }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pointless-questions.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Question bank exported');
  } catch (e) { toast('Export not supported in this browser'); }
}

function loadSamples() {
  sampleQuestions().forEach(q => state.questions.push(q));
  softCommit();
  renderHost();
  toast('Sample pack added');
}

/* ---------------------------------------------------------- */
/* Host panel UI                                                */
/* ---------------------------------------------------------- */

let hostTab = 'game';
let formAnswers = [];
let formEditId = null;
let formText = '';

function blankRows(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ text: '', score: '' });
  return out;
}

function resetForm() {
  formEditId = null;
  formText = '';
  formAnswers = blankRows(4);
}
resetForm();

function toast(msg) {
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

function renderHost() {
  if (IS_DISPLAY || !el.hostDrawer) return;
  $$('.drawer-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === hostTab));
  $('#tab-game').classList.toggle('hidden', hostTab !== 'game');
  $('#tab-bank').classList.toggle('hidden', hostTab !== 'bank');
  $('#tab-settings').classList.toggle('hidden', hostTab !== 'settings');
  if (hostTab === 'game') renderHostGame();
  if (hostTab === 'bank') renderHostBank();
  if (hostTab === 'settings') renderHostSettings();
  el.hostDrawer.classList.toggle('host-blur', !!state.settings.blur);
}

function renderHostGame() {
  const g = state.game;
  const box = $('#tab-game');

  if (state.over) {
    const w = overWinner();
    box.innerHTML =
      '<div class="panel"><h4>Game over</h4>' +
      '<div class="status-line">' + (w === -1 ? "It's a tie!" :
        esc(state.players[w].name) + ' wins with the lowest score') + '</div>' +
      '<div class="status-sub">' +
      state.players.map(p => esc(p.name) + ': ' + p.total).join(' · ') + '</div>' +
      '<div class="btnrow">' +
        '<button class="btn gold big" data-act="newgame">Start a new game</button>' +
        '<button class="btn" data-act="undo">Undo</button>' +
      '</div></div>';
    return;
  }

  if (!g) {
    const unplayed = state.questions.filter(q => !state.playedIds.includes(q.id));
    const firstIdx = (state.roundNumber - 1) % 2;
    box.innerHTML =
      '<div class="host-grid">' +
      '<div class="panel">' +
        '<h4>Round ' + state.roundNumber + '</h4>' +
        '<div class="status-line">No question live</div>' +
        '<div class="status-sub">' + esc(state.players[firstIdx].name) +
          ' answers first this round. Pick a question ▸</div>' +
        '<div class="btnrow">' +
          '<button class="btn" data-act="tab-bank">Open question bank</button>' +
          '<button class="btn ghost" data-act="undo"' + (snapshots.length ? '' : ' disabled') + '>Undo</button>' +
          '<button class="btn red" data-act="endgame">End game &amp; show winner</button>' +
        '</div>' +
        '<div class="hint">Totals — ' +
          state.players.map(p => esc(p.name) + ': ' + p.total).join(' · ') + '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h4>Play next</h4>' +
        (unplayed.length ? '<div class="qlist">' + unplayed.slice(0, 8).map(q =>
          '<div class="qitem"><div class="meta"><div class="t">' + esc(q.text) + '</div>' +
          '<div class="s">' + q.answers.length + ' answers' + qMinNote(q) + '</div></div>' +
          '<div class="acts"><button class="btn gold" data-act="play" data-id="' + q.id + '">▶ Play</button></div></div>'
        ).join('') + '</div>'
        : '<div class="status-sub">No unplayed questions left — add more in the Question Bank tab.</div>') +
      '</div></div>';
    return;
  }

  const q = qById(g.qid);
  const canAnswer = g.phase === 'answering';
  const turnName = esc(state.players[g.turn].name);

  const ansBtns = q.answers.map((a, i) => {
    const usedBy = [];
    g.answers.forEach((given, pi) => {
      if (given && given.kind === 'listed' && given.answerIndex === i) usedBy.push(pi);
    });
    return '<button class="ansbtn' + (usedBy.length ? ' used' : '') +
      (a.score === 0 ? ' zerobadge' : '') + '" data-act="answer" data-i="' + i + '"' +
      (canAnswer ? '' : ' disabled') + '>' +
      '<span class="atext">' + esc(a.text) + '</span>' +
      '<span class="badge">' + a.score + '</span></button>';
  }).join('');

  const given = g.answerOrder.map(pi => {
    const a = g.answers[pi];
    const cls = a.kind === 'wrong' ? 'bad' : (a.score === 0 ? 'zero' : '');
    return '<div class="g"><b>' + esc(state.players[pi].name) + '</b> — ' +
      esc(a.kind === 'wrong' ? (a.text || 'wrong answer') : a.text) +
      ' <span class="sc ' + cls + '">' + (a.kind === 'wrong' ? '+100 ✕' :
        (a.score === 0 ? 'POINTLESS' : '+' + a.score)) + '</span></div>';
  }).join('');

  $('#tab-game').innerHTML =
    '<div class="host-grid">' +
    '<div class="panel">' +
      '<h4>Round ' + state.roundNumber + ' — live</h4>' +
      '<div class="status-line">' + (canAnswer ? ('Now answering: ' + turnName) : 'Both answers in') + '</div>' +
      '<div class="status-sub">' + esc(state.players[g.firstPlayer].name) + ' went first this round</div>' +
      (given ? '<div class="given-list">' + given + '</div>' : '') +
      '<div class="btnrow">' +
        (g.phase === 'complete'
          ? '<button class="btn gold big" data-act="bank">✔ Bank scores &amp; continue</button>'
          : '') +
        '<button class="btn" data-act="showall">' + (state.ui.showAll ? 'Hide' : 'Reveal') + ' full list on screen</button>' +
        '<button class="btn ghost" data-act="undo"' + (snapshots.length ? '' : ' disabled') + '>Undo</button>' +
        '<button class="btn ghost" data-act="abandon">Abandon question</button>' +
      '</div>' +
    '</div>' +
    '<div class="panel">' +
      '<div class="qtitle">' + esc(q.text) + '</div>' +
      '<div class="ans-grid">' + ansBtns + '</div>' +
      '<div class="wrong-row">' +
        '<input type="text" id="wrongText" placeholder="What did they say? (optional)"' + (canAnswer ? '' : ' disabled') + '>' +
        '<button class="btn red" data-act="wrong"' + (canAnswer ? '' : ' disabled') + '>✕ Wrong answer (+100)</button>' +
      '</div>' +
      '<div class="hint">Click the answer ' + turnName + ' gives you — the tower counts it down on screen. Anything not on the list is a wrong answer.</div>' +
    '</div></div>';
}

function qMinNote(q) {
  const min = Math.min.apply(null, q.answers.map(a => a.score));
  return min === 0 ? ' · <span class="pz">has a pointless answer</span>' : ' · lowest ' + min;
}

function renderHostBank() {
  const rows = formAnswers.map((r, i) =>
    '<div class="arow2">' +
      '<input type="text" data-form="atext" data-i="' + i + '" placeholder="Answer ' + (i + 1) + '" value="' + esc(r.text) + '">' +
      '<input type="number" data-form="ascore" data-i="' + i + '" min="0" max="100" placeholder="0–100" value="' + esc(r.score) + '">' +
      '<button class="del" data-act="delrow" data-i="' + i + '" title="Remove">✕</button>' +
    '</div>').join('');

  const list = state.questions.map(q => {
    const played = state.playedIds.includes(q.id);
    const live = state.game && state.game.qid === q.id;
    return '<div class="qitem' + (played ? ' played' : '') + (live ? ' live' : '') + '">' +
      '<div class="meta"><div class="t">' + esc(q.text) + '</div>' +
      '<div class="s">' + q.answers.length + ' answers' + qMinNote(q) +
        (played ? ' · played ✓' : '') + (live ? ' · LIVE NOW' : '') + '</div></div>' +
      '<div class="acts">' +
        '<button class="btn gold" data-act="play" data-id="' + q.id + '"' + (live ? ' disabled' : '') + '>▶ Play</button>' +
        '<button class="btn" data-act="edit" data-id="' + q.id + '"' + (live ? ' disabled' : '') + '>Edit</button>' +
        '<button class="btn" data-act="dupe" data-id="' + q.id + '">Copy</button>' +
        '<button class="btn red" data-act="delq" data-id="' + q.id + '"' + (live ? ' disabled' : '') + '>Del</button>' +
      '</div></div>';
  }).join('');

  $('#tab-bank').innerHTML =
    '<div class="bank-grid">' +
    '<div class="panel qform">' +
      '<h4>' + (formEditId ? 'Edit question' : 'Add a question') + '</h4>' +
      '<label class="mini">Question</label>' +
      '<input type="text" class="qtext" id="formQText" placeholder="e.g. Films starring Tom Hanks" value="' + esc(formText) + '">' +
      '<label class="mini">Answers &amp; scores (0 = pointless, out of 100 people)</label>' +
      rows +
      '<div class="btnrow">' +
        '<button class="btn" data-act="addrow">+ Add answer</button>' +
        '<button class="btn gold" data-act="saveq">' + (formEditId ? 'Save changes' : 'Save question') + '</button>' +
        (formEditId ? '' : '<button class="btn gold" data-act="saveplay">Save &amp; play now</button>') +
        '<button class="btn ghost" data-act="clearform">Clear</button>' +
      '</div>' +
      '<div class="hint">You can add questions at any point — even mid-game — without losing scores.</div>' +
    '</div>' +
    '<div class="panel">' +
      '<h4>Question bank (' + state.questions.length + ')</h4>' +
      '<div class="btnrow" style="margin:0 0 12px">' +
        '<button class="btn" data-act="import">Import JSON</button>' +
        '<button class="btn" data-act="export">Export JSON</button>' +
        '<button class="btn ghost" data-act="samples">Add sample pack</button>' +
        '<input type="file" id="importFile" accept="application/json,.json" class="hidden">' +
      '</div>' +
      (list ? '<div class="qlist">' + list + '</div>' : '<div class="status-sub">Bank is empty — add your first question on the left.</div>') +
    '</div></div>';
}

function renderHostSettings() {
  const s = state.settings;
  const canAdd = state.players.length < 3;
  const canRemove = state.players.length > 2;
  const playerRows = state.players.map((p, i) =>
    '<div class="set-row"><label>Quizzer ' + (i + 1) + '</label>' +
      '<input type="text" data-set="pname" data-i="' + i + '" value="' + esc(p.name) + '">' +
      (canRemove ? '<button class="btn red" data-act="removeplayer" data-i="' + i + '" title="Remove this quizzer">✕</button>' : '') +
    '</div>').join('');

  $('#tab-settings').innerHTML =
    '<div class="set-grid">' +
    '<div class="panel">' +
      '<h4>Players</h4>' +
      playerRows +
      '<div class="btnrow">' +
        (canAdd ? '<button class="btn gold" data-act="addplayer">+ Add a third quizzer</button>' : '') +
        '<button class="btn" data-act="newgame">New game (reset scores)</button>' +
        '<button class="btn red" data-act="wipe">Delete everything</button>' +
      '</div>' +
      '<div class="hint">Names update everywhere instantly. Add or remove a quizzer between questions (not mid-question). Turn order rotates through everyone each round.</div>' +
    '</div>' +
    '<div class="panel">' +
      '<h4>Show</h4>' +
      '<div class="set-row"><label>Countdown speed</label>' +
        '<input type="range" min="35" max="180" step="5" data-set="tick" value="' + s.tickMs + '">' +
        '<span class="rangeval">' + s.tickMs + ' ms/pt</span></div>' +
      '<div class="set-row"><label>Suspense finish</label>' +
        '<input type="checkbox" data-set="susp"' + (s.suspense !== false ? ' checked' : '') + '>' +
        '<span class="hint" style="margin:0">ticks slow right down under 12 for the tense finish</span></div>' +
      '<div class="set-row"><label>Sound effects</label>' +
        '<input type="checkbox" data-set="sound"' + (s.sound ? ' checked' : '') + '></div>' +
      '<div class="set-row"><label>Blur answers here</label>' +
        '<input type="checkbox" data-set="blur"' + (s.blur ? ' checked' : '') + '>' +
        '<span class="hint" style="margin:0">hover to peek — handy on a shared screen</span></div>' +
    '</div>' +
    '<div class="panel">' +
      '<h4>TV display</h4>' +
      '<div class="btnrow" style="margin-top:0">' +
        '<button class="btn gold" data-act="opendisplay">Open display window</button>' +
        '<button class="btn" data-act="fullscreen">Fullscreen this window</button>' +
      '</div>' +
      '<div class="hint"><b>Casting to a TV?</b> Open the display window, then in Chrome cast <i>that tab only</i> (⋮ menu → Cast → Sources → Cast tab). The TV shows just the stage while this host tab — with all the answers — stays private on your laptop. On an HDMI/extended display, simply drag the display window across and press F. Click the display once to enable sound; press M in either window to mute just that one.</div>' +
    '</div></div>';
}

/* ------- host event wiring (delegated) ------- */

function collectFormFromDom() {
  const t = $('#formQText');
  if (t) formText = t.value;
  $$('#tab-bank [data-form="atext"]').forEach(inp => {
    formAnswers[+inp.dataset.i].text = inp.value;
  });
  $$('#tab-bank [data-form="ascore"]').forEach(inp => {
    formAnswers[+inp.dataset.i].score = inp.value;
  });
}

function bindHost() {
  el.hostToggle.addEventListener('click', toggleDrawer);
  el.drawerClose.addEventListener('click', toggleDrawer);

  $$('.drawer-tabs .tab').forEach(t => t.addEventListener('click', () => {
    if (hostTab === 'bank') collectFormFromDom();
    hostTab = t.dataset.tab;
    renderHost();
  }));

  el.hostDrawer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;

    switch (act) {
      case 'play': {
        if (hostTab === 'bank') collectFormFromDom();
        actPlay(btn.dataset.id);
        hostTab = 'game';
        renderHost();
        break;
      }
      case 'answer': actAnswer(+btn.dataset.i); break;
      case 'wrong': {
        const inp = $('#wrongText');
        actWrong(inp ? inp.value : '');
        break;
      }
      case 'bank': actBank(); break;
      case 'showall': actShowAll(!state.ui.showAll); break;
      case 'undo': actUndo(); break;
      case 'abandon':
        if (ask('Abandon this question? No scores will be added.')) actAbandon();
        break;
      case 'endgame':
        if (ask('End the game and reveal the winner on screen?')) actEndGame();
        break;
      case 'newgame':
        if (ask('Start a new game? Totals go back to zero (questions are kept).')) actNewGame();
        break;
      case 'wipe':
        if (ask('Delete ALL questions and scores? This cannot be undone.')) {
          state = defaultState();
          state.questions = [];
          snapshots.length = 0;
          resetForm();
          softCommit();
          renderHost();
          toast('Everything cleared');
        }
        break;
      case 'tab-bank': hostTab = 'bank'; renderHost(); break;

      case 'addplayer': {
        if (state.game) { toast('Finish or abandon the live question first'); break; }
        if (state.players.length >= 3) break;
        state.players.push({ name: 'Player ' + (state.players.length + 1), total: 0 });
        softCommit();
        renderHost();
        toast('Third quizzer added — give them a name');
        break;
      }
      case 'removeplayer': {
        if (state.game) { toast('Finish or abandon the live question first'); break; }
        if (state.players.length <= 2) break;
        const ri = +btn.dataset.i;
        if (ask('Remove ' + state.players[ri].name + '? Their score will be lost.')) {
          state.players.splice(ri, 1);
          softCommit();
          renderHost();
        }
        break;
      }

      /* --- bank form --- */
      case 'addrow': collectFormFromDom(); formAnswers.push({ text: '', score: '' }); renderHost(); break;
      case 'delrow': collectFormFromDom(); formAnswers.splice(+btn.dataset.i, 1);
        if (!formAnswers.length) formAnswers = blankRows(1);
        renderHost(); break;
      case 'clearform': resetForm(); renderHost(); break;
      case 'saveq': {
        collectFormFromDom();
        let ok;
        if (formEditId) ok = updateQuestion(formEditId, formText, formAnswers);
        else ok = addQuestion(formText, formAnswers);
        if (ok) { resetForm(); renderHost(); toast('Question saved'); }
        break;
      }
      case 'saveplay': {
        collectFormFromDom();
        const id = addQuestion(formText, formAnswers);
        if (id) {
          resetForm();
          actPlay(id);
          hostTab = 'game';
          renderHost();
        }
        break;
      }
      case 'edit': {
        const q = qById(btn.dataset.id);
        if (!q) break;
        formEditId = q.id;
        formText = q.text;
        formAnswers = q.answers.map(a => ({ text: a.text, score: a.score }));
        renderHost();
        break;
      }
      case 'dupe': duplicateQuestion(btn.dataset.id); break;
      case 'delq':
        if (ask('Delete this question?')) deleteQuestion(btn.dataset.id);
        break;
      case 'import': {
        const f = $('#importFile');
        if (f) f.click();
        break;
      }
      case 'export': exportQuestions(); break;
      case 'samples': loadSamples(); break;

      /* --- settings / display --- */
      case 'opendisplay': {
        try {
          const url = location.pathname + '?view=display';
          window.open(url, 'pointless-display', 'width=1280,height=760');
          toast('Display opened — drag it to your TV');
        } catch (e) { toast('Could not open a window'); }
        break;
      }
      case 'fullscreen':
        try {
          if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        } catch (e) {}
        break;
    }
  });

  el.hostDrawer.addEventListener('change', (e) => {
    const set = e.target.dataset && e.target.dataset.set;
    if (!set) {
      if (e.target.id === 'importFile' && e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = () => importQuestions(String(reader.result || ''));
        reader.readAsText(e.target.files[0]);
        e.target.value = '';
      }
      return;
    }
    if (set === 'pname') setName(+e.target.dataset.i, e.target.value);
    if (set === 'sound') { state.settings.sound = e.target.checked; softCommit(); }
    if (set === 'susp') { state.settings.suspense = e.target.checked; softCommit(); }
    if (set === 'blur') { state.settings.blur = e.target.checked; softCommit(); renderHost(); }
    if (set === 'tick') {
      state.settings.tickMs = clamp(parseInt(e.target.value, 10) || 75, 35, 180);
      softCommit();
      const rv = e.target.parentElement && e.target.parentElement.querySelector('.rangeval');
      if (rv) rv.textContent = state.settings.tickMs + ' ms/pt';
    }
  });

  el.hostDrawer.addEventListener('input', (e) => {
    if (e.target.dataset && e.target.dataset.set === 'tick') {
      const rv = e.target.parentElement && e.target.parentElement.querySelector('.rangeval');
      if (rv) rv.textContent = e.target.value + ' ms/pt';
    }
  });
}

function ask(msg) {
  try { return window.confirm ? window.confirm(msg) : true; }
  catch (e) { return true; }
}

function toggleDrawer() {
  el.hostDrawer.classList.toggle('open');
  el.hostToggle.textContent = el.hostDrawer.classList.contains('open') ? 'HIDE PANEL' : 'HOST PANEL';
  fitStage();
}

/* ---------------------------------------------------------- */
/* Init                                                         */
/* ---------------------------------------------------------- */

function init() {
  grabEls();
  buildBackground();

  if (IS_DISPLAY) {
    document.body.classList.add('display');
    el.soundGate.classList.remove('hidden');
    el.soundGate.addEventListener('click', () => {
      el.soundGate.classList.add('hidden');
      sfx.ensure();
    });
    send({ type: 'hello' });
  } else {
    bindHost();
    el.hostDrawer.classList.add('open');
    el.hostToggle.textContent = 'HIDE PANEL';
    renderHost();
  }

  renderStatic();
  fitStage();
  window.addEventListener('resize', fitStage);

  document.addEventListener('pointerdown', () => sfx.ensure(), { once: false });
  document.addEventListener('keydown', (e) => {
    sfx.ensure();
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'h' && !IS_DISPLAY) toggleDrawer();
    if (k === 'f') {
      try {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
      } catch (err) {}
    }
    if (k === 'm') {
      localMuted = !localMuted;
      try { sessionStorage.setItem('pl-muted', localMuted ? '1' : '0'); } catch (err) {}
      if (!IS_DISPLAY) toast(localMuted ? 'This window muted' : 'This window unmuted');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* Exposed for tinkering & tests */
window.Pointless = {
  get state() { return state; },
  act: {
    play: actPlay, answer: actAnswer, wrong: actWrong, bank: actBank,
    undo: actUndo, endGame: actEndGame, newGame: actNewGame,
    showAll: actShowAll, addQuestion, deleteQuestion, importQuestions
  }
};

})();
