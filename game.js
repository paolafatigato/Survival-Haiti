// ═══════════════════════════════════════════════════════════════
//  ESCAPE FROM SAINT-DOMINGUE — Game Logic
// ═══════════════════════════════════════════════════════════════

const TEAM_COLORS = [
  '#e74c3c','#e67e22','#c17817','#2ecc71','#3498db','#9b59b6'
];

// ── GAME STATE ──────────────────────────────────────────────────
let G = {
  teams: [],          // { name, color, tokens, items, eliminated }
  round: 0,
  maxRounds: 10,
  phase: 'idle',      // idle | event | discuss | team-select | rolling | result | gameover
  currentEvent: null,
  d20Event: null,
  d6Severity: null,
  activeTeamIdx: null,
  selectedAbility: null,
  abilityRoll: null,
  usedEventIndices: new Set(),
  allTeamResults: [],  // results for current round
  history: [],
};

// ── SETUP ───────────────────────────────────────────────────────
let setupTeamCount = 3;
let setupTeamItems = {}; // teamIdx -> Set of item ids

function initSetup() {
  // Team count buttons
  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setupTeamCount = parseInt(btn.dataset.n);
      document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTeamInputs();
    });
  });

  renderTeamInputs();
  renderItemPicker();

  document.getElementById('btn-start-game').addEventListener('click', startGame);
}

function renderTeamInputs() {
  const wrap = document.getElementById('team-inputs');
  wrap.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const div = document.createElement('div');
    div.className = 'team-input-wrap';
    div.id = `team-wrap-${i}`;

    const dot = document.createElement('div');
    dot.className = 'team-dot';
    dot.style.background = TEAM_COLORS[i];

    const inp = document.createElement('input');
    inp.className = 'team-input';
    inp.type = 'text';
    inp.placeholder = `Team ${i+1} name`;
    inp.dataset.idx = i;
    inp.id = `team-input-${i}`;
    inp.value = `Team ${i+1}`;
    if (i >= setupTeamCount) inp.disabled = true;

    div.appendChild(dot);
    div.appendChild(inp);
    wrap.appendChild(div);
    if (!setupTeamItems[i]) setupTeamItems[i] = new Set();
  }
  renderItemPicker();
}

function renderItemPicker() {
  // Show item picker for each team tab or share one set per team
  // For simplicity: single shared item grid with per-team selection
  // We'll do per-team item selection via a tab approach
  const container = document.getElementById('items-container');
  container.innerHTML = '';

  for (let i = 0; i < setupTeamCount; i++) {
    const teamDiv = document.createElement('div');
    teamDiv.style.marginBottom = '1.2rem';

    const header = document.createElement('div');
    header.style.cssText = `display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;`;
    header.innerHTML = `
      <div style="width:12px;height:12px;border-radius:50%;background:${TEAM_COLORS[i]};"></div>
      <span style="font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:2px;color:var(--ochre);">
        TEAM ${i+1} ITEMS <span style="color:var(--slate);" id="item-count-${i}">(0/5 selected)</span>
      </span>
    `;
    teamDiv.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'items-grid';

    GAME_DATA.ITEMS.forEach(item => {
      const chip = document.createElement('div');
      chip.className = 'item-chip';
      if (setupTeamItems[i] && setupTeamItems[i].has(item.id)) chip.classList.add('selected');
      chip.dataset.item = item.id;
      chip.dataset.team = i;
      chip.innerHTML = `<span class="item-em">${item.emoji}</span><span>${item.name}</span>`;
      chip.setAttribute('data-tip', item.desc + ' | ' + item.bonus);

      chip.addEventListener('click', () => {
        const set = setupTeamItems[i];
        if (set.has(item.id)) {
          set.delete(item.id);
          chip.classList.remove('selected');
        } else {
          if (set.size >= 5) { showNotification('⚠️ Maximum 5 items per team!'); return; }
          set.add(item.id);
          chip.classList.add('selected');
        }
        document.getElementById(`item-count-${i}`).textContent = `(${set.size}/5 selected)`;
      });
      grid.appendChild(chip);
    });

    teamDiv.appendChild(grid);
    container.appendChild(teamDiv);
  }
}

function startGame() {
  G.teams = [];
  G.maxRounds = parseInt(document.getElementById('select-rounds').value) || 10;
  for (let i = 0; i < setupTeamCount; i++) {
    const name = document.getElementById(`team-input-${i}`).value.trim() || `Team ${i+1}`;
    G.teams.push({
      name,
      color: TEAM_COLORS[i],
      tokens: 6,
      items: Array.from(setupTeamItems[i] || []),
      eliminated: false,
    });
  }
  G.round = 1;
  G.phase = 'idle';
  G.usedEventIndices = new Set();
  G.history = [];

  showScreen('game');
  renderSidebar();
  renderPhaseIdle();
}

// ── SCREENS ─────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ── SIDEBAR ─────────────────────────────────────────────────────
function renderSidebar() {
  document.getElementById('round-display').textContent = `Round ${G.round} / ${G.maxRounds}`;

  const sb = document.getElementById('teams-list');
  sb.innerHTML = '';

  G.teams.forEach((team, i) => {
    const card = document.createElement('div');
    card.className = 'team-score-card' +
      (i === G.activeTeamIdx ? ' active-team' : '') +
      (team.eliminated ? ' eliminated' : '');

    const maxTokens = 12;
    let pips = '';
    for (let p = 0; p < maxTokens; p++) {
      pips += `<div class="token-pip ${p < team.tokens ? 'filled' : ''}"></div>`;
    }

    const itemEmojis = team.items.map(id => {
      const item = GAME_DATA.ITEMS.find(it => it.id === id);
      return item ? `<span class="item-mini" data-tip="${item.name}">${item.emoji}</span>` : '';
    }).join('');

    card.innerHTML = `
      <div class="tscard-header">
        <div class="tscard-dot" style="background:${team.color}"></div>
        <span class="tscard-name">${team.name}</span>
        <span class="tscard-tokens">${team.tokens} 🏅</span>
      </div>
      <div class="token-bar">${pips}</div>
      <div class="team-items-mini">${itemEmojis}</div>
      ${team.eliminated ? '<div style="font-size:.7rem;color:var(--coral);margin-top:.3rem;">⚠ CAPTURED</div>' : ''}
    `;
    sb.appendChild(card);
  });
}

// ── MAIN CONTENT RENDERING ───────────────────────────────────────
function renderPhaseIdle() {
  G.phase = 'idle';
  G.activeTeamIdx = null;
  renderSidebar();

  const main = document.getElementById('main-area');
  main.innerHTML = `
    <div class="phase-header">
      <span class="phase-tag idle">Waiting</span>
      <div class="phase-line"></div>
      <span style="font-size:.85rem;color:var(--slate);">Round ${G.round} of ${G.maxRounds}</span>
    </div>
    <div class="idle-panel">
      <span class="idle-emoji">🎲</span>
      <div class="idle-title">Ready for Round ${G.round}?</div>
      <div class="idle-sub">Roll the D20 to reveal the next event</div>
      <br><br>
      <button class="btn btn-gold" onclick="rollEventDice()">Roll D20 — New Event 🎲</button>
    </div>
  `;
}

function rollEventDice() {
  // Animate and pick event
  const btn = event ? event.target : null;
  if (btn) btn.disabled = true;

  // Pick a random event not yet used
  const available = GAME_DATA.EVENTS.filter(e => !G.usedEventIndices.has(e.d20));
  if (available.length === 0) G.usedEventIndices.clear();
  const eventsPool = GAME_DATA.EVENTS.filter(e => !G.usedEventIndices.has(e.d20));
  const pickedEvent = eventsPool[Math.floor(Math.random() * eventsPool.length)];

  G.d20Event = pickedEvent.d20;
  G.currentEvent = pickedEvent;
  G.usedEventIndices.add(pickedEvent.d20);

  // Animate dice number
  const main = document.getElementById('main-area');
  main.innerHTML = `
    <div class="phase-header">
      <span class="phase-tag event">Event Revealed!</span>
      <div class="phase-line"></div>
    </div>
    <div style="text-align:center;padding:2rem 0;">
      <div style="font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:3px;color:var(--slate);margin-bottom:1rem;">ROLLING D20...</div>
      <div class="dice-face d20 rolling" id="anim-d20" style="width:120px;height:120px;margin:0 auto 1rem;font-size:3rem;">?</div>
    </div>
  `;

  let count = 0;
  const interval = setInterval(() => {
    document.getElementById('anim-d20').textContent = Math.ceil(Math.random() * 20);
    count++;
    if (count > 12) {
      clearInterval(interval);
      document.getElementById('anim-d20').textContent = pickedEvent.d20;
      document.getElementById('anim-d20').classList.remove('rolling');
      setTimeout(() => rollSeverityDice(pickedEvent), 600);
    }
  }, 60);
}

function rollSeverityDice(pickedEvent) {
  const d6 = Math.ceil(Math.random() * 6);
  G.d6Severity = d6;
  const sev = GAME_DATA.SEVERITY[d6];

  // Check if legendary
  if (pickedEvent.legendary) {
    showLegendaryOverlay(pickedEvent);
    return;
  }

  // Show severity animation then event card
  const main = document.getElementById('main-area');
  main.innerHTML = `
    <div style="text-align:center;padding:2rem 0;">
      <div style="font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:3px;color:var(--slate);margin-bottom:1rem;">ROLLING D6 — SEVERITY...</div>
      <div class="dice-face d6 rolling" id="anim-d6" style="width:80px;height:80px;margin:0 auto 1rem;font-size:2rem;">?</div>
    </div>
  `;

  let count = 0;
  const interval = setInterval(() => {
    document.getElementById('anim-d6').textContent = Math.ceil(Math.random() * 6);
    count++;
    if (count > 10) {
      clearInterval(interval);
      document.getElementById('anim-d6').textContent = d6;
      document.getElementById('anim-d6').classList.remove('rolling');
      setTimeout(() => renderEventCard(pickedEvent, sev), 700);
    }
  }, 60);
}

function renderEventCard(ev, sev) {
  G.phase = 'event';
  G.allTeamResults = [];

  const helpfulChips = ev.goodItems.map(id => {
    const item = GAME_DATA.ITEMS.find(it => it.id === id);
    return item ? `<span class="helpful-chip">${item.emoji} ${item.name}</span>` : '';
  }).join('');

  const sevText = sev.label === 'Mild' ? ev.severeMild : ev.severeHard;

  const main = document.getElementById('main-area');
  main.innerHTML = `
    <div class="phase-header">
      <span class="phase-tag event">Event — Round ${G.round}</span>
      <div class="phase-line"></div>
      <span style="font-size:.85rem;color:var(--slate);">D20: ${G.d20Event} &nbsp;·&nbsp; D6: ${G.d6Severity}</span>
    </div>

    <div class="event-card ${ev.legendary ? 'legendary' : ''}">
      <div class="event-d20">D20 · ${ev.d20}</div>
      <div class="event-title">${ev.title}</div>
      <div class="event-subtitle">${ev.subtitle}</div>
      <div class="event-desc">${ev.description}</div>
      <div class="event-question">${ev.question}</div>

      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
        <div class="severity-badge" style="color:${sev.color};border-color:${sev.color};">
          ⚔️ Severity: ${sev.label} &nbsp;·&nbsp; D6: ${G.d6Severity}
          ${sev.modifier < 0 ? `&nbsp;·&nbsp; Token modifier: ${sev.modifier}` : ''}
        </div>
        <div style="font-size:.85rem;color:var(--slate);font-style:italic;">${sevText}</div>
      </div>

      <div class="helpful-items">
        <div class="helpful-label">Helpful items →</div>
        <div class="helpful-chips">${helpfulChips}</div>
      </div>
    </div>

    <div class="sep"></div>
    <div style="font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:3px;color:var(--slate);margin-bottom:1rem;">
      DISCUSSION TIME — Teams decide their strategy (1–2 minutes)
    </div>
    <div style="background:rgba(193,120,23,0.08);border:1px solid rgba(193,120,23,0.2);border-radius:12px;padding:1rem;margin-bottom:1.5rem;font-size:.9rem;color:var(--sand);">
      💬 Each team should answer in English: <em>"We will use [item] and [ability] because..."</em>
    </div>

    <div style="font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:3px;color:var(--slate);margin-bottom:.8rem;">
      SELECT TEAM TO ROLL →
    </div>
    <div class="team-select-grid" id="team-select-grid"></div>
  `;

  renderTeamSelectButtons();
}

function renderTeamSelectButtons() {
  const grid = document.getElementById('team-select-grid');
  if (!grid) return;
  grid.innerHTML = '';

  G.teams.forEach((team, i) => {
    if (team.eliminated) return;
    const already = G.allTeamResults.find(r => r.teamIdx === i);

    const btn = document.createElement('button');
    btn.className = 'team-select-btn';
    btn.disabled = !!already;
    btn.style.opacity = already ? '.5' : '1';
    btn.style.borderColor = already ? '#2ecc71' : '';

    btn.innerHTML = `
      <div class="tsb-dot" style="background:${team.color}"></div>
      <div>
        <div class="tsb-name">${team.name}</div>
        <div style="font-size:.75rem;color:var(--slate);">${team.items.length} items</div>
      </div>
      <div class="tsb-tokens">${already ? '✔ Done' : team.tokens + ' 🏅'}</div>
    `;
    btn.addEventListener('click', () => selectTeamForRoll(i));
    grid.appendChild(btn);
  });

  // Check if all teams done
  const activeteams = G.teams.filter(t => !t.eliminated);
  if (G.allTeamResults.length === activeteams.length) {
    const div = document.createElement('div');
    div.style.cssText = 'grid-column:1/-1;text-align:center;margin-top:1rem;';
    div.innerHTML = `
      <button class="btn btn-gold" onclick="finishRound()" style="font-size:1rem;padding:1rem 2.5rem;">
        ✔ All Teams Done — Next Round →
      </button>
    `;
    grid.appendChild(div);
  }
}

function selectTeamForRoll(teamIdx) {
  G.activeTeamIdx = teamIdx;
  G.phase = 'rolling';
  G.selectedAbility = null;
  G.abilityRoll = null;
  renderSidebar();
  renderTeamRollPanel(teamIdx);
}

function renderTeamRollPanel(teamIdx) {
  const team = G.teams[teamIdx];
  const ev = G.currentEvent;
  const sev = GAME_DATA.SEVERITY[G.d6Severity];

  const teamItemsHtml = team.items.map(id => {
    const item = GAME_DATA.ITEMS.find(it => it.id === id);
    if (!item) return '';
    const isHelpful = ev.goodItems.includes(id);
    return `
      <div class="tts-item" style="${isHelpful ? 'border-color:rgba(46,204,113,0.4);background:rgba(46,204,113,0.08);' : ''}">
        ${item.emoji} ${item.name} ${isHelpful ? '<span style="color:#2ecc71;font-size:.75rem;">✔ useful</span>' : ''}
      </div>
    `;
  }).join('') || '<div style="color:var(--slate);font-size:.85rem;">No items selected</div>';

  const abilitiesHtml = GAME_DATA.ABILITIES.map(ab => {
    const isGood = ev.goodAbilities.includes(ab.id);
    return `
      <button class="ability-btn ${isGood ? 'good-ability' : ''}" data-ab="${ab.id}" onclick="selectAbility('${ab.id}', this)"
        style="${isGood ? 'border-color:rgba(193,120,23,0.4);' : ''}">
        <span class="ability-em">${ab.emoji}</span>
        <div class="ability-id">${ab.id}</div>
        <div class="ability-name">${ab.name}</div>
        ${isGood ? '<div style="font-size:.6rem;color:var(--ochre);margin-top:.2rem;">★ recommended</div>' : ''}
      </button>
    `;
  }).join('');

  const main = document.getElementById('main-area');
  main.innerHTML = `
    <div class="phase-header">
      <span class="phase-tag roll">Ability Check</span>
      <div class="phase-line"></div>
      <button class="btn btn-ghost" style="font-size:.8rem;padding:.4rem 1rem;" onclick="backToEvent()">← Back to event</button>
    </div>

    <div class="team-turn-section">
      <div class="tts-header">
        <div class="tts-dot" style="background:${team.color}"></div>
        <div>
          <div class="tts-name">${team.name}</div>
          <div style="font-size:.85rem;color:var(--slate);">${team.tokens} tokens &nbsp;·&nbsp; ${team.items.length} items</div>
        </div>
      </div>

      <div style="font-family:'Cinzel',serif;font-size:.65rem;letter-spacing:2px;color:var(--slate);margin-bottom:.5rem;">TEAM ITEMS</div>
      <div class="tts-items">${teamItemsHtml}</div>

      <div class="sep"></div>

      <div style="font-family:'Cinzel',serif;font-size:.65rem;letter-spacing:2px;color:var(--slate);margin-bottom:.7rem;">
        SELECT ABILITY BEING USED →
        <span style="color:var(--copper);font-style:italic;font-size:.8rem;font-family:'Crimson Pro',serif;"> (team explains their strategy first)</span>
      </div>
      <div class="ability-select">${abilitiesHtml}</div>

      <div class="sep"></div>

      <div style="font-family:'Cinzel',serif;font-size:.65rem;letter-spacing:2px;color:var(--slate);margin-bottom:.8rem;">ROLL D20 — ABILITY CHECK</div>
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
        <button class="btn btn-primary" id="btn-ability-roll" onclick="rollAbilityCheck()" ${!G.selectedAbility ? 'disabled' : ''}>
          🎲 Roll D20 Ability Check
        </button>
        <div style="font-size:.85rem;color:var(--slate);" id="ability-hint">Select an ability first</div>
      </div>
    </div>

    <div id="result-area"></div>
  `;
}

function selectAbility(abId, el) {
  G.selectedAbility = abId;
  document.querySelectorAll('.ability-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('btn-ability-roll').disabled = false;

  const ab = GAME_DATA.ABILITIES.find(a => a.id === abId);
  document.getElementById('ability-hint').textContent = `Using: ${ab.emoji} ${ab.name} — ${ab.desc}`;
}

function rollAbilityCheck() {
  if (!G.selectedAbility) return;
  document.getElementById('btn-ability-roll').disabled = true;

  const roll = Math.ceil(Math.random() * 20);
  G.abilityRoll = roll;

  // Animate
  const btn = document.getElementById('btn-ability-roll');
  btn.textContent = '🎲 Rolling...';

  let count = 0;
  let animVal = document.createElement('div');
  document.getElementById('result-area').innerHTML = `
    <div style="text-align:center;padding:1.5rem 0;">
      <div class="dice-face d20 rolling" id="roll-anim" style="width:100px;height:100px;margin:0 auto 1rem;font-size:2.5rem;">?</div>
    </div>
  `;

  const interval = setInterval(() => {
    const el = document.getElementById('roll-anim');
    if (el) el.textContent = Math.ceil(Math.random() * 20);
    count++;
    if (count > 15) {
      clearInterval(interval);
      if (el) {
        el.textContent = roll;
        el.classList.remove('rolling');
        if (roll === 20) el.classList.add('nat20');
        if (roll === 1) el.classList.add('crit-fail');
      }
      setTimeout(() => showAbilityResult(roll), 500);
    }
  }, 60);
}

function showAbilityResult(roll) {
  const team = G.teams[G.activeTeamIdx];
  const ev = G.currentEvent;
  const sev = GAME_DATA.SEVERITY[G.d6Severity];
  const ab = GAME_DATA.ABILITIES.find(a => a.id === G.selectedAbility);

  // Determine outcome
  const outcome = GAME_DATA.ROLL_OUTCOMES.find(o => roll >= o.min && roll <= o.max);

  // Check if they have a helpful item
  const hasHelpfulItem = team.items.some(id => ev.goodItems.includes(id));

  // Apply severity modifier (only on failure)
  let finalTokens = outcome.tokens;
  if (finalTokens < 0) finalTokens += sev.modifier; // severity makes failures worse
  if (hasHelpfulItem && finalTokens >= 0) finalTokens += 1; // item bonus on success
  finalTokens = Math.max(-3, Math.min(finalTokens, 4));

  // NAT 20 legendary bonus
  if (roll === 20) {
    G.teams.forEach(t => { if (!t.eliminated && t !== team) { t.tokens = Math.min(12, t.tokens + 1); } });
  }

  // Apply to team
  team.tokens = Math.max(0, Math.min(12, team.tokens + finalTokens));

  // Record result
  G.allTeamResults.push({
    teamIdx: G.activeTeamIdx,
    roll, outcome, finalTokens, hasHelpfulItem, ability: ab.id
  });

  // Check elimination
  if (team.tokens <= 0) {
    team.eliminated = true;
    team.tokens = 0;
  }

  // Render result
  const tokenDisplay = finalTokens > 0 ? `+${finalTokens} 🏅` : finalTokens < 0 ? `${finalTokens} 🏅` : '0 🏅';
  const tokenColor = finalTokens > 0 ? '#2ecc71' : finalTokens < 0 ? '#e74c3c' : '#888';

  const resultArea = document.getElementById('result-area');
  if (!resultArea) return;

  resultArea.innerHTML = `
    <div class="result-panel" style="background:rgba(0,0,0,0.3);border-color:${outcome.color};">
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:.8rem;flex-wrap:wrap;">
        <div class="dice-face d20 ${roll===20?'nat20':roll===1?'crit-fail':''}" style="width:60px;height:60px;font-size:1.5rem;flex-shrink:0;">
          ${roll}
        </div>
        <div>
          <div class="result-outcome" style="color:${outcome.color};">${outcome.label}</div>
          <div style="font-size:.85rem;color:var(--slate);">${ab.emoji} ${ab.name} &nbsp;·&nbsp; ${hasHelpfulItem ? '✔ Helpful item bonus' : 'No helpful item'}</div>
        </div>
        <div style="margin-left:auto;font-size:2rem;font-weight:700;color:${tokenColor};">${tokenDisplay}</div>
      </div>

      ${sev.modifier < 0 ? `<div style="font-size:.8rem;color:var(--coral);margin-bottom:.6rem;">⚠ Severity penalty applied: ${sev.modifier}</div>` : ''}

      <div class="result-narrative">${outcome.narrative}</div>

      ${team.eliminated ? `<div style="font-family:'Cinzel',serif;font-size:.9rem;color:var(--coral);margin-top:.8rem;border-top:1px solid rgba(249,111,93,0.3);padding-top:.8rem;">
        ⚠ ${team.name} has been captured! They continue the game with a −1 penalty on all future rolls.
      </div>` : ''}

      ${roll === 20 ? `<div style="color:var(--gold);margin-top:.8rem;font-size:.9rem;">✨ NAT 20: All other teams gain +1 token!</div>` : ''}
    </div>

    <div style="margin-top:1rem;display:flex;gap:.7rem;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="backToEvent()">← Back to teams</button>
    </div>
  `;

  renderSidebar();
  // Refresh the back-to-event button on the sidebar area
}

function backToEvent() {
  G.activeTeamIdx = null;
  renderSidebar();
  // Re-render event card
  const ev = G.currentEvent;
  const sev = GAME_DATA.SEVERITY[G.d6Severity];
  renderEventCard(ev, sev);
}

function finishRound() {
  G.round++;
  if (G.round > G.maxRounds) {
    showGameOver();
    return;
  }
  // Check if all teams are eliminated
  const alive = G.teams.filter(t => !t.eliminated);
  if (alive.length === 0) { showGameOver(); return; }

  G.activeTeamIdx = null;
  G.phase = 'idle';
  renderSidebar();
  renderPhaseIdle();
}

function showLegendaryOverlay(ev) {
  const overlay = document.getElementById('legendary-overlay');
  overlay.style.display = 'flex';

  // All teams get +2 tokens
  G.teams.forEach(t => {
    if (!t.eliminated) t.tokens = Math.min(12, t.tokens + 2);
  });

  document.getElementById('legendary-close-btn').onclick = () => {
    overlay.style.display = 'none';
    G.allTeamResults = G.teams.filter(t => !t.eliminated).map((t, i) => ({ teamIdx: i, roll: 20, legendary: true, finalTokens: 2 }));
    renderSidebar();
    finishRound();
  };
  renderSidebar();
}

function showGameOver() {
  showScreen('gameover');

  const sorted = [...G.teams].sort((a, b) => b.tokens - a.tokens);
  const lb = document.getElementById('final-leaderboard');
  lb.innerHTML = '';

  sorted.forEach((team, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row ' + (i === 0 ? 'winner' : '');
    row.innerHTML = `
      <div class="lb-rank">${['🥇','🥈','🥉','4th','5th','6th'][i]}</div>
      <div class="lb-dot" style="background:${team.color}"></div>
      <div class="lb-name">${team.name}</div>
      <div class="lb-score">${team.tokens} tokens</div>
    `;
    lb.appendChild(row);
  });

  document.getElementById('winner-name').textContent = sorted[0].name;
}

// ── NOTIFICATION ─────────────────────────────────────────────────
function showNotification(msg) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

// ── RESET ────────────────────────────────────────────────────────
function resetGame() {
  setupTeamItems = {};
  for (let i = 0; i < 6; i++) setupTeamItems[i] = new Set();
  G = {
    teams: [], round: 0, maxRounds: 10, phase: 'idle',
    currentEvent: null, d20Event: null, d6Severity: null,
    activeTeamIdx: null, selectedAbility: null, abilityRoll: null,
    usedEventIndices: new Set(), allTeamResults: [], history: [],
  };
  showScreen('setup');
  renderTeamInputs();
}

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSetup();
  document.getElementById('btn-reset').addEventListener('click', resetGame);
  document.getElementById('btn-gameover-reset').addEventListener('click', resetGame);
  document.getElementById('select-rounds').addEventListener('change', function() {
    G.maxRounds = parseInt(this.value);
  });
});

// Expose all onclick-referenced functions globally
window.startGame       = startGame;
window.rollEventDice   = rollEventDice;
window.selectAbility   = selectAbility;
window.rollAbilityCheck = rollAbilityCheck;
window.backToEvent     = backToEvent;
window.finishRound     = finishRound;
window.resetGame       = resetGame;
