# ⚡ PokéBet — Decentralized Battle Arena

> Stake ETH on real Pokémon Showdown battles. A Node.js oracle watches the battle in real time, detects the winner, and a Solidity smart contract automatically releases the pot — no middleman, no trust required.

**Built by [Marques Batoon](https://github.com/marques-batoon)**

---

## 📋 Table of Contents

- [What Is PokéBet?](#what-is-pokébet)
- [Demo Mode vs Live Mode](#demo-mode-vs-live-mode)
- [Project Structure](#project-structure)
- [Starting the App Locally](#starting-the-app-locally)
- [How to Use the App](#how-to-use-the-app)
- [Smart Contract Deep Dive](#smart-contract-deep-dive)
- [The Oracle Explained](#the-oracle-explained)
- [Troubleshooting](#troubleshooting)

---

## What Is PokéBet?

PokéBet is a decentralized application (DApp) that combines blockchain-based wagering with real Pokémon Showdown battles. Two players agree on a stake, lock their ETH into a smart contract, play a battle on [Pokémon Showdown](https://play.pokemonshowdown.com), and the winner automatically receives the combined pot — all enforced by code, not by a person.

**The three layers of the system:**

```
FRONTEND (index.html)
    ↕ ethers.js / WebSocket
ORACLE NODE (oracle.js)
    ↕ WebSocket (wss://sim3.psim.us)
POKEMON SHOWDOWN
    ↕ on-chain tx
SMART CONTRACT (PokeBetArena.sol)
```

---

## Demo Mode vs Live Mode

### ⚡ Demo Mode (Default — No Setup Required)

When the **DEMO** toggle is ON in the top-right of the app:

| Feature | Behavior |
|---|---|
| Wallet | Not required |
| ETH | Simulated — no real money |
| Battles | Streams real Pokémon Showdown data via the oracle proxy |
| Transactions | Fake tx hashes, shown for demonstration only |
| Oracle | Connects to real PS! WebSocket — battle data is 100% real |
| Smart Contract | Not called — payouts are simulated in the UI |

Demo mode is designed so anyone can explore the full interface, watch real battles stream in, and understand how the system works — without needing a crypto wallet or any funds.

**When to use Demo Mode:**
- First-time exploration
- Testing a battle room before wagering
- Showing the app to others
- Development and debugging

---

### 🔴 Live Mode (Real ETH on Ethereum)

When the **DEMO** toggle is OFF:

| Feature | Behavior |
|---|---|
| Wallet | MetaMask required |
| ETH | Real ETH locked in the smart contract |
| Battles | Real Pokémon Showdown battles — result is canonical |
| Transactions | Real on-chain transactions on Ethereum or testnet |
| Oracle | Calls `settleMatch()` on the deployed contract |
| Smart Contract | Fully active — holds and distributes real ETH |

**When to use Live Mode:**
- You want to wager real ETH with a friend
- Both players have MetaMask installed and funded
- The oracle node is running and connected

**Live Mode Flow:**
1. Toggle DEMO off → Connect MetaMask
2. Both players go to [play.pokemonshowdown.com](https://play.pokemonshowdown.com) and start a battle
3. Copy the battle room ID from the URL
4. Player A clicks **CREATE MATCH** in PokéBet, pastes the room ID, and stakes ETH
5. Player B finds the match in the **OPEN** tab, clicks **JOIN & BET**, and matches the stake
6. Both players play the battle on Pokémon Showdown normally
7. The oracle detects the winner, calls `settleMatch()`, and the winner's wallet receives the full pot

---

## Project Structure

```
pokebet/
├── index.html                  ← Full DApp frontend (single file)
├── contracts/
│   └── PokeBetArena.sol        ← Solidity smart contract
├── oracle/
│   ├── oracle.js               ← Node.js oracle server
│   ├── package.json            ← Oracle dependencies
│   └── .env                    ← Environment variables (never commit this)
├── pokebet-deploy/             ← Hardhat project for contract deployment
│   ├── hardhat.config.js
│   ├── contracts/
│   │   └── PokeBetArena.sol
│   └── scripts/
│       └── deploy.js
└── README.md
```

---

## Starting the App Locally

You need **3 terminal tabs** running simultaneously.

### Prerequisites

- [Node.js 18+](https://nodejs.org)
- npm (comes with Node.js)

---

### Tab 1 — Start the Local Blockchain

```bash
cd pokebet-deploy
npx hardhat node
```

Leave this running. It starts a local Ethereum node at `http://127.0.0.1:8545` with 20 pre-funded test accounts. You will see a list of accounts printed — these have 10,000 fake ETH each.

---

### Tab 2 — Deploy the Smart Contract

```bash
cd pokebet-deploy
npx hardhat run scripts/deploy.js --network localhost
```

Output:
```
Deploying from: 0x
PokeBetArena deployed to: 0x
```

Copy the deployed contract address and make sure it matches `CONTRACT_ADDRESS` in `oracle/.env`.

> You must redeploy every time you restart the Hardhat node — the local blockchain resets on each restart.

---

### Tab 3 — Start the Oracle

```bash
cd oracle
node oracle.js
```

Expected output:
```
📡 PokeBet Oracle Node - Starting up
📡 Connected to local Hardhat network (chainId 31337)
📡 Oracle address: 0x
📡 Contract address: 0x
📡 Proxy WebSocket server running on ws://localhost:3001
📡 Scanning chain for ACTIVE matches...
📡 Connecting to Pokemon Showdown...
📡 Oracle running. Press Ctrl+C to stop.
📡 PS WebSocket connected
```

The oracle simultaneously connects to Pokémon Showdown and starts a local proxy on port 3001 so the browser can receive real PS! battle data.

---

### Tab 4 — Serve the Frontend

```bash
cd pokebet
npx serve .
```

Open the URL printed (e.g. `http://localhost:3000`) in your browser.

---

### oracle/.env Reference

```env
# Local Hardhat node RPC
RPC_URL=http://127.0.0.1:8545

# Hardhat's first built-in test account private key (safe to use locally)
ORACLE_PRIVATE_KEY=0x

# Address printed when you ran deploy.js
CONTRACT_ADDRESS=0x

# Optional: PS! account credentials so oracle can join private rooms
PS_USERNAME=
PS_PASSWORD=

# debug | info | warn | error
LOG_LEVEL=info
```

---

## How to Use the App

### Watching a Real Battle

1. Go to [play.pokemonshowdown.com](https://play.pokemonshowdown.com)
2. Start any battle — Random Battle is easiest
3. Once the battle starts, copy the room ID from the URL:
   ```
   https://play.pokemonshowdown.com/battle-gen9randombattle-2564539703
   Room ID →                          battle-gen9randombattle-2564539703
   ```
4. In PokéBet, click **CREATE MATCH** and paste the room ID
5. The Live Battle Viewer immediately starts showing live moves, HP bars updating, and turn-by-turn log

### Betting on a Match

1. Both players open PokéBet in their browsers
2. Player A clicks **CREATE MATCH**, enters the opponent's name/address, pastes the PS! room ID, and sets a stake amount
3. Player B finds the match in the **OPEN** tab and clicks **JOIN & BET**
4. Both players play the battle on Pokémon Showdown
5. When the battle ends, the oracle detects the winner and settles the bet automatically

### Reading the Interface

| Panel | What It Shows |
|---|---|
| **Live Battle Viewer** | Real-time Pokémon sprites, HP bars, and move log from the PS! stream |
| **Betting Arena** | All matches — filter by OPEN, LIVE, or COMPLETED |
| **Oracle Node** | WebSocket connection status, rooms being watched, oracle log |
| **Battle Log** | Turn-by-turn text feed of every move, damage, and status effect |
| **Chain Transactions** | Live feed of STAKE / ORACLE / PAYOUT transactions |
| **Smart Contract** | Syntax-highlighted view of the deployed Solidity code |

---

## Smart Contract Deep Dive

**File:** `contracts/PokeBetArena.sol`
**Solidity Version:** `^0.8.19`
**License:** MIT

The smart contract is the financial backbone of PokéBet. It holds player stakes in escrow, enforces match rules, and distributes winnings. No one — not even the contract owner — can move funds except through the rules encoded in the contract itself.

---

### Data Structures

#### `MatchStatus` Enum

```solidity
enum MatchStatus { PENDING, ACTIVE, SETTLED, CANCELLED }
```

Every match moves through this lifecycle:

```
PENDING → ACTIVE → SETTLED
           ↓
        CANCELLED
```

- **PENDING** — Player A has staked ETH. Waiting for Player B to join.
- **ACTIVE** — Both players have staked. The battle is live and the oracle is watching.
- **SETTLED** — The oracle has reported a winner and the payout has been sent.
- **CANCELLED** — The match was cancelled and Player A was refunded.

---

#### `Match` Struct

```solidity
struct Match {
    bytes32     matchId;    // Unique identifier (keccak256 hash)
    address     player1;    // ETH address of the match creator
    address     player2;    // ETH address of the designated opponent
    uint256     stake1;     // Amount staked by player1 in wei
    uint256     stake2;     // Amount staked by player2 in wei (0 until joined)
    address     winner;     // Set by oracle after battle (zero address until settled)
    string      psRoomId;   // Pokémon Showdown room ID
    uint64      createdAt;  // Block timestamp when match was created
    uint64      joinedAt;   // Block timestamp when player2 joined
    MatchStatus status;     // Current lifecycle state
}
```

---

### State Variables

| Variable | Type | Purpose |
|---|---|---|
| `owner` | `address` | Contract deployer — can update fees and transfer ownership |
| `oracle` | `address` | The only address allowed to call `settleMatch()` |
| `pendingOracle` | `address` | Holds a proposed new oracle address during two-step transfer |
| `feeBps` | `uint256` | Protocol fee in basis points (100 = 1%, max allowed is 200 = 2%) |
| `accruedFees` | `uint256` | Total unclaimed protocol fees in wei |
| `totalVolumeWei` | `uint256` | Total ETH ever wagered through the contract |
| `totalMatchCount` | `uint256` | Total matches ever created |
| `settledMatchCount` | `uint256` | Total matches that have been paid out |
| `matches` | `mapping(bytes32 => Match)` | All match data keyed by matchId |
| `playerMatches` | `mapping(address => bytes32[])` | Match history per player address |
| `roomToMatch` | `mapping(string => bytes32)` | Look up a matchId by its PS! room ID |
| `JOIN_TIMEOUT` | `uint64` | 86400 seconds (24 hours) before a creator can cancel |

---

### Functions

#### `createMatch(address opponent, string psRoomId)` — payable

Called by Player A to open a new wagered match.

**What it does:**
- Validates that stake is greater than 0, the opponent is a real address, and the PS! room is not already registered
- Generates a unique `matchId` using `keccak256(sender, opponent, roomId, timestamp)`
- Stores the full match struct and maps the room ID to the match ID
- Emits `MatchCreated` so the oracle can detect it and start watching the room

**Reverts if:** No ETH sent, opponent is zero address or sender, room ID is empty, or room is already registered.

---

#### `joinMatch(bytes32 matchId)` — payable

Called by Player B to accept the match and lock in their equal stake.

**What it does:**
- Verifies the match is PENDING and the caller is the pre-designated opponent
- Requires exactly the same ETH as Player A staked — not more, not less
- Changes status to ACTIVE and emits `MatchJoined`

**Why exact matching?** Equal stakes means the pot is always exactly double the entry, making payout math simple and unambiguous.

---

#### `settleMatch(bytes32 matchId, address winner)` — onlyOracle

Called exclusively by the oracle wallet after reading the battle result from Pokémon Showdown.

**What it does:**
- Verifies the match is ACTIVE and the winner is one of the two participants
- Calculates payout: `pot - (pot * feeBps / 10000)`
- Transfers the payout directly to the winner's wallet
- Accumulates the protocol fee for the owner to collect later
- Emits `MatchSettled`

**Why low-level `.call` for transfer?** The older `.transfer()` method has a 2300 gas limit that can fail for smart contract wallets (like Gnosis Safe). Using `.call{value: payout}("")` forwards all available gas and is the current Solidity best practice for ETH transfers.

---

#### `cancelMatch(bytes32 matchId)`

Refunds Player A for a match that was never joined.

**Who can cancel and when:**
- Player A — only after the 24-hour `JOIN_TIMEOUT` has elapsed
- Oracle or owner — at any time (e.g. if the PS! room ID was invalid)

**Why the timeout for Player A?** Prevents Player A from creating a match to bait an opponent and then immediately pulling funds before the opponent can join.

---

### Modifiers

| Modifier | Purpose |
|---|---|
| `onlyOwner` | Restricts function to the `owner` address |
| `onlyOracle` | Restricts `settleMatch` to the trusted oracle address |
| `nonReentrant` | Sets a `_locked` boolean before execution — blocks recursive calls that could drain funds before state updates |
| `matchExists` | Reverts if `matches[matchId].createdAt == 0` meaning the match does not exist |

---

### Events

```solidity
event MatchCreated(bytes32 indexed matchId, address indexed player1, string psRoomId, uint256 stake);
event MatchJoined(bytes32 indexed matchId, address indexed player2, uint256 stake);
event MatchSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee);
event MatchCancelled(bytes32 indexed matchId, address indexed player1, uint256 refund);
event OracleTransferred(address oldOracle, address newOracle);
event FeeUpdated(uint256 oldBps, uint256 newBps);
event FeesWithdrawn(address to, uint256 amount);
```

`matchId`, `player1`, and `winner` are `indexed` — this means the oracle and frontend can efficiently filter events using `contract.queryFilter()` without scanning every block.

---

### Security Design

| Threat | Mitigation |
|---|---|
| Oracle reporting wrong winner | Winner must be one of the two participants — cannot redirect funds elsewhere |
| Oracle key gets compromised | Two-step oracle transfer requires the new oracle to actively accept the role |
| Re-entrancy attack | `nonReentrant` locks state before any external call, preventing recursive drains |
| Owner raising fees unfairly | `MAX_FEE_BPS = 200` is a compile-time constant — fee can never exceed 2% |
| Match creator abandoning funds | 24-hour timeout lets Player A reclaim their stake if nobody joins |
| Player B joining with wrong amount | `require(msg.value == m.stake1)` enforces exact stake matching |
| Duplicate room registrations | `require(roomToMatch[psRoomId] == bytes32(0))` prevents registering the same room twice |

---

### Admin Functions (Owner Only)

```solidity
proposeOracle(address newOracle)    // Propose a new oracle (step 1 of 2)
acceptOracle()                      // New oracle accepts the role (step 2 of 2)
setFee(uint256 newBps)             // Update protocol fee — capped at 2%
withdrawFees(address to)            // Collect accrued protocol fees
transferOwnership(address newOwner) // Transfer contract ownership
```

---

## The Oracle Explained

**File:** `oracle/oracle.js`

The oracle is a Node.js process that bridges Pokémon Showdown (off-chain Web2) with the smart contract (on-chain Web3). It is the only trusted entity in the system that can trigger a payout.

### What It Does Step By Step

1. On startup, scans past `MatchCreated` events on the contract to find any ACTIVE matches it should be watching
2. Listens for new `MatchJoined` events — when one fires, it automatically joins the corresponding PS! room
3. Every PS! message is forwarded to any connected browser clients via the local proxy on port 3001
4. When a `|win|PLAYERNAME` message arrives from PS!, the oracle resolves the PS! username to an Ethereum address
5. Calls `settleMatch(matchId, winnerAddress)` on the contract
6. Waits for the transaction to confirm then removes the room from the watch list

### The Proxy Server

Browsers cannot directly connect to `wss://sim3.psim.us` due to CORS restrictions that Pokémon Showdown enforces. The oracle runs a WebSocket proxy on `ws://localhost:3001` that:

- Accepts connections from the browser frontend
- Forwards all PS! messages to connected browsers in real time
- Forwards messages from the browser back to PS! (e.g. join room commands)

This is why the oracle must be running for the Live Battle Viewer to work.

### Oracle Security Considerations

For a local or testnet deployment the single-oracle model is fine. For a production mainnet deployment consider:

- Running the oracle on a dedicated server with restricted access to the private key
- Using a hardware security module (HSM) to sign transactions
- Implementing a multi-oracle consensus model where 2-of-3 oracles must agree on a winner
- Using Chainlink Functions to decentralize oracle trust entirely

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Error: connect ECONNREFUSED 127.0.0.1:8545` | Start the Hardhat node first: `cd pokebet-deploy && npx hardhat node` |
| `CONTRACT_ADDRESS is not a valid address` | Redeploy and update `oracle/.env` with the new address |
| Battle log stuck on "Waiting for battle to start" | Make sure oracle is running, then paste a real room ID via Create Match |
| Oracle shows `0 active matches` | Expected — matches register when `joinMatch()` is called on-chain |
| Port 3000 is already in use | Use whatever port `npx serve` chooses — does not affect the oracle |
| Sprites not loading | PokeAPI CDN can be slow — sprites load from the official artwork URL |
| MetaMask not appearing in Live Mode | Install the MetaMask browser extension and switch to the correct network |
| Oracle disconnects from PS! | It reconnects automatically with exponential backoff — check the terminal logs |

---

## Links

- **GitHub:** [github.com/marques-batoon](https://github.com/marques-batoon)
- **Instagram:** [instagram.com/batoonworld](https://www.instagram.com/batoonworld/)
- **Pokémon Showdown:** [play.pokemonshowdown.com](https://play.pokemonshowdown.com)
- **Hardhat Docs:** [hardhat.org](https://hardhat.org)
- **ethers.js Docs:** [docs.ethers.org](https://docs.ethers.org)
# pokebet
