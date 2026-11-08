// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BalanceDelta} from '@uniswap/v4-core/src/types/BalanceDelta.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolId, PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {SwapParams} from '@uniswap/v4-core/src/types/PoolOperation.sol';

import {IFeeCalculator} from '@flaunch-interfaces/IFeeCalculator.sol';

interface IFlaunchesAt {
    function flaunchesAt(PoolId _poolId) external view returns (uint);
}

/**
 * [Zephyr] Per-pool swap fee chosen by the creator at launch, plus an optional anti-snipe window
 * in which buys start at a higher fee that falls linearly to the swap fee.
 *
 * Also records the share of the vault deposit that goes to holder rewards (the rest buys back
 * and burns the token). Every value is fixed at launch and can never be changed.
 *
 * Fees are expressed with 2dp precision, where 100_00 == 100% (so 1% == 100).
 */
contract ZephyrFeeCalculator is IFeeCalculator {
    using PoolIdLibrary for PoolKey;

    error CallerIsNotPositionManager();
    error InvalidSwapFee(uint24 _fee);
    error InvalidSnipeFee(uint24 _fee);
    error InvalidSnipeDuration(uint32 _duration);
    error InvalidHolderShare(uint16 _share);
    error AlreadyConfigured();

    event PoolConfigured(
        PoolId indexed _poolId, uint24 _swapFee, uint24 _snipeFee, uint32 _snipeDuration, uint40 _startsAt, uint16 _holderShare
    );

    uint24 public constant MIN_SWAP_FEE = 1_00; // 1%
    uint24 public constant MAX_SWAP_FEE = 5_00; // 5%
    uint24 public constant MAX_SNIPE_FEE = 30_00; // 30%
    uint32 public constant MAX_SNIPE_DURATION = 15 minutes;
    uint16 public constant ONE_HUNDRED_PERCENT = 100_00;

    /// The parameters a launch passes in `feeCalculatorParams`
    struct LaunchFeeParams {
        uint24 swapFee;
        uint24 snipeFee; // 0 disables anti-snipe
        uint32 snipeDuration;
        uint16 holderShare; // share of the vault deposit paid to holders, rest is buyback-and-burn
    }

    struct PoolConfig {
        uint24 swapFee;
        uint24 snipeFee;
        uint32 snipeDuration;
        uint40 startsAt;
        uint16 holderShare;
        bool configured;
    }

    address public immutable positionManager;
    address public immutable nativeToken;

    mapping(PoolId _poolId => PoolConfig) internal _configs;

    constructor(
        address _positionManager,
        address _nativeToken
    ) {
        positionManager = _positionManager;
        nativeToken = _nativeToken;
    }

    function setFlaunchParams(
        PoolId _poolId,
        bytes calldata _params
    ) external override {
        if (msg.sender != positionManager) revert CallerIsNotPositionManager();
        if (_configs[_poolId].configured) revert AlreadyConfigured();

        // An empty payload gives the default launch: 1% fee, no anti-snipe, all to buyback
        LaunchFeeParams memory p = _params.length == 0
            ? LaunchFeeParams({swapFee: MIN_SWAP_FEE, snipeFee: 0, snipeDuration: 0, holderShare: 0})
            : abi.decode(_params, (LaunchFeeParams));

        if (p.swapFee < MIN_SWAP_FEE || p.swapFee > MAX_SWAP_FEE) revert InvalidSwapFee(p.swapFee);
        if (p.snipeFee != 0) {
            if (p.snipeFee <= p.swapFee || p.snipeFee > MAX_SNIPE_FEE) revert InvalidSnipeFee(p.snipeFee);
            if (p.snipeDuration == 0 || p.snipeDuration > MAX_SNIPE_DURATION) revert InvalidSnipeDuration(p.snipeDuration);
        } else {
            p.snipeDuration = 0;
        }
        if (p.holderShare > ONE_HUNDRED_PERCENT) revert InvalidHolderShare(p.holderShare);

        // Anti-snipe starts when trading opens: now, or the scheduled opening if later
        uint startsAt = IFlaunchesAt(positionManager).flaunchesAt(_poolId);
        if (startsAt < block.timestamp) startsAt = block.timestamp;

        _configs[_poolId] = PoolConfig({
            swapFee: p.swapFee,
            snipeFee: p.snipeFee,
            snipeDuration: p.snipeDuration,
            startsAt: uint40(startsAt),
            holderShare: p.holderShare,
            configured: true
        });

        emit PoolConfigured(_poolId, p.swapFee, p.snipeFee, p.snipeDuration, uint40(startsAt), p.holderShare);
    }

    function determineSwapFee(
        PoolKey memory _poolKey,
        SwapParams memory _params,
        uint24 _baseFee
    ) public view override returns (uint24 swapFee_) {
        PoolConfig memory cfg = _configs[_poolKey.toId()];
        if (!cfg.configured) return _baseFee;

        bool nativeIsZero = Currency.unwrap(_poolKey.currency0) == nativeToken;
        bool isBuy = _params.zeroForOne == nativeIsZero;
        return _currentFee(cfg, isBuy);
    }

    /// The fee a buy or sell pays right now, for the UI and quoting
    function currentSwapFee(
        PoolId _poolId,
        bool _isBuy
    ) external view returns (uint24) {
        PoolConfig memory cfg = _configs[_poolId];
        if (!cfg.configured) return 0;
        return _currentFee(cfg, _isBuy);
    }

    function poolConfig(
        PoolId _poolId
    ) external view returns (PoolConfig memory) {
        return _configs[_poolId];
    }

    function holderShare(
        PoolId _poolId
    ) external view returns (uint16) {
        return _configs[_poolId].holderShare;
    }

    function _currentFee(
        PoolConfig memory _cfg,
        bool _isBuy
    ) internal view returns (uint24) {
        if (!_isBuy || _cfg.snipeFee == 0) return _cfg.swapFee;

        uint end = uint(_cfg.startsAt) + _cfg.snipeDuration;
        if (block.timestamp >= end) return _cfg.swapFee;

        uint elapsed = block.timestamp > _cfg.startsAt ? block.timestamp - _cfg.startsAt : 0;
        uint drop = uint(_cfg.snipeFee - _cfg.swapFee) * elapsed / _cfg.snipeDuration;
        return uint24(_cfg.snipeFee - drop);
    }

    function trackSwap(
        address,
        PoolKey calldata,
        SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) external override {}
}
