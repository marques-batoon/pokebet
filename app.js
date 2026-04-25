// ===== STATE =====
let isDemoMode = true;
let walletConnected = false;
let walletAddress = null;
let matches = [];
let transactions = [];
let currentFilter = 'all';
let oracleCallCount = 0;
let payoutTotal = 0;
let volumeTotal = 0;
let blockNum = 20000000;
let gasPrice = 22;
let activeBattleRoom = null;
let psWs = null;
let battleTurn = 0;
let roomsWatched = 0;
let resultsSent = 0;
let psConnected = false;
let battleInterval = null;

const pokePool = [
  {name:'Charizard',id:6},{name:'Pikachu',id:25},{name:'Mewtwo',id:150},
  {name:'Gengar',id:94},{name:'Dragonite',id:149},{name:'Blastoise',id:9},
  {name:'Venusaur',id:3},{name:'Snorlax',id:143},{name:'Alakazam',id:65},
  {name:'Gyarados',id:130},{name:'Machamp',id:68},{name:'Tyranitar',id:248},
  {name:'Salamence',id:373},{name:'Garchomp',id:445},{name:'Lucario',id:448}
];

const movePools = ['Flamethrower','Thunderbolt','Ice Beam','Earthquake','Surf',
  'Psychic','Shadow Ball','Dragon Dance','Swords Dance','Close Combat',
  'Stealth Rock','Toxic','Will-O-Wisp','Protect','Hydro Pump'];

const demoPlayers = [
  'AshKetchum','GaryOak','MistyWater','BrockRock','TrainerRed',
  'ChallengerN','ElitePaul','ChampionCynthia','Giovann1','SilverBull'
];

// ===== POKEMON NAME -> ID MAP =====
const pokeNameMap = {
  'bulbasaur':1,'ivysaur':2,'venusaur':3,'charmander':4,'charmeleon':5,'charizard':6,
  'squirtle':7,'wartortle':8,'blastoise':9,'pikachu':25,'raichu':26,'mewtwo':150,
  'mew':151,'gengar':94,'gastly':92,'haunter':93,'dragonite':149,'dratini':147,
  'dragonair':148,'snorlax':143,'alakazam':65,'abra':63,'kadabra':64,'gyarados':130,
  'magikarp':129,'machamp':68,'machop':66,'machoke':67,'tyranitar':248,'larvitar':246,
  'pupitar':247,'salamence':373,'bagon':371,'shelgon':372,'garchomp':445,'gible':443,
  'gabite':444,'lucario':448,'riolu':447,'blaziken':257,'torchic':255,'combusken':256,
  'swampert':260,'mudkip':258,'marshtomp':259,'metagross':376,'beldum':374,'metang':375,
  'togekiss':468,'togepi':175,'togetic':176,'infernape':392,'chimchar':390,'monferno':391,
  'empoleon':395,'piplup':393,'prinplup':394,'sneasler':903,'arceus':493,'eevee':133,
  'vaporeon':134,'jolteon':135,'flareon':136,'espeon':196,'umbreon':197,'leafeon':470,
  'glaceon':471,'sylveon':700,'luxray':405,'shinx':403,'luxio':404,'staraptor':398,
  'starly':396,'staravia':397,'garchomp':445,'rotom':479,'togekiss':468,
  'gliscor':472,'gligar':207,'hippowdon':450,'hippopotas':449,'skarmory':227,
  'ferrothorn':598,'ferroseed':597,'scizor':212,'scyther':123,'volcarona':637,
  'larvesta':636,'landorus':645,'thundurus':642,'tornadus':641,'kyurem':646,
  'reshiram':643,'zekrom':644,'victini':494,'zoroark':571,'zorua':570,
  'chandelure':609,'litwick':607,'lampent':608,'excadrill':530,'drilbur':529,
  'conkeldurr':534,'timburr':532,'gurdurr':533,'haxorus':612,'axew':610,'fraxure':611,
  'hydreigon':635,'deino':633,'zweilous':634,'braviary':628,'rufflet':627,
  'reuniclus':579,'solosis':577,'duosion':578,'golurk':623,'golett':622,
  'bisharp':625,'pawniard':624,'klinklang':601,'klink':599,'klang':600,
  'galvantula':596,'joltik':595,'elektross':604,'tynamo':602,'eelektrik':603,
  'stunfisk':618,'mienshao':620,'mienfoo':619,'druddigon':621,'bouffalant':626,
  'durant':632,'heatmor':631,'deino':633,'zweilous':634,'hydreigon':635,
  'cobalion':638,'terrakion':639,'virizion':640,'tornadus':641,'thundurus':642,
  'reshiram':643,'zekrom':644,'landorus':645,'kyurem':646,'keldeo':647,
  'meloetta':648,'genesect':649
};

const POKEBALL_PLACEHOLDER = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';

async function getPokeId(name) {
  if (!name) return null;
  const clean = name.toLowerCase()
    .replace(/\-[a-z]+$/,'')
    .replace(/[^a-z]/g,'')
    .trim();
  if (pokeNameMap[clean]) return pokeNameMap[clean];
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${clean}`);
    if (!res.ok) return null;
    const data = await res.json();
    pokeNameMap[clean] = data.id;
    return data.id;
  } catch {
    return null;
  }
}

function parseHpPercent(hpStr) {
  if (!hpStr || hpStr.includes('fnt')) return 0;
  const match = hpStr.match(/(\d+)\/(\d+)/);
  if (!match) return 100;
  return Math.round((parseInt(match[1]) / parseInt(match[2])) * 100);
}

// ===== BATTLE LOG =====
function addLogLine(turn, text) {
  const log = document.getElementById('battle-log');
  if (!log) return;
  // Remove "waiting" placeholder
  const waiting = log.querySelector('.waiting-msg');
  if (waiting) waiting.remove();
  const div = document.createElement('div');
  div.className = 'log-line';
  div.innerHTML = `<span class="log-turn">${turn}</span><span class="log-text">${text}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function clearBattleLog() {
  const log = document.getElementById('battle-log');
  if (log) log.innerHTML = '<div class="log-line waiting-msg"><span class="log-turn">SYS</span><span class="log-text">Connecting to battle...</span></div>';
}

// ===== HP BARS =====
function updateHPBar(side, hp) {
  const fill = document.getElementById(side + '-hp-fill');
  const text = document.getElementById(side + '-hp-text');
  if (!fill || !text) return;
  const pct = Math.max(0, Math.min(100, hp));
  fill.style.width = pct + '%';
  fill.className = 'poke-hp-fill ' + (pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low');
  text.textContent = pct + '%';
}

// ===== REAL PS! MESSAGE HANDLER =====
function handlePSMessage(data) {
  const lines = data.split('\n');
  let currentRoom = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('>')) {
      currentRoom = line.slice(1).trim();
      if (currentRoom.startsWith('battle-')) {
        activeBattleRoom = currentRoom;
        document.getElementById('battle-room-id').textContent = 'Watching: ' + currentRoom;
        document.getElementById('log-match-id').textContent = currentRoom.slice(0,20) + '…';
      }
      continue;
    }

    if (!line.startsWith('|')) continue;
    const parts = line.split('|');
    if (parts.length < 2) continue;
    const type = parts[1];

    switch(type) {
      case 'player':
        if (parts[2] === 'p1') {
          document.getElementById('p1-trainer').textContent = parts[3] || 'Player 1';
        } else if (parts[2] === 'p2') {
          document.getElementById('p2-trainer').textContent = parts[3] || 'Player 2';
        }
        break;

      case 'switch': {
        const switcher = parts[2] || '';
        const pokeRaw = (parts[3] || '').split(',')[0].trim();
        const side = switcher.startsWith('p1') ? 'p1' : 'p2';
        document.getElementById(side + '-poke').textContent = pokeRaw;
        updateHPBar(side, 100);
        const trainerName = document.getElementById(side + '-trainer').textContent;
        addLogLine('↔', `<span class="hl">${trainerName}</span> sent out <span class="move">${pokeRaw}</span>!`);
        getPokeId(pokeRaw).then(id => {
          document.getElementById(side + '-sprite').src = id
            ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
            : POKEBALL_PLACEHOLDER;
        });
        break;
      }

      case 'turn':
        battleTurn = parseInt(parts[2]) || battleTurn + 1;
        document.getElementById('battle-turn-display').textContent = 'Turn ' + battleTurn;
        document.getElementById('battle-spinner').style.display = 'block';
        document.getElementById('battle-status-text').textContent = 'Battle in progress...';
        addLogLine('T' + parts[2], '<span class="hl">— Turn ' + parts[2] + ' —</span>');
        break;

      case 'move': {
        const moverRaw = parts[2] || '';
        const moveName = parts[3] || '';
        const moverName = moverRaw.includes(':') ? moverRaw.split(':')[1].trim() : moverRaw;
        const side = moverRaw.startsWith('p1') ? 'P1' : 'P2';
        addLogLine(side, `<span class="hl">${moverName}</span> used <span class="move">${moveName}</span>!`);
        addOracleLog('▶ ' + moverName + ': ' + moveName);
        break;
      }

      case '-damage': {
        const target = parts[2] || '';
        const hpStr = parts[3] || '';
        const side = target.startsWith('p1') ? 'p1' : 'p2';
        const pct = parseHpPercent(hpStr);
        updateHPBar(side, pct);
        const targetName = target.includes(':') ? target.split(':')[1].trim() : target;
        addLogLine('', `→ <span class="dmg">${targetName}: ${pct}% HP remaining</span>`);
        break;
      }

      case '-heal': {
        const target = parts[2] || '';
        const hpStr = parts[3] || '';
        const side = target.startsWith('p1') ? 'p1' : 'p2';
        const pct = parseHpPercent(hpStr);
        updateHPBar(side, pct);
        const targetName = target.includes(':') ? target.split(':')[1].trim() : target;
        addLogLine('', `→ <span class="heal">${targetName} restored HP: ${pct}%</span>`);
        break;
      }

      case 'faint': {
        const fainted = parts[2] || '';
        const side = fainted.startsWith('p1') ? 'p1' : 'p2';
        const faintName = fainted.includes(':') ? fainted.split(':')[1].trim() : fainted;
        updateHPBar(side, 0);
        addLogLine('💀', `<span class="dmg">${faintName} fainted!</span>`);
        break;
      }

      case '-status': {
        const target = parts[2] || '';
        const status = parts[3] || '';
        const targetName = target.includes(':') ? target.split(':')[1].trim() : target;
        addLogLine('', `→ <span class="move">${targetName} was ${status}!</span>`);
        break;
      }

      case '-supereffective':
        addLogLine('', `→ <span class="dmg">It's super effective!</span>`);
        break;

      case '-resisted':
        addLogLine('', `→ <span class="log-text">It's not very effective...</span>`);
        break;

      case '-crit':
        addLogLine('', `→ <span class="dmg">A critical hit!</span>`);
        break;

      case '-miss':
        addLogLine('', `→ <span style="color:var(--text-dim)">The attack missed!</span>`);
        break;

      case 'win': {
        const winner = (parts[2] || '').trim();
        addLogLine('🏆', `<span class="win">🏆 ${winner} wins the battle!</span>`);
        document.getElementById('battle-spinner').style.display = 'none';
        document.getElementById('battle-status-text').textContent = '✅ Battle complete';
        addOracleLog('▶ Winner: ' + winner);
        addOracleLog('▶ Oracle settling match on-chain...');
        oracleCallCount++;
        resultsSent++;
        document.getElementById('results-sent').textContent = resultsSent;
        document.getElementById('stat-oracle').textContent = oracleCallCount;
        showNotif('success', '🏆 Battle Complete!', winner + ' won! Oracle settling bet...');
        setTimeout(() => {
          addTx('payout', currentRoom || activeBattleRoom || 'match', '? ETH');
          addOracleLog('▶ settleMatch() confirmed ✅');
          showNotif('success', '⛓️ Payout Complete', 'Winnings sent to ' + winner);
        }, 2000);
        break;
      }

      case 'tie':
        addLogLine('🤝', `<span class="win">The battle ended in a tie!</span>`);
        document.getElementById('battle-spinner').style.display = 'none';
        document.getElementById('battle-status-text').textContent = 'Tie — refunding players';
        break;

      case 'start':
        clearBattleLog();
        addLogLine('SYS', '<span class="hl">Battle started!</span>');
        document.getElementById('battle-spinner').style.display = 'block';
        document.getElementById('battle-status-text').textContent = 'Battle in progress...';
        break;
    }
  }
}

// ===== CONNECT TO PS! VIA ORACLE PROXY =====
function connectToPS() {
  try {
    const wsUrl = isDemoMode ? 'ws://localhost:3001' : 'ws://localhost:3001';
    psWs = new WebSocket(wsUrl);

    psWs.onopen = () => {
      psConnected = true;
      document.getElementById('ps-dot').style.background = 'var(--neon-green)';
      document.getElementById('ps-status').textContent = 'Connected via Oracle';
      addOracleLog('▶ Connected to oracle proxy :3001');
      addOracleLog('▶ Real PS! battles streaming');
      document.getElementById('oracle-badge').textContent = 'LIVE';
      document.getElementById('oracle-conn').textContent = 'Oracle Proxy → PS!';
      roomsWatched++;
      document.getElementById('rooms-watched').textContent = roomsWatched;
    };

    psWs.onmessage = (evt) => {
      handlePSMessage(evt.data);
    };

    psWs.onerror = () => {
      psConnected = false;
      document.getElementById('ps-dot').style.background = 'var(--neon-yellow)';
      document.getElementById('ps-status').textContent = 'Demo Sim Active';
      addOracleLog('▶ Oracle proxy not found on :3001');
      addOracleLog('▶ Start oracle: node oracle.js');
      document.getElementById('oracle-badge').textContent = 'DEMO';
    };

    psWs.onclose = () => {
      psConnected = false;
      document.getElementById('ps-dot').style.background = 'var(--neon-yellow)';
      addOracleLog('▶ Proxy disconnected — retrying in 3s...');
      setTimeout(connectToPS, 3000);
    };
  } catch(e) {
    addOracleLog('▶ WebSocket error: ' + e.message);
  }
}

// ===== JOIN PS! ROOM =====
function joinPSRoom(roomId) {
  if (psWs && psWs.readyState === WebSocket.OPEN) {
    psWs.send('|/join ' + roomId);
    addOracleLog('▶ Joined room: ' + roomId);
    roomsWatched++;
    document.getElementById('rooms-watched').textContent = roomsWatched;
    clearBattleLog();
    document.getElementById('battle-room-id').textContent = 'Watching: ' + roomId;
    document.getElementById('battle-spinner').style.display = 'block';
    document.getElementById('battle-status-text').textContent = 'Loading battle...';
  } else {
    addOracleLog('▶ Not connected — cannot join room');
  }
}

// ===== DEMO MATCH SEED DATA =====
function seedDemoMatches() {
  const now = Date.now();
  matches = [
    createDemoMatch('PENDING', 0.1, 0.1, 'battle-gen9randombattle-2847519', 0),
    createDemoMatch('LIVE', 0.25, 0.25, 'battle-gen9ou-1039472', -60000),
    createDemoMatch('LIVE', 0.5, 0.5, 'battle-gen9randombattle-9182736', -120000),
    createDemoMatch('COMPLETE', 0.05, 0.05, 'battle-gen9randombattle-7654321', -3600000),
  ];
  renderMatches();
  updateStats();
}

function createDemoMatch(status, stake1, stake2, roomId, timeOffset) {
  const p1 = demoPlayers[Math.floor(Math.random()*demoPlayers.length)];
  const p2 = demoPlayers.filter(p=>p!==p1)[Math.floor(Math.random()*(demoPlayers.length-1))];
  const poke1 = pokePool[Math.floor(Math.random()*pokePool.length)];
  const poke2 = pokePool.filter(p=>p!==poke1)[Math.floor(Math.random()*(pokePool.length-1))];
  const id = '0x' + Math.random().toString(16).substr(2,16);
  const winner = status === 'COMPLETE' ? (Math.random()>0.5 ? p1 : p2) : null;
  if(status !== 'PENDING') { volumeTotal += stake1 + stake2; }
  if(status === 'COMPLETE') { payoutTotal += stake1 + stake2; }
  return { id, p1, p2, poke1, poke2, stake1, stake2, status, roomId, winner, time: Date.now() + timeOffset };
}

// ===== RENDER MATCHES =====
function renderMatches() {
  const list = document.getElementById('matches-list');
  const filtered = matches.filter(m => {
    if(currentFilter === 'all') return true;
    if(currentFilter === 'open') return m.status === 'PENDING';
    if(currentFilter === 'live') return m.status === 'LIVE';
    if(currentFilter === 'complete') return m.status === 'COMPLETE';
    return true;
  });

  if(filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🏟️</div><p>No matches found.<br>Create a new match to start betting!</p></div>`;
    return;
  }
  list.innerHTML = filtered.map(m => renderMatchCard(m)).join('');
}

function renderMatchCard(m) {
  const statusClass = m.status === 'PENDING' ? 'pending' : m.status === 'LIVE' ? 'live' : 'complete';
  const pot = (m.stake1 + (m.stake2||0)).toFixed(3);
  const p1Winner = m.winner === m.p1;
  const p2Winner = m.winner === m.p2;
  const sprite1 = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${m.poke1.id}.png`;
  const sprite2 = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${m.poke2.id}.png`;
  const actionBtn = m.status === 'PENDING'
    ? `<button class="bet-btn primary" onclick="event.stopPropagation();joinMatch('${m.id}')">JOIN & BET ⚡</button>`
    : m.status === 'LIVE'
    ? `<button class="bet-btn view" onclick="event.stopPropagation();watchBattle('${m.id}')">👁 WATCH LIVE</button>`
    : `<button class="bet-btn disabled">SETTLED</button>`;

  return `
  <div class="match-card ${statusClass}" onclick="watchBattle('${m.id}')">
    <div class="match-header">
      <div class="match-id">MATCH ${m.id.substr(0,10)}… · ${m.roomId}</div>
      <div class="match-status"><span class="status-dot ${statusClass}"></span>${m.status === 'PENDING' ? 'OPEN' : m.status}</div>
    </div>
    <div class="match-body">
      <div class="player-side ${p1Winner?'winner':''}">
        <div class="player-avatar"><img src="${sprite1}" alt="${m.poke1.name}"></div>
        <div class="player-name">${m.p1}</div>
        <div class="player-stake">${m.stake1} ETH</div>
        <div style="font-size:9px;color:var(--text-dim);margin-top:4px;">${m.poke1.name}</div>
        ${p1Winner ? '<div class="winner-badge">🏆 WINNER</div>' : ''}
      </div>
      <div class="vs-divider">VS<br><span style="font-size:9px;color:var(--text-dim);font-family:var(--mono);">${timeAgo(m.time)}</span></div>
      <div class="player-side ${p2Winner?'winner':''}">
        <div class="player-avatar"><img src="${sprite2}" alt="${m.poke2.name}"></div>
        <div class="player-name">${m.p2}</div>
        <div class="player-stake">${m.stake2||'?'} ETH</div>
        <div style="font-size:9px;color:var(--text-dim);margin-top:4px;">${m.poke2.name}</div>
        ${p2Winner ? '<div class="winner-badge">🏆 WINNER</div>' : ''}
      </div>
    </div>
    <div class="match-footer">
      <div class="match-pot">Total pot: <span>${pot} ETH</span></div>
      ${actionBtn}
    </div>
  </div>`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if(diff < 60000) return 'just now';
  if(diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  return Math.floor(diff/3600000) + 'h ago';
}

// ===== WATCH BATTLE =====
function watchBattle(matchId) {
  const match = matches.find(m => m.id === matchId);
  if(!match) return;

  document.getElementById('log-match-id').textContent = match.id.substr(0,12) + '…';
  document.getElementById('p1-trainer').textContent = match.p1;
  document.getElementById('p2-trainer').textContent = match.p2;
  document.getElementById('p1-poke').textContent = match.poke1.name;
  document.getElementById('p2-poke').textContent = match.poke2.name;
  document.getElementById('p1-sprite').src = match.poke1.id
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${match.poke1.id}.png`
    : POKEBALL_PLACEHOLDER;
  document.getElementById('p2-sprite').src = match.poke2.id
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${match.poke2.id}.png`
    : POKEBALL_PLACEHOLDER;
  updateHPBar('p1', 100);
  updateHPBar('p2', 100);

  if(match.status === 'LIVE') {
    // Join the real PS! room via proxy
    joinPSRoom(match.roomId);
  } else if(match.status === 'COMPLETE') {
    showNotif('info', '📋 Match Complete', `Winner: ${match.winner}`);
  }
}

// ===== JOIN MATCH =====
function joinMatch(matchId) {
  const match = matches.find(m => m.id === matchId);
  if(!match) return;
  if(!isDemoMode && !walletConnected) {
    showNotif('error', '🔒 Wallet Required', 'Connect MetaMask to join live matches.');
    return;
  }
  const playerName = isDemoMode ? demoPlayers[Math.floor(Math.random()*demoPlayers.length)] : (walletAddress || 'You');
  match.p2 = playerName;
  match.stake2 = match.stake1;
  match.status = 'LIVE';
  volumeTotal += match.stake2;
  addTx('stake', match.id, match.stake2.toFixed(3) + ' ETH');
  renderMatches();
  updateStats();
  showNotif('success', '⚡ Bet Placed!', `Joined match with ${match.stake2} ETH stake!`);
  setTimeout(() => watchBattle(matchId), 500);
}

// ===== CREATE MATCH =====
function openCreateModal() {
  if(!isDemoMode && !walletConnected) {
    showNotif('error', '🔒 Wallet Required', 'Connect your wallet first.');
    return;
  }
  if(isDemoMode) {
    document.getElementById('opponent-addr').value = demoPlayers[Math.floor(Math.random()*demoPlayers.length)];
    document.getElementById('ps-room-id').value = '';
    document.getElementById('stake-amount').value = '0.05';
  }
  document.getElementById('create-modal').classList.add('open');
}

function closeCreateModal() {
  document.getElementById('create-modal').classList.remove('open');
}

function setStake(val) {
  document.getElementById('stake-amount').value = val;
}

function createMatch() {
  const opp = document.getElementById('opponent-addr').value.trim();
  const roomId = document.getElementById('ps-room-id').value.trim();
  const stakeVal = parseFloat(document.getElementById('stake-amount').value);

  if(!opp || !roomId || isNaN(stakeVal) || stakeVal <= 0) {
    showNotif('error', '❌ Invalid Input', 'Please fill in all fields.');
    return;
  }

  const poke1 = pokePool[Math.floor(Math.random()*pokePool.length)];
  const poke2 = pokePool.filter(p=>p!==poke1)[Math.floor(Math.random()*(pokePool.length-1))];
  const playerName = isDemoMode ? demoPlayers[Math.floor(Math.random()*demoPlayers.length)] : (walletAddress || 'You');
  const id = '0x' + Math.random().toString(16).substr(2,16);

  const newMatch = { id, p1: playerName, p2: opp, poke1, poke2,
    stake1: stakeVal, stake2: 0, status: 'LIVE',
    roomId, winner: null, time: Date.now() };

  matches.unshift(newMatch);
  volumeTotal += stakeVal;
  addTx('stake', id, stakeVal.toFixed(3) + ' ETH');
  renderMatches();
  updateStats();
  closeCreateModal();

  // Immediately join the PS! room
  joinPSRoom(roomId);

  showNotif('success', '✅ Match Created!', `Watching room: ${roomId}`);
  addOracleLog('▶ New match: ' + roomId);
}

// ===== FILTER TABS =====
function filterMatches(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderMatches();
}

// ===== WALLET =====
async function connectWallet() {
  if(isDemoMode) {
    showNotif('info', 'ℹ️ Demo Mode', 'Disable demo mode first to connect a real wallet.');
    return;
  }
  if(walletConnected) return;
  if(typeof window.ethereum === 'undefined') {
    showNotif('error', '❌ No Wallet', 'MetaMask not detected.');
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    walletAddress = accounts[0];
    walletConnected = true;
    document.getElementById('wallet-btn').classList.add('connected');
    document.getElementById('wallet-label').textContent = walletAddress.substr(0,6) + '...' + walletAddress.slice(-4);
    document.getElementById('eth-dot').style.background = 'var(--neon-green)';
    document.getElementById('eth-status').textContent = 'Wallet: ' + walletAddress.substr(0,6) + '…';
    showNotif('success', '🔗 Wallet Connected', `Connected: ${walletAddress.substr(0,10)}…`);
  } catch(e) {
    showNotif('error', '❌ Connection Failed', e.message || 'Failed to connect.');
  }
}

// ===== DEMO MODE TOGGLE =====
function toggleDemoMode(isDemo) {
  isDemoMode = isDemo;
  document.getElementById('demo-badge').style.display = isDemo ? 'inline-flex' : 'none';
  document.getElementById('demo-mode-indicator').style.display = isDemo ? 'flex' : 'none';
  document.getElementById('demo-label-on').classList.toggle('active', isDemo);
  document.getElementById('demo-label-off').classList.toggle('active', !isDemo);
  if(!isDemo) {
    showNotif('info', '🔴 Live Mode', 'Connect MetaMask to bet real ETH.');
  } else {
    showNotif('info', '⚡ Demo Mode', 'No wallet needed. Using real PS! battles.');
  }
}

// ===== NOTIFICATIONS =====
function showNotif(type, title, desc) {
  const container = document.getElementById('notif-container');
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const n = document.createElement('div');
  n.className = `notif ${type}`;
  n.innerHTML = `<div class="notif-icon">${icons[type]||'📢'}</div>
    <div class="notif-text">
      <div class="notif-title ${type}">${title}</div>
      <div class="notif-desc">${desc}</div>
    </div>`;
  container.appendChild(n);
  setTimeout(() => {
    n.style.opacity='0'; n.style.transform='translateX(20px)'; n.style.transition='all 0.3s';
    setTimeout(()=>n.remove(), 300);
  }, 4000);
}

// ===== TX FEED =====
function addTx(type, matchId, detail) {
  const list = document.getElementById('tx-list');
  const hash = '0x' + Math.random().toString(16).substr(2,40);
  const placeholder = list.querySelector('div[style]');
  if(placeholder) list.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'tx-item';
  item.innerHTML = `<span class="tx-type ${type}">${type.toUpperCase()}</span>
    <span class="tx-hash">${hash}</span>
    <span class="tx-amt">${detail}</span>`;
  list.prepend(item);
  while(list.children.length > 5) list.removeChild(list.lastChild);
}

// ===== ORACLE LOG =====
function addOracleLog(text) {
  const log = document.getElementById('oracle-log');
  if (!log) return;
  const div = document.createElement('div');
  div.innerHTML = text.includes('✅') || text.includes('Winner') || text.includes('confirmed')
    ? `<span style="color:var(--neon-green)">${text}</span>`
    : text.includes('Error') || text.includes('failed')
    ? `<span style="color:var(--neon-red)">${text}</span>`
    : text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ===== STATS =====
function updateStats() {
  document.getElementById('stat-volume').textContent = volumeTotal.toFixed(2);
  document.getElementById('stat-active').textContent = matches.filter(m=>m.status==='LIVE').length;
  document.getElementById('stat-oracle').textContent = oracleCallCount;
  document.getElementById('stat-payouts').textContent = payoutTotal.toFixed(2);
}

// ===== BLOCK TICKER =====
function tickBlock() {
  blockNum += Math.floor(Math.random()*3);
  gasPrice = Math.floor(Math.random()*10 + 18);
  document.getElementById('block-num').textContent = blockNum.toLocaleString();
  document.getElementById('gas-price').textContent = gasPrice;
}

// ===== INIT =====
function init() {
  seedDemoMatches();
  connectToPS();
  tickBlock();
  setInterval(tickBlock, 12000);

  setTimeout(() => {
    addTx('stake', '0xdemo1', '0.250 ETH');
    addTx('oracle', '0xdemo2', '0xoracle…');
    addTx('payout', '0xdemo3', '0.500 ETH');
  }, 500);

  setTimeout(() => {
    showNotif('info', '⚡ PokéBet Ready!', 'Oracle proxy connected. Paste a PS! room ID to watch a real battle.');
  }, 1000);
}

document.addEventListener('DOMContentLoaded', init);
