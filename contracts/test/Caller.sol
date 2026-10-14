// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IGrid {
    function mint(uint256[] calldata cells, uint256 zone, bytes calldata proof) external payable;
    function claimLegend(bytes calldata proof) external;
}
contract Caller {
    function go(address g, uint256 cell) external payable {
        uint256[] memory c = new uint256[](1); c[0] = cell;
        IGrid(g).mint{value: msg.value}(c, 0, "");
    }
    function legend(address g, bytes calldata proof) external { IGrid(g).claimLegend(proof); }
}
