// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * ██████╗  ██████╗ ██╗  ██╗███████╗██████╗ ███████╗████████╗
 * ██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝██╔══██╗██╔════╝╚══██╔══╝
 * ██████╔╝██║   ██║█████╔╝ █████╗  ██████╔╝█████╗     ██║
 * ██╔═══╝ ██║   ██║██╔═██╗ ██╔══╝  ██╔══██╗██╔══╝     ██║
 * ██║     ╚██████╔╝██║  ██╗███████╗██████╔╝███████╗   ██║
 * ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═════╝ ╚══════╝   ╚═╝
 * PokéBet Decentralized Battle Arena — Smart Contract v1.0
 */

/**
 * @title PokeBetArena
 * @notice Trustless wagered Pokémon Showdown battles on Ethereum.
 *
 * ARCHITECTURE:
 *  - Player A calls createMatch() with ETH stake + PS room ID
 *  - Player B calls joinMatch() with matching ETH stake
 *  - Oracle Node.js server monitors the PS! WebSocket room
 *  - Once a winner is announced, oracle calls settleMatch()
 *  - Winner receives combined stake (minus protocol fee)
 *
 * SECURITY:
 *  - Oracle address set at deploy, only oracle can settle
 *  - Re-entrancy guard on payout
 *  - Match can be cancelled if opponent never joins (timeout)
 *  - Protocol fee capped at 2%
 */
contract PokeBetArena {

    // ═══════════════════════════════════════════════
    //  TYPES
    // ═══════════════════════════════════════════════

    enum MatchStatus { PENDING, ACTIVE, SETTLED, CANCELLED }

    struct Match {
        bytes32  matchId;
        address  player1;
        address  player2;      // 0x0 until joined
        uint256  stake1;
        uint256  stake2;
        address  winner;       // 0x0 until settled
        string   psRoomId;     // e.g. "battle-gen9randombattle-12345"
        uint64   createdAt;
        uint64   joinedAt;
        MatchStatus status;
    }

    // ═══════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════

    address public owner;
    address public oracle;
    address public pendingOracle;

    uint256 public constant MAX_FEE_BPS = 200; // 2% max protocol fee
    uint256 public feeBps = 100;               // 1% default
    uint256 public accruedFees;

    uint256 public totalVolumeWei;
    uint256 public totalMatchCount;
    uint256 public settledMatchCount;

    /// @dev matchId => Match data
    mapping(bytes32 => Match) public matches;

    /// @dev player => list of matchIds (for history)
    mapping(address => bytes32[]) public playerMatches;

    /// @dev psRoomId => matchId (prevent double-registration)
    mapping(string => bytes32) public roomToMatch;

    /// @dev Timeout after which creator can cancel if no opponent joins (24h)
    uint64 public constant JOIN_TIMEOUT = 86_400;

    /// @dev Re-entrancy guard
    bool private _locked;

    // ═══════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════

    event MatchCreated(
        bytes32 indexed matchId,
        address indexed player1,
        string psRoomId,
        uint256 stake
    );

    event MatchJoined(
        bytes32 indexed matchId,
        address indexed player2,
        uint256 stake
    );

    event MatchSettled(
        bytes32 indexed matchId,
        address indexed winner,
        uint256 payout,
        uint256 fee
    );

    event MatchCancelled(
        bytes32 indexed matchId,
        address indexed player1,
        uint256 refund
    );

    event OracleTransferred(address oldOracle, address newOracle);
    event FeeUpdated(uint256 oldBps, uint256 newBps);
    event FeesWithdrawn(address to, uint256 amount);

    // ═══════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════

    constructor(address _oracle) {
        require(_oracle != address(0), "Oracle cannot be zero");
        owner = msg.sender;
        oracle = _oracle;
    }

    // ═══════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not oracle");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    modifier matchExists(bytes32 matchId) {
        require(matches[matchId].createdAt != 0, "Match not found");
        _;
    }

    // ═══════════════════════════════════════════════
    //  MATCH LIFECYCLE
    // ═══════════════════════════════════════════════

    /**
     * @notice Create a new wagered match.
     * @param opponent   The Ethereum address of the opposing player (must match
     *                   the PS! username → address linked by the oracle service).
     * @param psRoomId   Pokémon Showdown room identifier, e.g.
     *                   "battle-gen9randombattle-12345"
     * @return matchId   Unique on-chain match identifier.
     */
    function createMatch(
        address opponent,
        string calldata psRoomId
    )
        external
        payable
        returns (bytes32 matchId)
    {
        require(msg.value > 0, "Stake must be > 0");
        require(opponent != address(0), "Invalid opponent");
        require(opponent != msg.sender, "Cannot play yourself");
        require(bytes(psRoomId).length > 0, "Room ID required");
        require(roomToMatch[psRoomId] == bytes32(0), "Room already registered");

        matchId = keccak256(
            abi.encodePacked(msg.sender, opponent, psRoomId, block.timestamp)
        );
        require(matches[matchId].createdAt == 0, "Match ID collision");

        matches[matchId] = Match({
            matchId:   matchId,
            player1:   msg.sender,
            player2:   opponent,          // pre-designated opponent
            stake1:    msg.value,
            stake2:    0,
            winner:    address(0),
            psRoomId:  psRoomId,
            createdAt: uint64(block.timestamp),
            joinedAt:  0,
            status:    MatchStatus.PENDING
        });

        playerMatches[msg.sender].push(matchId);
        roomToMatch[psRoomId] = matchId;
        totalVolumeWei += msg.value;
        totalMatchCount++;

        emit MatchCreated(matchId, msg.sender, psRoomId, msg.value);
    }

    /**
     * @notice Join an existing match as player 2.
     *         Must send exactly the same ETH as player 1's stake.
     * @param matchId  The match to join.
     */
    function joinMatch(bytes32 matchId)
        external
        payable
        matchExists(matchId)
        nonReentrant
    {
        Match storage m = matches[matchId];

        require(m.status == MatchStatus.PENDING, "Match not open");
        require(msg.sender == m.player2, "Not designated opponent");
        require(msg.value == m.stake1,   "Stake mismatch — send exact amount");

        m.stake2   = msg.value;
        m.joinedAt = uint64(block.timestamp);
        m.status   = MatchStatus.ACTIVE;

        playerMatches[msg.sender].push(matchId);
        totalVolumeWei += msg.value;

        emit MatchJoined(matchId, msg.sender, msg.value);
    }

    /**
     * @notice Oracle settles the match after reading the PS! battle result.
     *         Sends combined stakes to the winner (minus protocol fee).
     * @param matchId  Unique match identifier.
     * @param winner   The winning player's Ethereum address.
     */
    function settleMatch(bytes32 matchId, address winner)
        external
        onlyOracle
        matchExists(matchId)
        nonReentrant
    {
        Match storage m = matches[matchId];

        require(m.status == MatchStatus.ACTIVE, "Match not active");
        require(
            winner == m.player1 || winner == m.player2,
            "Winner must be a participant"
        );

        m.winner = winner;
        m.status = MatchStatus.SETTLED;

        uint256 pot    = m.stake1 + m.stake2;
        uint256 fee    = (pot * feeBps) / 10_000;
        uint256 payout = pot - fee;

        accruedFees += fee;
        settledMatchCount++;

        // Transfer payout — re-entrancy guard is active
        (bool ok, ) = payable(winner).call{value: payout}("");
        require(ok, "Payout transfer failed");

        emit MatchSettled(matchId, winner, payout, fee);
    }

    /**
     * @notice Cancel a PENDING match and refund player 1.
     *         Can be called by player 1 after JOIN_TIMEOUT expires,
     *         or by the owner/oracle at any time.
     * @param matchId  The match to cancel.
     */
    function cancelMatch(bytes32 matchId)
        external
        matchExists(matchId)
        nonReentrant
    {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.PENDING, "Not cancellable");
        require(
            msg.sender == m.player1 ||
            msg.sender == oracle    ||
            msg.sender == owner,
            "Not authorised"
        );
        if (msg.sender == m.player1) {
            require(
                block.timestamp >= m.createdAt + JOIN_TIMEOUT,
                "Timeout not elapsed"
            );
        }

        m.status = MatchStatus.CANCELLED;
        uint256 refund = m.stake1;
        m.stake1 = 0;

        (bool ok, ) = payable(m.player1).call{value: refund}("");
        require(ok, "Refund failed");

        emit MatchCancelled(matchId, m.player1, refund);
    }

    // ═══════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════

    /// @notice Return full match data.
    function getMatch(bytes32 matchId)
        external
        view
        returns (Match memory)
    {
        return matches[matchId];
    }

    /// @notice All match IDs for a given player.
    function getPlayerMatches(address player)
        external
        view
        returns (bytes32[] memory)
    {
        return playerMatches[player];
    }

    /// @notice Look up matchId by PS! room ID.
    function getMatchByRoom(string calldata psRoomId)
        external
        view
        returns (bytes32)
    {
        return roomToMatch[psRoomId];
    }

    /// @notice Protocol stats.
    function getStats()
        external
        view
        returns (
            uint256 volume,
            uint256 total,
            uint256 settled,
            uint256 fees
        )
    {
        return (totalVolumeWei, totalMatchCount, settledMatchCount, accruedFees);
    }

    // ═══════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════

    /// @notice Propose a new oracle address (two-step).
    function proposeOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Zero address");
        pendingOracle = newOracle;
    }

    /// @notice New oracle accepts the role.
    function acceptOracle() external {
        require(msg.sender == pendingOracle, "Not pending oracle");
        emit OracleTransferred(oracle, pendingOracle);
        oracle = pendingOracle;
        pendingOracle = address(0);
    }

    /// @notice Update protocol fee (capped at MAX_FEE_BPS = 2%).
    function setFee(uint256 newBps) external onlyOwner {
        require(newBps <= MAX_FEE_BPS, "Fee too high");
        emit FeeUpdated(feeBps, newBps);
        feeBps = newBps;
    }

    /// @notice Withdraw accrued protocol fees.
    function withdrawFees(address to) external onlyOwner nonReentrant {
        require(to != address(0), "Zero address");
        uint256 amount = accruedFees;
        accruedFees = 0;
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Withdraw failed");
        emit FeesWithdrawn(to, amount);
    }

    /// @notice Transfer ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    // Receive ETH (should not normally be called directly)
    receive() external payable {}
}
