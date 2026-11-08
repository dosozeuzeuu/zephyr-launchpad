// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from '@solady/utils/ReentrancyGuard.sol';
import {SafeTransferLib} from '@solady/utils/SafeTransferLib.sol';

import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {IUnlockCallback} from '@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol';
import {TickMath} from '@uniswap/v4-core/src/libraries/TickMath.sol';
import {BalanceDelta} from '@uniswap/v4-core/src/types/BalanceDelta.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {SwapParams} from '@uniswap/v4-core/src/types/PoolOperation.sol';

import {CurrencySettler} from '@flaunch/libraries/CurrencySettler.sol';

import {IWHYPE} from './IWHYPE.sol';

interface IZephyrPools {
    function poolKey(address _token) external view returns (PoolKey memory);
}

/**
 * [Zephyr] Buys and sells launched tokens with plain HYPE in one transaction, through the
 * token's Uniswap v4 pool. Wraps and unwraps HYPE internally, enforces a minimum output and a
 * deadline, and holds no funds between calls.
 *
 * Selling needs a single ERC20 approval of the token to this router.
 */
contract ZephyrRouter is IUnlockCallback, ReentrancyGuard {
    using CurrencySettler for Currency;

    error CallerIsNotPoolManager();
    error DeadlinePassed();
    error UnknownToken(address _token);
    error InsufficientOutput(uint _received, uint _minimum);
    error ZeroAmount();

    event Trade(address indexed _token, address indexed _trader, bool _isBuy, uint _hype, uint _tokens);

    struct Callback {
        PoolKey key;
        address token;
        address payer;
        address recipient;
        bool isBuy;
        uint amountIn;
    }

    IPoolManager public immutable poolManager;
    IZephyrPools public immutable positionManager;
    IWHYPE public immutable whype;

    constructor(
        address _poolManager,
        address _positionManager,
        address _whype
    ) {
        poolManager = IPoolManager(_poolManager);
        positionManager = IZephyrPools(_positionManager);
        whype = IWHYPE(_whype);
    }

    /**
     * Buys `_token` with all the HYPE sent.
     *
     * @param _token The launched token to buy
     * @param _minTokensOut The least tokens the buyer accepts
     * @param _recipient Who receives the tokens
     * @param _deadline Unix time after which the trade fails
     */
    function buy(
        address _token,
        uint _minTokensOut,
        address _recipient,
        uint _deadline
    ) external payable nonReentrant returns (uint tokensOut_) {
        if (block.timestamp > _deadline) revert DeadlinePassed();
        if (msg.value == 0) revert ZeroAmount();

        PoolKey memory key = _keyOf(_token);
        whype.deposit{value: msg.value}();

        (uint spent, uint received) = abi.decode(
            poolManager.unlock(abi.encode(Callback(key, _token, address(this), _recipient, true, msg.value))), (uint, uint)
        );
        if (received < _minTokensOut) revert InsufficientOutput(received, _minTokensOut);

        // Refund any HYPE not consumed (only possible at the extreme end of the curve)
        if (spent < msg.value) {
            uint refund = msg.value - spent;
            whype.withdraw(refund);
            SafeTransferLib.safeTransferETH(msg.sender, refund);
        }

        tokensOut_ = received;
        emit Trade(_token, msg.sender, true, spent, received);
    }

    /**
     * Sells `_tokensIn` of `_token` for HYPE.
     *
     * @param _token The launched token to sell
     * @param _tokensIn How many tokens to sell
     * @param _minHypeOut The least HYPE the seller accepts
     * @param _recipient Who receives the HYPE
     * @param _deadline Unix time after which the trade fails
     */
    function sell(
        address _token,
        uint _tokensIn,
        uint _minHypeOut,
        address payable _recipient,
        uint _deadline
    ) external nonReentrant returns (uint hypeOut_) {
        if (block.timestamp > _deadline) revert DeadlinePassed();
        if (_tokensIn == 0) revert ZeroAmount();

        PoolKey memory key = _keyOf(_token);

        (, uint received) = abi.decode(
            poolManager.unlock(abi.encode(Callback(key, _token, msg.sender, address(this), false, _tokensIn))), (uint, uint)
        );
        if (received < _minHypeOut) revert InsufficientOutput(received, _minHypeOut);

        whype.withdraw(received);
        SafeTransferLib.safeTransferETH(_recipient, received);

        hypeOut_ = received;
        emit Trade(_token, msg.sender, false, received, _tokensIn);
    }

    function unlockCallback(
        bytes calldata _data
    ) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert CallerIsNotPoolManager();

        Callback memory cb = abi.decode(_data, (Callback));
        bool nativeIsZero = Currency.unwrap(cb.key.currency0) == address(whype);

        // A buy pays native; a sell pays the token
        bool zeroForOne = cb.isBuy ? nativeIsZero : !nativeIsZero;

        BalanceDelta delta = poolManager.swap(
            cb.key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int(cb.amountIn),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ''
        );

        (int128 inDelta, int128 outDelta) = zeroForOne ? (delta.amount0(), delta.amount1()) : (delta.amount1(), delta.amount0());
        (Currency inCurrency, Currency outCurrency) = zeroForOne ? (cb.key.currency0, cb.key.currency1) : (cb.key.currency1, cb.key.currency0);

        uint spent = uint(int(-inDelta));
        uint received = uint(int(outDelta));

        inCurrency.settle(poolManager, cb.payer, spent, false);
        outCurrency.take(poolManager, cb.recipient, received, false);

        return abi.encode(spent, received);
    }

    function _keyOf(
        address _token
    ) internal view returns (PoolKey memory key_) {
        key_ = positionManager.poolKey(_token);
        if (key_.tickSpacing == 0) revert UnknownToken(_token);
    }

    /// Receives HYPE when unwrapping
    receive() external payable {}
}
