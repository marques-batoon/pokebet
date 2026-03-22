// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PokeBetArena {

    enum MatchStatus { PENDING, ACTIVE, SETTLED, CANCELLED }

    struct Match {
        bytes32  matchId;
        address  player1;
        address  player2;
        uint256  stake1;
        uint256  stake2;
        address  winner;
        string   psRoomId;
        uint64   createdAt;
        uint64   joinedAt;
        MatchStatus status;
    }

    address public owner;
    address public oracle;
    address public pendingOracle;

    uint256 public constant MAX_FEE_BPS = 200;
    uint256 public feeBps = 100;
    uint256 public accruedFees;

    uint256 public totalVolumeWei;
    uint256 public totalMatchCount;
    uint256 public settledMatchCount;

    mapping(bytes32 => Match) public matches;
    mapping(address => bytes32[]) public playerMatches;
    mapping(string => bytes32) public roomToMatch;

    uint64 public constant JOIN_TIMEOUT = 86_400;
    bool private _locked;

    event MatchCreated(bytes32 indexed matchId, address indexed player1, string psRoomId, uint256 stake);
    event MatchJoined(bytes32 indexed matchId, address indexed player2, uint256 stake);
    event MatchSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee);
    event MatchCancelled(bytes32 indexed matchId, address indexed player1, uint256 refund);
    event OracleTransferred(address oldOracle, address newOracle);
    event FeeUpdated(uint256 oldBps, uint256 newBps);
    event FeesWithdrawn(address to, uint256 amount);

    constructor(address _oracle) {
        require(_oracle != address(0), "Oracle cannot be zero");
        owner = msg.sender;
        oracle = _oracle;
    }

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

    function createMatch(address opponent, string calldata psRoomId)
        external payable returns (bytes32 matchId)
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
            player2:   opponent,
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

    function joinMatch(bytes32 matchId)
        external payable matchExists(matchId) nonReentrant
    {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.PENDING, "Match not open");
        require(msg.sender == m.player2, "Not designated opponent");
        require(msg.value == m.stake1, "Stake mismatch");

        m.stake2   = msg.value;
        m.joinedAt = uint64(block.timestamp);
        m.status   = MatchStatus.ACTIVE;

        playerMatches[msg.sender].push(matchId);
        totalVolumeWei += msg.value;

        emit MatchJoined(matchId, msg.sender, msg.value);
    }

    function settleMatch(bytes32 matchId, address winner)
        external onlyOracle matchExists(matchId) nonReentrant
    {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.ACTIVE, "Match not active");
        require(winner == m.player1 || winner == m.player2, "Winner must be a participant");

        m.winner = winner;
        m.status = MatchStatus.SETTLED;

        uint256 pot    = m.stake1 + m.stake2;
        uint256 fee    = (pot * feeBps) / 10_000;
        uint256 payout = pot - fee;

        accruedFees += fee;
        settledMatchCount++;

        (bool ok, ) = payable(winner).call{value: payout}("");
        require(ok, "Payout transfer failed");

        emit MatchSettled(matchId, winner, payout, fee);
    }

    function cancelMatch(bytes32 matchId)
        external matchExists(matchId) nonReentrant
    {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.PENDING, "Not cancellable");
        require(
            msg.sender == m.player1 || msg.sender == oracle || msg.sender == owner,
            "Not authorised"
        );
        if (msg.sender == m.player1) {
            require(block.timestamp >= m.createdAt + JOIN_TIMEOUT, "Timeout not elapsed");
        }

        m.status = MatchStatus.CANCELLED;
        uint256 refund = m.stake1;
        m.stake1 = 0;

        (bool ok, ) = payable(m.player1).call{value: refund}("");
        require(ok, "Refund failed");

        emit MatchCancelled(matchId, m.player1, refund);
    }

    function getMatch(bytes32 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    function getPlayerMatches(address player) external view returns (bytes32[] memory) {
        return playerMatches[player];
    }

    function getMatchByRoom(string calldata psRoomId) external view returns (bytes32) {
        return roomToMatch[psRoomId];
    }

    function getStats() external view returns (uint256 volume, uint256 total, uint256 settled, uint256 fees) {
        return (totalVolumeWei, totalMatchCount, settledMatchCount, accruedFees);
    }

    function proposeOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Zero address");
        pendingOracle = newOracle;
    }

    function acceptOracle() external {
        require(msg.sender == pendingOracle, "Not pending oracle");
        emit OracleTransferred(oracle, pendingOracle);
        oracle = pendingOracle;
        pendingOracle = address(0);
    }

    function setFee(uint256 newBps) external onlyOwner {
        require(newBps <= MAX_FEE_BPS, "Fee too high");
        emit FeeUpdated(feeBps, newBps);
        feeBps = newBps;
    }

    function withdrawFees(address to) external onlyOwner nonReentrant {
        require(to != address(0), "Zero address");
        uint256 amount = accruedFees;
        accruedFees = 0;
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Withdraw failed");
        emit FeesWithdrawn(to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    receive() external payable {}
}