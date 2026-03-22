require('dotenv').config();
const WebSocket = require('ws');
const http = require('http');
const { ethers } = require('ethers');

const PS_WS_URL = 'wss://sim3.psim.us/showdown/websocket';
const POLL_INTERVAL_MS = 10000;
const PROXY_PORT = 3001;

const { RPC_URL, ORACLE_PRIVATE_KEY, CONTRACT_ADDRESS, PS_USERNAME, PS_PASSWORD, LOG_LEVEL = 'info' } = process.env;

const ABI = [
  'event MatchCreated(bytes32 indexed matchId, address indexed player1, string psRoomId, uint256 stake)',
  'event MatchJoined(bytes32 indexed matchId, address indexed player2, uint256 stake)',
  'function getMatch(bytes32 matchId) view returns (tuple(bytes32 matchId, address player1, address player2, uint256 stake1, uint256 stake2, address winner, string psRoomId, uint64 createdAt, uint64 joinedAt, uint8 status))',
  'function settleMatch(bytes32 matchId, address winner) external',
];

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LEVELS[LOG_LEVEL] ?? 1;

function log(level, ...args) {
  if (LEVELS[level] < CURRENT_LEVEL) return;
  const ts = new Date().toISOString();
  const prefix = { debug: '🔍', info: '📡', warn: '⚠️', error: '❌' }[level] ?? '•';
  console.log(`[${ts}] ${prefix}`, ...args);
}

const watchedMatches = new Map();
const roomToMatchId = new Map();
const frontendClients = new Set();

function broadcastToFrontend(data) {
  for (const client of frontendClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function startProxyServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('PokeBet Oracle Proxy running');
  });

  const wss = new WebSocket.Server({ server });

  wss.on('connection', (clientWs) => {
    log('info', 'Frontend browser connected to proxy');
    frontendClients.add(clientWs);

    clientWs.on('message', (data) => {
      const msg = data.toString();
      log('debug', 'Frontend -> PS: ' + msg);
      if (psWs && psWs.readyState === WebSocket.OPEN) {
        psWs.send(msg);
      }
    });

    clientWs.on('close', () => {
      log('info', 'Frontend browser disconnected');
      frontendClients.delete(clientWs);
    });

    clientWs.on('error', (err) => {
      log('error', 'Frontend client error: ' + err.message);
      frontendClients.delete(clientWs);
    });
  });

  server.listen(PROXY_PORT, () => {
    log('info', 'Proxy WebSocket server running on ws://localhost:' + PROXY_PORT);
  });
}

async function setupEthereum() {
  if (!RPC_URL || !ORACLE_PRIVATE_KEY || !CONTRACT_ADDRESS) {
    log('warn', 'Missing Ethereum env vars - running in demo mode');
    return null;
  }
  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    log('error', 'CONTRACT_ADDRESS is not a valid address: ' + CONTRACT_ADDRESS);
    return null;
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 31337, name: 'hardhat' });
  const signer = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);
  const checksummed = ethers.getAddress(CONTRACT_ADDRESS);
  const contract = new ethers.Contract(checksummed, ABI, signer);
  log('info', 'Connected to local Hardhat network (chainId 31337)');
  log('info', 'Oracle address: ' + signer.address);
  log('info', 'Contract address: ' + checksummed);
  return { provider, signer, contract };
}

async function loadActiveMatches(eth) {
  if (!eth) return;
  log('info', 'Scanning chain for ACTIVE matches...');
  try {
    eth.contract.on('MatchJoined', async (matchId) => {
      log('info', 'MatchJoined event: ' + matchId);
      await registerMatch(eth.contract, matchId);
    });
    const currentBlock = await eth.provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 50000);
    const events = await eth.contract.queryFilter(eth.contract.filters.MatchCreated(), fromBlock);
    for (const evt of events) {
      await registerMatch(eth.contract, evt.args.matchId);
    }
    log('info', 'Loaded ' + watchedMatches.size + ' active match(es)');
  } catch (err) {
    log('warn', 'Could not scan past events: ' + err.message);
  }
}

async function registerMatch(contract, matchId) {
  try {
    const m = await contract.getMatch(matchId);
    if (Number(m.status) !== 1) return;
    if (watchedMatches.has(matchId)) return;
    watchedMatches.set(matchId, m);
    roomToMatchId.set(m.psRoomId, matchId);
    log('info', 'Watching room: ' + m.psRoomId);
    joinRoom(m.psRoomId);
  } catch (err) {
    log('error', 'Failed to register match: ' + err.message);
  }
}

async function settleMatch(contract, matchId, winnerAddress) {
  if (!contract) {
    log('info', '[DEMO] Would settle match ' + matchId.slice(0, 10) + ' winner ' + winnerAddress);
    return;
  }
  try {
    const tx = await contract.settleMatch(matchId, winnerAddress, { gasLimit: 200000 });
    log('info', 'TX submitted: ' + tx.hash);
    const receipt = await tx.wait(1);
    log('info', 'TX confirmed in block ' + receipt.blockNumber);
    const m = watchedMatches.get(matchId);
    if (m) roomToMatchId.delete(m.psRoomId);
    watchedMatches.delete(matchId);
  } catch (err) {
    log('error', 'settleMatch failed: ' + err.message);
  }
}

let psWs = null;
let challstr = '';
let reconnectDelay = 2000;
let eth = null;

function connectToPS() {
  log('info', 'Connecting to Pokemon Showdown...');
  psWs = new WebSocket(PS_WS_URL);

  psWs.on('open', () => {
    log('info', 'PS WebSocket connected');
    reconnectDelay = 2000;
    for (const roomId of roomToMatchId.keys()) joinRoom(roomId);
  });

  psWs.on('message', (raw) => {
    const data = raw.toString();
    broadcastToFrontend(data);
    handlePSMessage(data);
  });

  psWs.on('error', (err) => log('error', 'PS WS error: ' + err.message));

  psWs.on('close', (code) => {
    log('warn', 'PS WS closed. Reconnecting in ' + reconnectDelay + 'ms...');
    setTimeout(connectToPS, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  });
}

function sendPS(msg) {
  if (psWs && psWs.readyState === WebSocket.OPEN) psWs.send(msg);
}

function joinRoom(roomId) {
  log('info', 'Joining PS room: ' + roomId);
  sendPS('|/join ' + roomId);
}

async function handlePSMessage(raw) {
  const lines = raw.split('\n');
  let currentRoom = '';
  for (const line of lines) {
    if (line.startsWith('>')) { currentRoom = line.slice(1).trim(); continue; }
    const parts = line.split('|');
    if (parts.length < 2) continue;
    const type = parts[1];
    if (type === 'challstr') {
      challstr = parts.slice(2).join('|');
      if (PS_USERNAME && PS_PASSWORD) await loginToPS();
      continue;
    }
    if (!currentRoom) continue;
    if (type === 'win') {
      const winner = parts[2] ? parts[2].trim() : null;
      if (!winner) continue;
      log('info', 'Winner in ' + currentRoom + ': ' + winner);
      const matchId = roomToMatchId.get(currentRoom);
      if (!matchId) continue;
      const matchData = watchedMatches.get(matchId);
      if (!matchData) continue;
      await settleMatch(eth ? eth.contract : null, matchId, matchData.player1);
    }
    if (type === 'faint') log('info', '[' + currentRoom + '] ' + parts[2] + ' fainted');
    if (type === 'turn') log('debug', '[' + currentRoom + '] Turn ' + parts[2]);
  }
}

async function loginToPS() {
  try {
    const res = await fetch('https://play.pokemonshowdown.com/action.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ act: 'login', name: PS_USERNAME, pass: PS_PASSWORD, challstr }),
    });
    const body = await res.text();
    const data = JSON.parse(body.slice(1));
    if (!data.actionsuccess) { log('error', 'PS login failed'); return; }
    sendPS('|/trn ' + PS_USERNAME + ',0,' + data.assertion);
    log('info', 'Logged in to PS as ' + PS_USERNAME);
  } catch (err) {
    log('error', 'PS login error: ' + err.message);
  }
}

function startHealthCheck() {
  setInterval(() => {
    log('info', 'Health: ' + watchedMatches.size + ' matches, ' + frontendClients.size + ' browsers connected');
  }, POLL_INTERVAL_MS);
}

function shutdown() {
  log('info', 'Shutting down...');
  if (psWs) psWs.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => log('error', 'Uncaught: ' + err.message));

(async function main() {
  log('info', '--------------------------------------');
  log('info', ' PokeBet Oracle Node - Starting up');
  log('info', '--------------------------------------');
  startProxyServer();
  eth = await setupEthereum();
  if (eth) await loadActiveMatches(eth);
  connectToPS();
  startHealthCheck();
  log('info', 'Oracle running. Press Ctrl+C to stop.');
})();