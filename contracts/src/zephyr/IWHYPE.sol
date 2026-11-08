// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Wrapped HYPE follows the WETH9 interface.
interface IWHYPE {
    function deposit() external payable;
    function withdraw(uint) external;
    function approve(address, uint) external returns (bool);
    function transfer(address, uint) external returns (bool);
    function transferFrom(address, address, uint) external returns (bool);
    function balanceOf(address) external view returns (uint);
    function allowance(address, address) external view returns (uint);
}
