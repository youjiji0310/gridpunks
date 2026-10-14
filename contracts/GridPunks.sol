// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GridPunks — 10,000 pixel punks laid out on a 100 x 100 grid.
/// @notice You pick the cell, the chain picks the punk. Token id = cell id
///         (x = id % 100, y = id / 100). The punk living in a cell is drawn at
///         random from the punks nobody has found yet, in the mint transaction.
contract GridPunks is ERC721, ERC2981, Ownable {
    uint256 public constant SIZE = 100;
    uint256 public constant SUPPLY = 10_000;
    uint256 public constant MAX_PER_TX = 20;

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

    event Claimed(address indexed to, uint256 indexed cell, uint256 punk);

    error MintClosed();
    error OnlyWallets();
    error BadCount();
    error WrongPayment();
    error BadCell(uint256 cell);
    error CellTaken(uint256 cell);

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

    function mint(uint256[] calldata cells) external payable {
        if (!mintOpen) revert MintClosed();
        // Contracts cannot mint: stops "simulate and revert until rare" rerolls.
        if (msg.sender != tx.origin) revert OnlyWallets();
        uint256 n = cells.length;
        if (n == 0 || n > MAX_PER_TX) revert BadCount();
        if (msg.value != price * n) revert WrongPayment();

        bytes32 seed = keccak256(
            abi.encode(blockhash(block.number - 1), block.timestamp, msg.sender, _nonce++, totalSupply)
        );
        for (uint256 i = 0; i < n; i++) {
            uint256 cell = cells[i];
            if (cell >= SUPPLY) revert BadCell(cell);
            if (_ownerOf(cell) != address(0)) revert CellTaken(cell);
            uint256 remaining = SUPPLY - totalSupply;
            uint256 r = uint256(keccak256(abi.encode(seed, i))) % remaining;
            uint256 punk = _take(r, remaining - 1);
            _setPunk(cell, punk);
            totalSupply++;
            _mint(msg.sender, cell);
            emit Claimed(msg.sender, cell, punk);
        }
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
