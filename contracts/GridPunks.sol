// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title GridPunks — 10,000 pixel punks laid out on a 100 x 100 grid.
/// @notice You pick the cell, the chain picks the punk. Token id = cell id
///         (x = id % 100, y = id / 100). The punk living in a cell is drawn at
///         random from the punks nobody has found yet, in the mint transaction.
///
///         The grid is cut into 10 zones of 10 rows (zone = cell / 1000). Each zone
///         is sealed by a puzzle published on-chain. Whoever solves it can mint there
///         at once; everyone else waits until the zone goes public. The answer is
///         never revealed: it is stretched (PBKDF2) into a private key, and that key
///         signs the solver's own address. The contract only knows the matching
///         public address, so copying someone's transaction or signature is useless.
///         A final puzzle unlocks the one-of-one Golden Punk (token 10000).
contract GridPunks is ERC721, ERC2981, Ownable {
    uint256 public constant SIZE = 100;
    uint256 public constant SUPPLY = 10_000;
    uint256 public constant MAX_PER_TX = 20;
    uint256 public constant ZONES = 10;
    uint256 public constant ZONE_SIZE = 1_000;
    uint256 public constant LEGEND_ID = 10_000;
    uint256 private constant LEGEND_ZONE = 10;

    uint256 public price = 0.0003 ether;
    bool public mintOpen;
    uint256 public totalSupply;
    /// sha256 of traits.json, so anyone can check the art set was fixed before the mint
    string public provenance;

    string private _base;
    string private _contractURI;
    uint256 private _nonce;
    // Lazy Fisher-Yates over punk indexes 0..9999 (value stored +1, 0 = untouched)
    mapping(uint256 => uint256) private _swap;
    // 16 punks per slot, uint16 each, stored as punk + 1 (0 = empty cell)
    mapping(uint256 => uint256) private _packed;

    // ------------------------------------------------------------- puzzles
    address[ZONES] public zoneSigner;   // address of the key derived from the zone's answer
    uint64[ZONES] public zoneOpenAt;    // puzzle published: solvers may mint (0 = sealed)
    uint64[ZONES] public zonePublicAt;  // anyone may mint
    string[ZONES] public puzzle;
    address public legendSigner;
    uint64 public legendOpenAt;
    string public legendPuzzle;
    /// bit z set = this wallet proved the answer of zone z
    mapping(address => uint256) public solvedMask;

    event Claimed(address indexed to, uint256 indexed cell, uint256 punk);
    event PuzzleReleased(uint256 indexed zone, string text, uint64 publicAt);
    event Solved(address indexed solver, uint256 indexed zone);
    event LegendClaimed(address indexed winner);

    error MintClosed();
    error OnlyWallets();
    error BadCount();
    error WrongPayment();
    error BadCell(uint256 cell);
    error CellTaken(uint256 cell);
    error ZoneLocked(uint256 zone);
    error BadZone();
    error BadProof();
    error AlreadyReleased();
    error NoSigner();
    error LegendNotOpen();
    error LegendTaken();

    constructor(string memory base, string memory collectionURI, string memory provenanceHash, address royaltyReceiver)
        ERC721("GridPunks", "GRID")
        Ownable(msg.sender)
    {
        _base = base;
        _contractURI = collectionURI;
        provenance = provenanceHash;
        _setDefaultRoyalty(royaltyReceiver, 1000); // 10%
    }

    // ------------------------------------------------------------------ mint

    /// @param cells plots to claim (max 20)
    /// @param zone  zone the proof is for (ignored when proof is empty)
    /// @param proof signature of solveHash(zone, msg.sender) by the zone's answer key,
    ///              or empty when the wallet already solved it / the zones are public
    function mint(uint256[] calldata cells, uint256 zone, bytes calldata proof) external payable {
        if (!mintOpen) revert MintClosed();
        // Contracts cannot mint: stops "simulate and revert until rare" rerolls.
        if (msg.sender != tx.origin) revert OnlyWallets();
        uint256 n = cells.length;
        if (n == 0 || n > MAX_PER_TX) revert BadCount();
        if (msg.value != price * n) revert WrongPayment();
        if (proof.length != 0) {
            if (zone >= ZONES) revert BadZone();
            if (zoneOpenAt[zone] == 0) revert ZoneLocked(zone);
            _checkProof(zone, zoneSigner[zone], proof);
            if (solvedMask[msg.sender] & (1 << zone) == 0) {
                solvedMask[msg.sender] |= 1 << zone;
                emit Solved(msg.sender, zone);
            }
        }

        bytes32 seed = keccak256(
            abi.encode(blockhash(block.number - 1), block.timestamp, msg.sender, _nonce++, totalSupply)
        );
        for (uint256 i = 0; i < n; i++) {
            uint256 cell = cells[i];
            if (cell >= SUPPLY) revert BadCell(cell);
            if (_ownerOf(cell) != address(0)) revert CellTaken(cell);
            if (!canMint(msg.sender, cell / ZONE_SIZE)) revert ZoneLocked(cell / ZONE_SIZE);
            uint256 remaining = SUPPLY - totalSupply;
            uint256 r = uint256(keccak256(abi.encode(seed, i))) % remaining;
            uint256 punk = _take(r, remaining - 1);
            _setPunk(cell, punk);
            totalSupply++;
            _mint(msg.sender, cell);
            emit Claimed(msg.sender, cell, punk);
        }
    }

    /// @notice Free claim of the one-of-one Golden Punk (token 10000) with the final answer.
    function claimLegend(bytes calldata proof) external {
        if (legendOpenAt == 0) revert LegendNotOpen();
        if (msg.sender != tx.origin) revert OnlyWallets();
        if (_ownerOf(LEGEND_ID) != address(0)) revert LegendTaken();
        _checkProof(LEGEND_ZONE, legendSigner, proof);
        _mint(msg.sender, LEGEND_ID);
        emit LegendClaimed(msg.sender);
    }

    /// @notice The message a solver signs with the answer key (as an EIP-191 personal message).
    function solveHash(uint256 zone, address solver) public view returns (bytes32) {
        return keccak256(abi.encode("GRIDPUNKS", block.chainid, address(this), zone, solver));
    }

    function _checkProof(uint256 zone, address signer, bytes calldata proof) private view {
        if (signer == address(0)) revert NoSigner();
        (address got, ECDSA.RecoverError err, ) =
            ECDSA.tryRecover(MessageHashUtils.toEthSignedMessageHash(solveHash(zone, msg.sender)), proof);
        if (err != ECDSA.RecoverError.NoError || got != signer) revert BadProof();
    }

    function _take(uint256 r, uint256 last) private returns (uint256 picked) {
        uint256 sr = _swap[r];
        picked = sr == 0 ? r : sr - 1;
        if (r != last) {
            uint256 sl = _swap[last];
            _swap[r] = (sl == 0 ? last : sl - 1) + 1;
        }
        if (_swap[last] != 0) delete _swap[last];
    }

    function _setPunk(uint256 cell, uint256 punk) private {
        uint256 slot = cell >> 4;
        uint256 shift = (cell & 15) * 16;
        _packed[slot] |= (punk + 1) << shift;
    }

    // ----------------------------------------------------------------- views

    /// @return minted whether the cell is taken, punk the punk index (0..9999) in traits.json
    function punkOf(uint256 cell) public view returns (bool minted, uint256 punk) {
        if (cell >= SUPPLY) revert BadCell(cell);
        uint256 v = (_packed[cell >> 4] >> ((cell & 15) * 16)) & 0xffff;
        if (v == 0) return (false, 0);
        return (true, v - 1);
    }

    /// @notice The whole board in one call: 625 words, 16 cells per word,
    ///         each cell a uint16 equal to punk + 1 (0 = still empty).
    function grid() external view returns (uint256[625] memory out) {
        for (uint256 i = 0; i < 625; i++) out[i] = _packed[i];
    }

    /// @notice True when `who` may claim plots in `zone` right now.
    function canMint(address who, uint256 zone) public view returns (bool) {
        if (zone >= ZONES || zoneOpenAt[zone] == 0) return false;
        if (block.timestamp >= zonePublicAt[zone]) return true;
        return solvedMask[who] & (1 << zone) != 0;
    }

    /// @notice Everything the site needs about the zones in one call.
    function zones() external view returns (address[ZONES] memory signers, uint64[ZONES] memory openAt, uint64[ZONES] memory publicAt) {
        return (zoneSigner, zoneOpenAt, zonePublicAt);
    }

    function tokenURI(uint256 cell) public view override returns (string memory) {
        _requireOwned(cell);
        return string.concat(_base, _toString(cell));
    }

    /// @notice Collection-level metadata (name, image, description) read by OpenSea and other marketplaces.
    function contractURI() external view returns (string memory) { return _contractURI; }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(id);
    }

    // ----------------------------------------------------------------- owner

    function setMintOpen(bool open) external onlyOwner { mintOpen = open; }

    /// @notice Set the answer addresses. A zone's signer is frozen once its puzzle is out.
    function setSigners(address[ZONES] calldata signers, address legend) external onlyOwner {
        for (uint256 z = 0; z < ZONES; z++) if (zoneOpenAt[z] == 0) zoneSigner[z] = signers[z];
        if (legendOpenAt == 0) legendSigner = legend;
    }

    /// @notice Publish a zone's puzzle. Solvers can mint now; everyone after `publicDelay` seconds.
    function releaseZone(uint256 zone, string calldata text, uint64 publicDelay) external onlyOwner {
        if (zone >= ZONES) revert BadZone();
        if (zoneOpenAt[zone] != 0) revert AlreadyReleased();
        if (zoneSigner[zone] == address(0)) revert NoSigner();
        zoneOpenAt[zone] = uint64(block.timestamp);
        zonePublicAt[zone] = uint64(block.timestamp) + publicDelay;
        puzzle[zone] = text;
        emit PuzzleReleased(zone, text, zonePublicAt[zone]);
    }

    /// @notice Move a released zone's public time (e.g. open it now if a puzzle stays unsolved).
    function setZonePublicAt(uint256 zone, uint64 at) external onlyOwner {
        if (zone >= ZONES || zoneOpenAt[zone] == 0) revert BadZone();
        zonePublicAt[zone] = at;
    }

    function releaseLegend(string calldata text) external onlyOwner {
        if (legendOpenAt != 0) revert AlreadyReleased();
        if (legendSigner == address(0)) revert NoSigner();
        legendOpenAt = uint64(block.timestamp);
        legendPuzzle = text;
        emit PuzzleReleased(LEGEND_ZONE, text, 0);
    }
    function setPrice(uint256 p) external onlyOwner { price = p; }
    function setBaseURI(string calldata b) external onlyOwner { _base = b; }
    function setContractURI(string calldata u) external onlyOwner { _contractURI = u; }
    function setRoyalty(address to, uint96 bps) external onlyOwner { _setDefaultRoyalty(to, bps); }

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    function _toString(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) len++;
        bytes memory b = new bytes(len);
        while (v != 0) { b[--len] = bytes1(uint8(48 + (v % 10))); v /= 10; }
        return string(b);
    }
}
