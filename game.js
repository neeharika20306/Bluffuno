'use strict';

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

  let first;
  do {
    first = deck.shift();
    deck.push(first);
    first = deck.pop();
  } while (first.type !== 'normal');

  G = {
    players: playerNames.map((name, i) => ({ name, hand: hands[i] })),
    deck,
    discard: [first],
    currentColor: first.color,
    turn: 0,
    direction: 1,
    selectedCard: null,
    lastBluff: null,
    bluffPending: false,
    callWindowOpen: false,
    gameOver: false,
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

function renderDiscard() {
  const zone = qs('#discard-zone');
  zone.innerHTML = '';
  if (!G.discard.length) return;
  const top = G.discard[G.discard.length - 1];
  zone.appendChild(makeCardEl(top, true));
}

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

    cardEl.style.animation = `dealIn .35s ${idx * 0.05}s var(--ease-out-expo) both`;

    handEl.appendChild(cardEl);
  });

  const dot = qs('#player-turn-ind');
  dot.classList.toggle('active', G.turn === 0 && !G.bluffPending);
}

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
  if (card.color === G.currentColor) return true;
  if (top && card.value === top.value) return true;
  return false;
}

function onCardClick(idx) {
  if (G.selectedCard === idx) {
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