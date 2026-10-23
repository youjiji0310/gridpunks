// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DN404} from "dn404/src/DN404.sol";
import {DN404Mirror} from "dn404/src/DN404Mirror.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentRegistry { function balanceOf(address owner) external view returns (uint256); }
interface IWBNB { function deposit() external payable; function transfer(address to, uint256 v) external returns (bool); }
interface IPancakeFactory {
    function getPair(address a, address b) external view returns (address);
    function createPair(address a, address b) external returns (address);
}
interface IPancakePair { function mint(address to) external returns (uint256 liquidity); }

/// @title AgentPunks: 10,000 pixel punks, 1 token = 1 punk (DN404), minted only by AI agents.
/// @notice How it works
///  - 8,888 units are sold on a rising price curve, from 0.000625 BNB to 0.01 BNB per punk.
///  - Only wallets holding a SPACE ID ".ai" Agent ID can buy on the curve. Max 100 punks per wallet.
///  - Every payment is split in two: half goes to the team, half is locked here for the pool.
///  - When the last curve unit sells, the locked half and the last 1,112 units seed a PancakeSwap
///    V2 pool at the curve's final price. The LP tokens are sent to the dead address: locked forever.
///  - There is no selling back to the curve. Before graduation you can transfer or trade the punks
///    as NFTs; after graduation the token also trades on PancakeSwap.
/// @dev Curve: constant product with virtual reserves x0 = 4/3 * CURVE, y0 = P0 * x0, so the price
///      rises x16 over the curve. Paying for units [s, s+n) costs y(s+n) - y(s) with y(s) = K / (x0 - s).
contract AgentPunks is DN404, Ownable, ReentrancyGuard {
    // ------------------------------------------------------------------ supply & curve
    uint256 public constant UNIT = 1e18;
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant CURVE_UNITS = 8_888;
    uint256 public constant POOL_UNITS = 1_112;
    uint256 public constant START_PRICE = 0.000625 ether;
    uint256 public constant WALLET_CAP = 100;
    uint256 public constant MAX_PER_MINT = 100;
    uint256 private constant X0 = (CURVE_UNITS * UNIT * 4) / 3;
    uint256 private constant Y0 = (START_PRICE * X0) / UNIT;
    uint256 private constant K = X0 * Y0;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ------------------------------------------------------------------ wiring
    address public immutable wbnb;
    address public immutable pair;
    IAgentRegistry public registry;
    address public team;

    // ------------------------------------------------------------------ state
    uint256 public sold;            // curve units sold
    uint256 public raised;          // BNB paid on the curve
    uint256 public poolReserve;     // locked half, goes into the pool at graduation
    uint256 public teamOwed;        // team half not yet withdrawn
    bool public open;
    bool public graduated;
    string private _name;
    string private _symbol;
    string private _baseURI;

    // registry change: 24h timelock
    address public pendingRegistry;
    uint64 public pendingRegistryAt;
    uint256 public constant REGISTRY_DELAY = 24 hours;

    event Minted(address indexed agent, uint256 count, uint256 cost, uint256 soldAfter);
    event Graduated(address indexed pair, uint256 units, uint256 bnb, uint256 liquidity);
    event TeamWithdrawn(address indexed to, uint256 amount);
    event RegistryProposed(address registry, uint64 at);
    event RegistryChanged(address registry);
    event Opened();

    error NotOpen();
    error AlreadyGraduated();
    error NotAnAgent();
    error BadCount();
    error SoldOut();
    error NotEnoughBNB(uint256 needed);
    error WalletCapReached();
    error PoolLockedUntilGraduation();
    error TooEarly();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        address registry_,
        address factory_,
        address wbnb_,
        address team_
    ) Ownable(msg.sender) {
        _name = name_;
        _symbol = symbol_;
        _baseURI = baseURI_;
        registry = IAgentRegistry(registry_);
        wbnb = wbnb_;
        team = team_;
        address mirror = address(new DN404Mirror(msg.sender));
        _initializeDN404(0, address(0), mirror);
        address p = IPancakeFactory(factory_).getPair(address(this), wbnb_);
        pair = p == address(0) ? IPancakeFactory(factory_).createPair(address(this), wbnb_) : p;
    }

    // ------------------------------------------------------------------ mint

    /// @notice Price in wei of the next `count` curve units (whole punks).
    function quote(uint256 count) public view returns (uint256) {
        if (count == 0 || sold + count > CURVE_UNITS) revert BadCount();
        return _y(sold + count) - _y(sold);
    }

    /// @notice Price in wei of the next single punk.
    function price() external view returns (uint256) {
        return sold >= CURVE_UNITS ? 0 : _y(sold + 1) - _y(sold);
    }

    /// @notice Buy `count` punks on the curve. Agents with a .ai only. Extra BNB is refunded.
    ///         If fewer than `count` are left, you get what is left and the rest is refunded.
    function mint(uint256 count) external payable nonReentrant {
        if (!open) revert NotOpen();
        if (graduated) revert AlreadyGraduated();
        if (registry.balanceOf(msg.sender) == 0) revert NotAnAgent();
        if (count == 0 || count > MAX_PER_MINT) revert BadCount();
        uint256 left = CURVE_UNITS - sold;
        if (left == 0) revert SoldOut();
        if (count > left) count = left;
        if (balanceOf(msg.sender) + count * UNIT > WALLET_CAP * UNIT) revert WalletCapReached();

        uint256 cost = quote(count);
        if (msg.value < cost) revert NotEnoughBNB(cost);

        sold += count;
        raised += cost;
        uint256 toTeam = cost / 2;
        teamOwed += toTeam;
        poolReserve += cost - toTeam;

        _mint(msg.sender, count * UNIT);
        emit Minted(msg.sender, count, cost, sold);

        if (sold == CURVE_UNITS) _graduate();

        uint256 refund = msg.value - cost;
        if (refund > 0) _send(msg.sender, refund);
    }

    /// @notice Seed the pool if the curve is sold out (normally done by the last mint).
    function graduate() external nonReentrant {
        if (graduated) revert AlreadyGraduated();
        if (sold < CURVE_UNITS) revert TooEarly();
        _graduate();
    }

    function _graduate() private {
        graduated = true;
        uint256 bnb = poolReserve;
        poolReserve = 0;
        // Pool units go straight to the pair (a contract, so it holds no NFTs), then the BNB as WBNB.
        _mint(pair, POOL_UNITS * UNIT);
        IWBNB(wbnb).deposit{value: bnb}();
        if (!IWBNB(wbnb).transfer(pair, bnb)) revert TransferFailed();
        // LP goes to the dead address: nobody can ever remove this liquidity.
        uint256 liquidity = IPancakePair(pair).mint(DEAD);
        emit Graduated(pair, POOL_UNITS, bnb, liquidity);
    }

    // ------------------------------------------------------------------ views for the site & agents

    function info()
        external
        view
        returns (uint256 sold_, uint256 curveUnits, uint256 raised_, uint256 nextPrice, bool open_, bool graduated_, uint256 teamOwed_, uint256 poolReserve_)
    {
        uint256 p = sold >= CURVE_UNITS ? 0 : _y(sold + 1) - _y(sold);
        return (sold, CURVE_UNITS, raised, p, open, graduated, teamOwed, poolReserve);
    }

    /// @notice Total BNB the full curve raises (about 22.22 BNB).
    function curveTarget() external pure returns (uint256) {
        return _y(CURVE_UNITS) - _y(0);
    }

    /// @notice Punk ids held by `who` (paged with [begin, end) over that wallet's list).
    function ownedIds(address who, uint256 begin, uint256 end) external view returns (uint256[] memory) {
        return _ownedIds(who, begin, end);
    }

    function isAgent(address who) external view returns (bool) {
        return registry.balanceOf(who) > 0;
    }

    // ------------------------------------------------------------------ owner powers (limited)

    /// @notice Starts the mint. Can be called once; the mint cannot be paused afterwards.
    function openMint() external onlyOwner {
        open = true;
        emit Opened();
    }

    /// @notice Sends the team half to the team wallet. Anyone may trigger it; the BNB only goes to `team`.
    ///         The pool half can never be withdrawn.
    function withdrawTeam() external nonReentrant {
        uint256 a = teamOwed;
        if (a == 0) revert NothingToWithdraw();
        teamOwed = 0;
        _send(team, a);
        emit TeamWithdrawn(team, a);
    }

    function setTeam(address t) external onlyOwner { team = t; }
    function setBaseURI(string calldata b) external onlyOwner { _baseURI = b; }

    /// @notice Registry moves (if SPACE ID migrates) wait 24 hours, in public.
    function proposeRegistry(address r) external onlyOwner {
        pendingRegistry = r;
        pendingRegistryAt = uint64(block.timestamp + REGISTRY_DELAY);
        emit RegistryProposed(r, pendingRegistryAt);
    }

    function acceptRegistry() external onlyOwner {
        if (pendingRegistry == address(0) || block.timestamp < pendingRegistryAt) revert TooEarly();
        registry = IAgentRegistry(pendingRegistry);
        pendingRegistry = address(0);
        emit RegistryChanged(address(registry));
    }

    // ------------------------------------------------------------------ DN404 plumbing

    function name() public view override returns (string memory) { return _name; }
    function symbol() public view override returns (string memory) { return _symbol; }

    function _tokenURI(uint256 id) internal view override returns (string memory) {
        return string.concat(_baseURI, _toString(id));
    }

    /// @dev Before graduation nobody can put tokens into the pool pair, so the launch price
    ///      cannot be front-run. Minting into the pair at graduation does not go through here.
    function _transfer(address from, address to, uint256 amount) internal override {
        if (!graduated && to == pair) revert PoolLockedUntilGraduation();
        super._transfer(from, to, amount);
    }

    function _transferFromNFT(address from, address to, uint256 id, address msgSender) internal override {
        if (!graduated && to == pair) revert PoolLockedUntilGraduation();
        super._transferFromNFT(from, to, id, msgSender);
    }

    // ------------------------------------------------------------------ helpers

    function _y(uint256 s) private pure returns (uint256) {
        uint256 x = X0 - s * UNIT;
        return (K + x - 1) / x; // round up: buyers never pay less than the curve
    }

    function _send(address to, uint256 v) private {
        (bool ok, ) = payable(to).call{value: v}("");
        if (!ok) revert TransferFailed();
    }

    function _toString(uint256 v) private pure returns (string memory s) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) len++;
        bytes memory b = new bytes(len);
        for (; v != 0; v /= 10) b[--len] = bytes1(uint8(48 + (v % 10)));
        return string(b);
    }
}
