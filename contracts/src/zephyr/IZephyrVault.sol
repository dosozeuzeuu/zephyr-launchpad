// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

/// The vault that holds each pool's buyback and holder-reward share, in wrapped HYPE.
interface IZephyrVault {
    function deposit(PoolKey calldata _poolKey, uint _amount) external;
}
