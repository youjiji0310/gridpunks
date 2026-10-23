// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Test-only stand-ins for WBNB and the SPACE ID Agent ID registry.
contract MockWBNB {
    mapping(address => uint256) public balanceOf;
    function deposit() external payable { balanceOf[msg.sender] += msg.value; }
    function transfer(address to, uint256 v) external returns (bool) {
        require(balanceOf[msg.sender] >= v, "bal");
        balanceOf[msg.sender] -= v; balanceOf[to] += v; return true;
    }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        require(balanceOf[f] >= v, "bal");
        balanceOf[f] -= v; balanceOf[to] += v; return true;
    }
}

contract MockAgentRegistry {
    mapping(address => uint256) public balanceOf;
    mapping(address => string) public handleOf;
    function give(address who, string calldata handle) external { balanceOf[who] = 1; handleOf[who] = handle; }
}

interface IMint { function mint(uint256 count) external payable; }
/// Agent wallets may be smart-contract wallets, so contracts holding a .ai can mint.
contract ContractAgent {
    function go(address p, uint256 n) external payable { IMint(p).mint{value: msg.value}(n); }
    receive() external payable {}
}
