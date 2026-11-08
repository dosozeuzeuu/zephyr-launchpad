// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from '@solady/auth/Ownable.sol';
import {ReentrancyGuard} from '@solady/utils/ReentrancyGuard.sol';

import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {IUnlockCallback} from '@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol';
import {TickMath} from '@uniswap/v4-core/src/libraries/TickMath.sol';
import {BalanceDelta} from '@uniswap/v4-core/src/types/BalanceDelta.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolId, PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {SwapParams} from '@uniswap/v4-core/src/types/PoolOperation.sol';

import {CurrencySettler} from '@flaunch/libraries/CurrencySettler.sol';

import {IWHYPE} from './IWHYPE.sol';
import {IZephyrVault} from './IZephyrVault.sol';

interface IZephyrPositionManager {
    function poolKey(address _token) external view returns (PoolKey memory);
}

interface IHolderShare {
    function holderShare(PoolId _poolId) external view returns (uint16);
}

interface IFeeEscrowAllocate {
    function allocateFees(PoolId _poolId, address _recipient, uint _amount) external;
}

interface IBurnable {
    function burn(uint _value) external;
}

/**
 * [Zephyr] Holds each pool's buyback and holder-reward share in wrapped HYPE.
 *
 * Funds can only ever leave in two ways, both triggered by a keeper:
 *  - `buyback`: buy the pool's own token on its Uniswap v4 pool and burn every token bought.
 *  - `distribute`: pay the pool's holders in HYPE, at most once per round interval.
 *
 * The owner can change the keepers and thresholds, but has no way to withdraw pool funds.
 */
contract ZephyrVault is IZephyrVault, IUnlockCallback, Ownable, ReentrancyGuard {
    using CurrencySettler for Currency;
    using PoolIdLibrary for PoolKey;

    error CallerIsNotPositionManager();
    error CallerIsNotPoolManager();
    error CallerIsNotKeeper();
    error UnknownToken(address _token);
    error BelowThreshold(uint _available, uint _threshold);
    error InsufficientOutput(uint _received, uint _minimum);
    error RoundTooSoon(uint _nextRoundAt);
    error LengthMismatch();
    error ExceedsHolderBalance(uint _requested, uint _available);

    event Deposited(PoolId indexed _poolId, uint _buyback, uint _holders);
    event BuybackExecuted(PoolId indexed _poolId, address indexed _token, uint _hypeSpent, uint _tokensBurned);
    event HoldersPaid(PoolId indexed _poolId, address indexed _token, uint _recipients, uint _total);
    event HolderPaymentEscrowed(PoolId indexed _poolId, address indexed _recipient, uint _amount);
    event KeeperUpdated(address indexed _keeper, bool _enabled);
    event ThresholdUpdated(uint _threshold);

    struct PoolBalance {
        uint128 buyback;
        uint128 holders;
        uint64 lastHolderRound;
    }

    uint16 internal constant ONE_HUNDRED_PERCENT = 100_00;

    /// Minimum time between holder reward rounds for a pool
    uint public constant HOLDER_ROUND_INTERVAL = 10 minutes;

    /// Gas forwarded with each direct HYPE payment; failures fall back to the fee escrow
    uint internal constant PAYMENT_GAS = 10_000;

    IPoolManager public immutable poolManager;
    address public immutable positionManager;
    IWHYPE public immutable whype;
    IHolderShare public immutable feeConfig;
    IFeeEscrowAllocate public immutable feeEscrow;

    /// A pool needs at least this much in a bucket before it can be spent
    uint public threshold = 0.01 ether;

    mapping(address _keeper => bool) public isKeeper;
    mapping(PoolId _poolId => PoolBalance) public balances;

    constructor(
        address _poolManager,
        address _positionManager,
        address _whype,
        address _feeConfig,
        address _feeEscrow,
        address _owner
    ) {
        poolManager = IPoolManager(_poolManager);
        positionManager = _positionManager;
        whype = IWHYPE(_whype);
        feeConfig = IHolderShare(_feeConfig);
        feeEscrow = IFeeEscrowAllocate(_feeEscrow);
        _initializeOwner(_owner);

        IWHYPE(_whype).approve(_feeEscrow, type(uint).max);
    }

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender]) revert CallerIsNotKeeper();
        _;
    }

    /**
     * Called by the {PositionManager} when a pool distributes fees. Pulls the wrapped HYPE and
     * splits it between the pool's buyback and holder buckets by the share set at launch.
     */
    function deposit(
        PoolKey calldata _poolKey,
        uint _amount
    ) external override {
        if (msg.sender != positionManager) revert CallerIsNotPositionManager();
        if (_amount == 0) return;

        whype.transferFrom(msg.sender, address(this), _amount);

        PoolId poolId = _poolKey.toId();
        uint toHolders = _amount * feeConfig.holderShare(poolId) / ONE_HUNDRED_PERCENT;
        uint toBuyback = _amount - toHolders;

        PoolBalance storage bal = balances[poolId];
        bal.buyback += uint128(toBuyback);
        bal.holders += uint128(toHolders);

        emit Deposited(poolId, toBuyback, toHolders);
    }

    /**
     * Spends a pool's whole buyback bucket buying its token on its own pool, then burns every
     * token bought. The keeper passes a minimum output computed from a fresh quote, so the swap
     * cannot be sandwiched beyond the keeper's slippage.
     *
     * @param _token The launched token
     * @param _minTokensOut The minimum tokens the buyback must receive
     */
    function buyback(
        address _token,
        uint _minTokensOut
    ) external onlyKeeper nonReentrant returns (uint tokensBurned_) {
        PoolKey memory key = _poolKeyOf(_token);
        PoolId poolId = key.toId();

        uint amount = balances[poolId].buyback;
        if (amount < threshold) revert BelowThreshold(amount, threshold);
        balances[poolId].buyback = 0;

        tokensBurned_ = abi.decode(poolManager.unlock(abi.encode(key, _token, amount)), (uint));
        if (tokensBurned_ < _minTokensOut) revert InsufficientOutput(tokensBurned_, _minTokensOut);

        IBurnable(_token).burn(tokensBurned_);
        emit BuybackExecuted(poolId, _token, amount, tokensBurned_);
    }

    function unlockCallback(
        bytes calldata _data
    ) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert CallerIsNotPoolManager();

        (PoolKey memory key, address token, uint amountIn) = abi.decode(_data, (PoolKey, address, uint));
        bool nativeIsZero = Currency.unwrap(key.currency0) == address(whype);

        // Exact input: spend `amountIn` wrapped HYPE for the token
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: nativeIsZero,
                amountSpecified: -int(amountIn),
                sqrtPriceLimitX96: nativeIsZero ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ''
        );

        (int128 nativeDelta, int128 tokenDelta) = nativeIsZero ? (delta.amount0(), delta.amount1()) : (delta.amount1(), delta.amount0());

        uint owed = uint(int(-nativeDelta));
        uint received = uint(int(tokenDelta));

        Currency.wrap(address(whype)).settle(poolManager, address(this), owed, false);
        Currency.wrap(token).take(poolManager, address(this), received, false);

        // Any wrapped HYPE not consumed (a price limit hit) goes back to the bucket
        if (owed < amountIn) {
            balances[key.toId()].buyback += uint128(amountIn - owed);
        }

        return abi.encode(received);
    }

    /**
     * Pays one holder-reward round for a pool. The keeper computes each holder's share from their
     * balance (holders under the minimum and contracts are excluded) off-chain; the vault only
     * enforces the pool's available balance and the round interval.
     *
     * Each payment is sent as HYPE. If a recipient cannot receive it, the amount is credited to
     * them in the fee escrow instead, to claim later.
     */
    function distribute(
        address _token,
        address[] calldata _recipients,
        uint[] calldata _amounts
    ) external onlyKeeper nonReentrant {
        if (_recipients.length != _amounts.length) revert LengthMismatch();

        PoolKey memory key = _poolKeyOf(_token);
        PoolId poolId = key.toId();
        PoolBalance storage bal = balances[poolId];

        uint nextRound = uint(bal.lastHolderRound) + HOLDER_ROUND_INTERVAL;
        if (bal.lastHolderRound != 0 && block.timestamp < nextRound) revert RoundTooSoon(nextRound);
        if (bal.holders < threshold) revert BelowThreshold(bal.holders, threshold);

        uint total;
        for (uint i; i < _amounts.length; ++i) {
            total += _amounts[i];
        }
        if (total > bal.holders) revert ExceedsHolderBalance(total, bal.holders);

        bal.holders -= uint128(total);
        bal.lastHolderRound = uint64(block.timestamp);

        whype.withdraw(total);

        for (uint i; i < _recipients.length; ++i) {
            uint amount = _amounts[i];
            if (amount == 0) continue;

            (bool sent,) = payable(_recipients[i]).call{value: amount, gas: PAYMENT_GAS}('');
            if (!sent) {
                whype.deposit{value: amount}();
                feeEscrow.allocateFees(poolId, _recipients[i], amount);
                emit HolderPaymentEscrowed(poolId, _recipients[i], amount);
            }
        }

        emit HoldersPaid(poolId, _token, _recipients.length, total);
    }

    function setKeeper(
        address _keeper,
        bool _enabled
    ) external onlyOwner {
        isKeeper[_keeper] = _enabled;
        emit KeeperUpdated(_keeper, _enabled);
    }

    function setThreshold(
        uint _threshold
    ) external onlyOwner {
        threshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }

    function _poolKeyOf(
        address _token
    ) internal view returns (PoolKey memory key_) {
        key_ = IZephyrPositionManager(positionManager).poolKey(_token);
        if (key_.tickSpacing == 0) revert UnknownToken(_token);
    }

    /// Receives HYPE when unwrapping
    receive() external payable {}
}
