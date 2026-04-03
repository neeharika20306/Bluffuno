
'use strict';


function qs(selector) { return document.querySelector(selector); }

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

const COLORS  = ['red', 'blue', 'green', 'yellow'];
const VALUES  = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];
const WILDS   = ['wild', 'wild4'];

const COLOR_MAP = {
  red: '#c0392b', blue: '#2471a3', green: '#1e8449', yellow: '#b7950b', wild: '#5d3a8a'
};
const VALUE_LABEL = {
  skip: '⊘', reverse: '↺', draw2: '+2', wild: '✦', wild4: '+4'
};


let G = {};


function buildDeck() {
  const deck = [];
  let id = 0;
  COLORS.forEach(color => {
    VALUES.forEach(val => {
      deck.push({ id: id++, color, value: val, type: 'normal' });
      if (val !== '0') deck.push({ id: id++, color, value: val, type: 'normal' });
    });
  });
  WILDS.forEach(w => {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: id++, color: 'wild', value: w, type: w });
    }
  });
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initGame(playerNames) {
  const deck  = buildDeck();
  const n     = playerNames.length;
  const hands = Array.from({ length: n }, () => []);

  for (let c = 0; c < 7; c++)
    for (let p = 0; p < n; p++)
      hands[p].push(deck.pop());

  // First discard must be a normal card
  let first;
  do {
    first = deck.shift();
    deck.push(first);
    first = deck.pop();
  } while (first.type !== 'normal');

  G = {
    players:       playerNames.map((name, i) => ({ name, hand: hands[i] })),
    deck,
    discard:       [first],
    currentColor:  first.color,
    turn:          0,
    direction:     1,
    selectedCard:  null,
    lastBluff:     null,   // { playerIdx, cardIdx, card }
    bluffPending:  false,
    callWindowOpen: false,
    gameOver:      false,
  };
}

function renderAll() {
  renderHUD();
  renderOpponents();
  renderDiscard();
  renderDrawPile();
  renderPlayerHand();
  renderButtons();
  renderBluffNotice();
  renderColorRing();
}

function renderHUD() {
  qs('#hud-turn').textContent  = G.players[G.turn].name;
  qs('#hud-deck').textContent  = G.deck.length;
  qs('#hud-color').textContent = G.currentColor.toUpperCase();
}


function renderColorRing() {
  const ring = qs('#current-color-ring');
  ring.className = '';
  ring.classList.add(G.currentColor);

  const dot = qs('#hud-color-dot');
  dot.style.background  = COLOR_MAP[G.currentColor] || '#888';
  dot.style.boxShadow   = `0 0 8px ${COLOR_MAP[G.currentColor] || '#888'}`;
}


function renderOpponents() {
  const strip = qs('#opponents-strip');
  strip.innerHTML = '';

  G.players.forEach((pl, i) => {
    if (i === 0) return;
    const isActive = G.turn === i;

    const zone = el('div', 'opp-zone');
    const meta = el('div', 'opp-meta');

    const dot  = el('div', `opp-dot${isActive ? ' active' : ''}`);
    const name = el('span', 'opp-name');
    name.textContent = pl.name;
    const count = el('span', 'opp-count');
    count.textContent = pl.hand.length;

    meta.append(dot, name, count);

    const handRow = el('div', 'opp-hand-row');
    pl.hand.forEach(card => {
      const miniCard = el('div', 'opp-mini-card');
      const img = new Image();
      img.src = `cards/back.jpg`;
      img.onerror = () => { img.style.display = 'none'; };
      miniCard.appendChild(img);
      handRow.appendChild(miniCard);
    });

    zone.append(meta, handRow);
    strip.appendChild(zone);
  });
}

/* ── DISCARD ── */
function renderDiscard() {
  const zone = qs('#discard-zone');
  zone.innerHTML = '';
  if (!G.discard.length) return;
  const top = G.discard[G.discard.length - 1];
  zone.appendChild(makeCardEl(top, true));
}

/* ── DRAW PILE ── */
function renderDrawPile() {
  const stack = qs('#draw-stack');
  stack.innerHTML = '';
  const count = Math.min(3, G.deck.length);
  for (let i = 0; i < count; i++) {
    const wrapper = el('div', 'stacked-card');
    wrapper.appendChild(makeBackCardEl());
    if (i === count - 1) wrapper.addEventListener('click', onDrawClick);
    stack.appendChild(wrapper);
  }
  qs('#deck-count-lbl').textContent = `${G.deck.length} remaining`;
}

/* ── PLAYER HAND ── */
function renderPlayerHand() {
  const handEl = qs('#player-hand');
  handEl.innerHTML = '';
  const isMyTurn = G.turn === 0 && !G.bluffPending && !G.gameOver;

  G.players[0].hand.forEach((card, idx) => {
    const playable = isMyTurn && canPlay(card);
    const cardEl   = makeCardEl(card, true);

    if (!playable) cardEl.classList.add('card-disabled');
    if (G.selectedCard === idx) cardEl.classList.add('card-selected');

    cardEl.addEventListener('click', () => {
      if (!isMyTurn || G.bluffPending) return;
      if (!playable && G.selectedCard !== idx) return;
      onCardClick(idx);
    });

    // Staggered deal-in animation
    cardEl.style.animation = `dealIn .35s ${idx * 0.05}s var(--ease-out-expo) both`;

    handEl.appendChild(cardEl);
  });

  // Turn dot
  const dot = qs('#player-turn-ind');
  dot.classList.toggle('active', G.turn === 0 && !G.bluffPending);
}

/* ── BUTTONS ── */
function renderButtons() {
  const myTurn    = G.turn === 0 && !G.gameOver;
  const hasSel    = G.selectedCard !== null;
  const isBluffing = G.bluffPending;

  qs('#btn-play').disabled  = !myTurn || isBluffing || !hasSel;
  qs('#btn-draw').disabled  = !myTurn || isBluffing || hasSel;
  qs('#btn-bluff').disabled = !myTurn || isBluffing || !hasSel;
  qs('#btn-call').disabled  = !G.callWindowOpen || (G.lastBluff && G.lastBluff.playerIdx === 0);
  qs('#btn-uno').disabled   = !(myTurn && G.players[0].hand.length === 1 && !isBluffing);
}

/* ── BLUFF NOTICE ── */
function renderBluffNotice() {
  const notice = qs('#bluff-notice');
  if (G.bluffPending && G.lastBluff) {
    const name = G.players[G.lastBluff.playerIdx].name;
    qs('#bluff-text-content').textContent = `${name} played face-down`;
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }
}


function makeCardEl(card, faceUp) {
  const wrap = el('div', `game-card card-${card.color}`);

  const img = new Image();
  img.src   = faceUp ? `cards/${cardImgName(card)}` : 'cards/back.jpg';
  img.alt   = faceUp ? cardLabel(card) : 'card';

  img.onerror = () => {
    img.style.display = 'none';
    const face = el('div', 'card-face');
    const pip  = el('div', 'card-pip');
    pip.textContent = cardLabel(card);
    const sub  = el('div', 'card-sub');
    sub.textContent = card.color !== 'wild' ? card.color : 'wild';
    face.append(pip, sub);
    wrap.appendChild(face);
  };

  wrap.appendChild(img);
  return wrap;
}

function makeBackCardEl() {
  const wrap = el('div', 'game-card card-back');
  const img  = new Image();
  img.src    = 'cards/back.jpg';
  img.onerror = () => {
    img.style.display = 'none';
    const face = el('div', 'card-face');
    const pip  = el('div', 'card-pip');
    pip.textContent = '✦';
    face.appendChild(pip);
    wrap.appendChild(face);
  };
  wrap.appendChild(img);
  return wrap;
}

function cardImgName(card) {
  if (card.type === 'wild')  return 'wild.jpg';
  if (card.type === 'wild4') return 'wild4.jpg';
  return `${card.color}_${card.value}.jpg`;
}

function cardLabel(card) {
  if (card.type === 'wild')  return '✦';
  if (card.type === 'wild4') return '+4';
  return VALUE_LABEL[card.value] || card.value;
}

function canPlay(card) {
  const top = G.discard[G.discard.length - 1];
  if (card.type === 'wild' || card.type === 'wild4') return true;
  if (card.color === G.currentColor)                  return true;
  if (top && card.value === top.value)                return true;
  return false;
}

function onCardClick(idx) {
  if (G.selectedCard === idx) {
    // Double-click = play
    G.selectedCard = null;
    humanPlayCard(idx);
  } else {
    G.selectedCard = idx;
    renderPlayerHand();
    renderButtons();
  }
}

function onDrawClick() {
  if (G.turn !== 0 || G.bluffPending || G.gameOver) return;
  if (G.deck.length === 0) reshuffleDeck();
  const card = G.deck.pop();
  G.players[0].hand.push(card);
  G.selectedCard = null;
  log(`You drew a card.`);
  toast('Card drawn.');
  nextTurn();
}

async function humanPlayCard(cardIdx) {
  const card = G.players[0].hand[cardIdx];
  let color  = null;
  if (card.type === 'wild' || card.type === 'wild4') {
    color = await pickColor();
  }
  resolvePlayCard(0, cardIdx, color);
}

function resolvePlayCard(playerIdx, cardIdx, chosenColor) {
  const pl   = G.players[playerIdx];
  const card = pl.hand.splice(cardIdx, 1)[0];

  G.discard.push(card);
  G.currentColor  = chosenColor || card.color;
  G.selectedCard  = null;
  G.callWindowOpen = false;
  G.bluffPending   = false;
  G.lastBluff      = null;

  log(`${pl.name} played ${cardLabel(card)}${chosenColor ? ' → ' + chosenColor : ''}.`);

  if (checkWin(playerIdx)) return;
  applyCardEffect(card, playerIdx, chosenColor);
}

function applyCardEffect(card, playerIdx, chosenColor) {
  const n = G.players.length;

  if (card.value === 'reverse') {
    G.direction *= -1;
    if (n === 2) { nextTurn(); nextTurn(); return; }
  }
  if (card.value === 'skip') {
    nextTurn(); nextTurn(); return;
  }
  if (card.value === 'draw2') {
    const target = (playerIdx + G.direction + n) % n;
    for (let i = 0; i < 2; i++) {
      if (!G.deck.length) reshuffleDeck();
      G.players[target].hand.push(G.deck.pop());
    }
    toast(`${G.players[target].name} draws 2 cards!`);
    nextTurn(); nextTurn(); return;
  }
  if (card.type === 'wild4') {
    const target = (playerIdx + G.direction + n) % n;
    for (let i = 0; i < 4; i++) {
      if (!G.deck.length) reshuffleDeck();
      G.players[target].hand.push(G.deck.pop());
    }
    toast(`${G.players[target].name} draws 4 cards!`);
    nextTurn(); nextTurn(); return;
  }
  nextTurn();
}

function nextTurn() {
  G.selectedCard = null;
  G.turn = (G.turn + G.direction + G.players.length) % G.players.length;
  renderAll();
  if (G.turn !== 0 && !G.gameOver) {
    setTimeout(aiTurn, 850 + Math.random() * 700);
  }
}

qs('#btn-bluff').addEventListener('click', () => {
  if (G.selectedCard === null || G.turn !== 0 || G.bluffPending) return;

  const cardIdx = G.selectedCard;
  const card    = G.players[0].hand[cardIdx];

  G.lastBluff    = { playerIdx: 0, cardIdx, card };
  G.bluffPending = true;
  G.callWindowOpen = true;

  G.players[0].hand.splice(cardIdx, 1);
  G.selectedCard = null;

  log(`You played a card face-down. 🎭`, 'log-bluff');
  toast('Face-down! Opponents may call your bluff…');

  renderAll();

  setTimeout(() => {
    if (G.bluffPending && G.lastBluff?.playerIdx === 0) {
      aiMaybeCallBluff();
    }
  }, 2500);
});

qs('#btn-play').addEventListener('click', () => {
  if (G.selectedCard === null || G.turn !== 0) return;
  const idx = G.selectedCard;
  G.selectedCard = null;
  humanPlayCard(idx);
});

qs('#btn-draw').addEventListener('click', onDrawClick);

qs('#btn-call').addEventListener('click', () => {
  if (!G.callWindowOpen || !G.lastBluff || G.lastBluff.playerIdx === 0) return;
  log(`You call the bluff! 🔍`, 'log-bluff');
  resolveBluffCall(0);
});

qs('#btn-uno').addEventListener('click', () => {
  toast('UNO! 🃏');
  log(`${G.players[0].name} declares UNO!`);
});

function aiMaybeCallBluff() {
  if (!G.bluffPending || !G.lastBluff) return;
  const willCall = Math.random() < 0.32;
  const callerIdx = G.turn !== 0 ? G.turn : 1;
  if (willCall) {
    toast(`${G.players[callerIdx].name} calls bluff! 🔍`);
    log(`${G.players[callerIdx].name} calls bluff!`, 'log-bluff');
    resolveBluffCall(callerIdx);
  } else {
    resolveBluffAccepted();
  }
}

function resolveBluffCall(callerIdx) {
  if (!G.lastBluff) return;
  const { playerIdx, card } = G.lastBluff;
  const bluffer = G.players[playerIdx];
  const caller  = G.players[callerIdx];
  const wasPlayable = canPlay(card);

  G.bluffPending   = false;
  G.callWindowOpen = false;
  G.lastBluff      = null;

  if (!wasPlayable) {
    for (let i = 0; i < 3; i++) {
      if (!G.deck.length) reshuffleDeck();
      bluffer.hand.push(G.deck.pop());
    }
    G.discard.push(card);
    G.currentColor = card.color === 'wild' ? G.currentColor : card.color;
    toast(`❌ Bluff caught! ${bluffer.name} draws 3 cards.`);
    log(`${bluffer.name} was bluffing. Draws 3 cards.`, 'log-caught');
    nextTurn();
  } else {
    for (let i = 0; i < 2; i++) {
      if (!G.deck.length) reshuffleDeck();
      caller.hand.push(G.deck.pop());
    }
    G.discard.push(card);
    G.currentColor = (card.type === 'wild' || card.type === 'wild4') ? G.currentColor : card.color;
    toast(`✅ It was real! ${caller.name} draws 2 cards.`);
    log(`${caller.name} called wrongly. Draws 2.`, 'log-caught');
    if (checkWin(playerIdx)) return;
    applyCardEffect(card, playerIdx, null);
  }
}

function resolveBluffAccepted() {
  if (!G.lastBluff) return;
  const { playerIdx, card } = G.lastBluff;
  G.discard.push(card);
  G.currentColor   = (card.type === 'wild' || card.type === 'wild4') ? G.currentColor : card.color;
  G.bluffPending   = false;
  G.callWindowOpen = false;
  G.lastBluff      = null;
  log(`Bluff accepted — card played.`);
  toast('Bluff accepted.');
  if (checkWin(playerIdx)) return;
  applyCardEffect(card, playerIdx, null);
}

function aiTurn() {
  if (G.gameOver || G.turn === 0) return;
  const pl = G.players[G.turn];

  const playable = pl.hand
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => canPlay(c));

  if (playable.length === 0) {
    if (!G.deck.length) reshuffleDeck();
    pl.hand.push(G.deck.pop());
    log(`${pl.name} drew a card.`);
    nextTurn();
    return;
  }

  playable.sort((a, b) => {
    const rank = c => ['draw2','wild4','wild','skip','reverse'].indexOf(c.value) >= 0 ? 1 : 0;
    return rank(b.c) - rank(a.c);
  });

  const { c: card, i: cardIdx } = playable[0];

  let color = null;
  if (card.type === 'wild' || card.type === 'wild4') {
    const counts = {};
    pl.hand.forEach(c => { if (c.color !== 'wild') counts[c.color] = (counts[c.color] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    color = sorted[0]?.[0] || COLORS[Math.floor(Math.random() * 4)];
  }

  const mayBluff = Math.random() < 0.20 && playable.length > 1;
  if (mayBluff) {
    G.lastBluff    = { playerIdx: G.turn, cardIdx, card };
    G.bluffPending = true;
    G.callWindowOpen = true;
    pl.hand.splice(cardIdx, 1);
    log(`${pl.name} played face-down. 🎭`, 'log-bluff');
    toast(`${pl.name} plays face-down — call their bluff?`);
    renderAll();
    setTimeout(() => {
      if (G.bluffPending && G.lastBluff?.playerIdx === G.turn) {
        resolveBluffAccepted();
      }
    }, 3000);
    return;
  }

  log(`${pl.name} played ${cardLabel(card)}${color ? ' → ' + color : ''}.`);
  resolvePlayCard(G.turn, cardIdx, color);
}

function checkWin(playerIdx) {
  if (G.players[playerIdx].hand.length === 0) {
    G.gameOver = true;
    const isHuman = playerIdx === 0;
    const name    = G.players[playerIdx].name;
    qs('#win-title').textContent = isHuman ? 'Victory' : `${name} Wins`;
    qs('#win-sub').textContent   = isHuman
      ? 'You have mastered the art of deception.'
      : `${name} outbluffed everyone tonight.`;
    qs('#win-overlay').classList.remove('hidden');
    log(`${name} wins the game! ✦`, 'log-win');
    renderAll();
    return true;
  }
  return false;
}

function reshuffleDeck() {
  const top = G.discard.pop();
  G.deck    = shuffle(G.discard);
  G.discard = [top];
  toast('Deck reshuffled.');
}

let _colorResolve = null;

function pickColor() {
  return new Promise(resolve => {
    _colorResolve = resolve;
    qs('#color-modal').classList.add('open');
  });
}

document.querySelectorAll('.swatch').forEach(s => {
  s.addEventListener('click', () => {
    qs('#color-modal').classList.remove('open');
    if (_colorResolve) {
      _colorResolve(s.dataset.color);
      _colorResolve = null;
    }
  });
});

let _toastTimer = null;
function toast(msg) {
  const el = qs('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function log(msg, cls = '') {
  const entries = qs('#log-entries');
  const p       = document.createElement('p');
  p.className   = `log-entry ${cls}`;
  p.textContent = msg;
  entries.appendChild(p);
  entries.scrollTop = entries.scrollHeight;
}

qs('#btn-new-game').addEventListener('click', () => location.reload());

const defaultNames = ['Opponent', 'Player 3', 'Player 4'];

function buildNameInputs() {
  const count     = parseInt(qs('#player-count').value);
  const container = qs('#name-inputs');
  container.innerHTML = '';

  for (let i = 1; i < count; i++) {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'name-field';

    const label = document.createElement('label');
    label.textContent = `PLAYER ${i + 1} NAME`;
    label.setAttribute('for', `pname-${i}`);

    const input = document.createElement('input');
    input.type        = 'text';
    input.id          = `pname-${i}`;
    input.placeholder = defaultNames[i - 1];
    input.value       = defaultNames[i - 1];
    input.maxLength   = 18;

    fieldDiv.append(label, input);
    container.appendChild(fieldDiv);
  }
}

qs('#player-count').addEventListener('change', buildNameInputs);
buildNameInputs();

qs('#btn-start').addEventListener('click', () => {
  const count = parseInt(qs('#player-count').value);
  const names = ['You'];
  for (let i = 1; i < count; i++) {
    const inp = qs(`#pname-${i}`);
    names.push(inp?.value.trim() || defaultNames[i - 1]);
  }


  qs('#setup-screen').style.display = 'none';
  qs('#game-screen').classList.remove('hidden');
  qs('#game-log').classList.add('visible');
  qs('#player-zone-name').textContent = names[0];

  initGame(names);
  renderAll();

  log('✦ Match begins. May the best bluffer win.');
  toast('Select a card to play — or bluff your way through.');
});

