// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * Holds global variable for the total token supply during flaunching.
 */
library TokenSupply {
    /// The initial supply of the token minted when flaunched
    uint public constant INITIAL_SUPPLY = 1e27; // 1,000,000,000 tokens (18 decimals)
}
