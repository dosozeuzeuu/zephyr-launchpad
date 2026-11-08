// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from 'forge-std/Test.sol';

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import {PoolManager} from '@uniswap/v4-core/src/PoolManager.sol';
import {TickMath} from '@uniswap/v4-core/src/libraries/TickMath.sol';
import {BalanceDelta} from '@uniswap/v4-core/src/types/BalanceDelta.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolId, PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {SwapParams} from '@uniswap/v4-core/src/types/PoolOperation.sol';

import {Flaunch} from '@flaunch/Flaunch.sol';
import {Memecoin} from '@flaunch/Memecoin.sol';
import {Oracle} from '@flaunch/Oracle.sol';
import {PositionManager} from '@flaunch/PositionManager.sol';
import {BidWall} from '@flaunch/bidwall/BidWall.sol';
import {FeeEscrow} from '@flaunch/escrows/FeeEscrow.sol';
import {FeeDistributor} from '@flaunch/hooks/FeeDistributor.sol';
import {FeeExemptions} from '@flaunch/hooks/FeeExemptions.sol';
import {InternalSwapPool} from '@flaunch/hooks/InternalSwapPool.sol';
import {ProtocolRoles} from '@flaunch/libraries/ProtocolRoles.sol';
import {TokenSupply} from '@flaunch/libraries/TokenSupply.sol';
import {FlaunchFeeExemption} from '@flaunch/price/FlaunchFeeExemption.sol';
import {InitialPrice} from '@flaunch/price/InitialPrice.sol';
import {IndexerSubscriber} from '@flaunch/subscribers/Indexer.sol';
import {TreasuryActionManager} from '@flaunch/treasury/ActionManager.sol';
import {MemecoinTreasury} from '@flaunch/treasury/MemecoinTreasury.sol';
import {PoolSwap} from '@flaunch/zaps/PoolSwap.sol';

import {IFeeExemptions} from '@flaunch-interfaces/IFeeExemptions.sol';
import {IPositionManager} from '@flaunch-interfaces/IPositionManager.sol';

import {ZephyrFeeCalculator} from '../../src/zephyr/ZephyrFeeCalculator.sol';
import {ZephyrRouter} from '../../src/zephyr/ZephyrRouter.sol';
import {ZephyrVault} from '../../src/zephyr/ZephyrVault.sol';
import {WETH9} from '../tokens/WETH9.sol';

contract RejectsHYPE {
    receive() external payable {
        revert('no');
    }
}

/**
 * End-to-end tests of a Zephyr deployment on a local Uniswap v4: launch, trade, fee split,
 * anti-snipe, buyback-and-burn and holder rewards. Run with native HYPE as both currency0
 * (`ZephyrTestNativeZero`) and currency1 (`ZephyrTestNativeOne`).
 */
abstract contract ZephyrTestBase is Test {
    using PoolIdLibrary for PoolKey;

    address payable internal constant PM_ADDRESS = payable(0x3fdc8d547641A626ec40242196f69754B25d25Dc);

    // 40 HYPE starting market cap over 1B tokens
    uint160 internal constant SQRT_UNFLIPPED = 396140812571321687967719751680000; // 5000 * 2^96
    uint160 internal constant SQRT_FLIPPED = 15845632502852867518708790; // 2^96 / 5000

    address internal protocolWallet = 0x43Dec03eb1c62063d75c37204B1ad0bbd8C80A0B;
    address internal keeper = makeAddr('keeper');
    address internal creator = makeAddr('creator');
    address internal alice = makeAddr('alice');
    address internal bob = makeAddr('bob');

    PoolManager internal poolManager;
    WETH9 internal whype;
    Flaunch internal flaunch;
    PositionManager internal pm;
    FeeEscrow internal feeEscrow;
    FeeExemptions internal feeExemptions;
    ZephyrFeeCalculator internal feeCalc;
    ZephyrVault internal vault;
    PoolSwap internal poolSwap;
    InitialPrice internal initialPrice;
    ZephyrRouter internal router;

    function _whypeAddress() internal pure virtual returns (address);

    function setUp() public {
        poolManager = new PoolManager(address(this));
        poolSwap = new PoolSwap(poolManager);

        deployCodeTo('WETH9.sol', abi.encode(), _whypeAddress());
        whype = WETH9(payable(_whypeAddress()));

        flaunch = new Flaunch(address(new Memecoin()), '');

        initialPrice = new InitialPrice(0, address(this), address(new FlaunchFeeExemption()));
        initialPrice.setSqrtPriceX96(InitialPrice.InitialSqrtPriceX96({unflipped: SQRT_UNFLIPPED, flipped: SQRT_FLIPPED}));

        feeExemptions = new FeeExemptions(address(this));
        TreasuryActionManager actionManager = new TreasuryActionManager(address(this));

        BidWall bidWall = new BidWall(address(whype), address(poolManager), address(this));
        bidWall.grantRole(ProtocolRoles.POSITION_MANAGER, PM_ADDRESS);

        IndexerSubscriber indexer = new IndexerSubscriber();
        feeEscrow = new FeeEscrow(address(whype), address(indexer));

        Oracle oracle = new Oracle(address(this));
        InternalSwapPool isp = new InternalSwapPool(poolManager, oracle, address(this));
        oracle.grantRole(oracle.ORACLE_CONSUMER(), address(isp));

        // 1% default swap fee (overridden per pool), no referrer, 30% to the protocol
        FeeDistributor.FeeDistribution memory dist =
            FeeDistributor.FeeDistribution({swapFee: 1_00, referrer: 0, protocol: 30_00, active: true});

        IPositionManager.ConstructorParams memory params = IPositionManager.ConstructorParams({
            nativeToken: address(whype),
            poolManager: poolManager,
            feeDistribution: dist,
            initialPrice: initialPrice,
            protocolOwner: address(this),
            protocolFeeRecipient: protocolWallet,
            flayGovernance: address(this),
            feeEscrow: address(feeEscrow),
            feeExemptions: feeExemptions,
            actionManager: actionManager,
            bidWall: bidWall,
            internalSwapPool: isp,
            oracle: oracle
        });
        deployCodeTo('PositionManager.sol:PositionManager', abi.encode(params), PM_ADDRESS);
        pm = PositionManager(PM_ADDRESS);

        flaunch.initialize(pm, address(new MemecoinTreasury()));
        pm.setFlaunch(address(flaunch));

        isp.grantRole(ProtocolRoles.POSITION_MANAGER, PM_ADDRESS);
        oracle.grantRole(oracle.ORACLE_CONSUMER(), PM_ADDRESS);

        feeCalc = new ZephyrFeeCalculator(PM_ADDRESS, address(whype));
        pm.setFeeCalculator(feeCalc);

        vault = new ZephyrVault(address(poolManager), PM_ADDRESS, address(whype), address(feeCalc), address(feeEscrow), address(this));
        vault.setKeeper(keeper, true);
        pm.setVault(address(vault));

        router = new ZephyrRouter(address(poolManager), PM_ADDRESS, address(whype));

        // Buybacks pay no swap fee
        feeExemptions.setFeeExemption(address(vault), 0);

        pm.notifier().subscribe(address(indexer), '');
        indexer.setNotifierFlaunch(address(pm.notifier()), address(flaunch));
        indexer.addVerifiedFlaunch(address(flaunch));

        vm.deal(alice, 10_000 ether);
        vm.deal(bob, 10_000 ether);
        vm.deal(creator, 100 ether);
    }

    /// ---------------------------------------------------------------- helpers

    function _launch(
        uint24 _swapFee,
        uint24 _snipeFee,
        uint32 _snipeDuration,
        uint16 _creatorShare, // of the 70% creator side
        uint16 _holderShareOfRest, // of what is left after the creator
        uint _premine,
        uint _flaunchAt
    ) internal returns (address token_) {
        bytes memory feeParams = abi.encode(
            ZephyrFeeCalculator.LaunchFeeParams({
                swapFee: _swapFee,
                snipeFee: _snipeFee,
                snipeDuration: _snipeDuration,
                holderShare: _holderShareOfRest
            })
        );

        vm.prank(creator);
        token_ = pm.flaunch{value: 50 ether}(
            IPositionManager.FlaunchParams({
                name: 'Gale',
                symbol: 'GALE',
                tokenUri: 'ipfs://gale',
                premineAmount: _premine,
                creator: creator,
                creatorFeeAllocation: _creatorShare,
                flaunchAt: _flaunchAt,
                initialPriceParams: abi.encode(uint(0)),
                feeCalculatorParams: feeParams
            })
        );
    }

    function _buy(address _who, address _token, uint _hypeIn) internal returns (uint tokensOut_) {
        PoolKey memory key = pm.poolKey(_token);
        bool nativeIsZero = Currency.unwrap(key.currency0) == address(whype);

        vm.startPrank(_who);
        whype.deposit{value: _hypeIn}();
        whype.approve(address(poolSwap), type(uint).max);
        uint before = IERC20(_token).balanceOf(_who);
        poolSwap.swap(
            key,
            SwapParams({
                zeroForOne: nativeIsZero,
                amountSpecified: -int(_hypeIn),
                sqrtPriceLimitX96: nativeIsZero ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            })
        );
        tokensOut_ = IERC20(_token).balanceOf(_who) - before;
        vm.stopPrank();
    }

    function _sell(address _who, address _token, uint _tokensIn) internal returns (uint hypeOut_) {
        PoolKey memory key = pm.poolKey(_token);
        bool nativeIsZero = Currency.unwrap(key.currency0) == address(whype);

        vm.startPrank(_who);
        IERC20(_token).approve(address(poolSwap), type(uint).max);
        uint before = whype.balanceOf(_who);
        poolSwap.swap(
            key,
            SwapParams({
                zeroForOne: !nativeIsZero,
                amountSpecified: -int(_tokensIn),
                sqrtPriceLimitX96: !nativeIsZero ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            })
        );
        hypeOut_ = whype.balanceOf(_who) - before;
        vm.stopPrank();
    }

    function _poolId(address _token) internal view returns (PoolId) {
        return pm.poolKey(_token).toId();
    }

    /// ---------------------------------------------------------------- launch

    function test_LaunchPutsWholeSupplyInPoolAtFortyHypeMarketCap() public {
        address token = _launch(2_00, 0, 0, 50_00, 50_00, 0, 0);

        assertEq(IERC20(token).totalSupply(), 1_000_000_000 ether, 'supply is 1B');
        assertEq(IERC20(token).balanceOf(creator), 0, 'nothing held back for the creator');
        // Liquidity math rounds down, leaving a few wei of dust with the hook
        assertApproxEqAbs(IERC20(token).balanceOf(address(poolManager)), TokenSupply.INITIAL_SUPPLY, 1e6, 'whole supply in the pool');
        assertEq(flaunch.ownerOf(flaunch.tokenId(token)), creator, 'creator holds the creator NFT');
        assertEq(pm.getFlaunchingMarketCap(abi.encode(uint(0))), 40 ether, 'opens at 40 HYPE');

        // Unused HYPE sent with the launch is refunded (no launch fee beyond gas)
        assertEq(creator.balance, 100 ether, 'full refund without a dev buy');
    }

    function test_DevBuyIsDeliveredAndExcessRefunded() public {
        uint premine = 10_000_000 ether; // 1% of supply
        address token = _launch(2_00, 0, 0, 50_00, 50_00, premine, 0);

        assertEq(IERC20(token).balanceOf(creator), premine, 'creator received the dev buy');
        uint spent = 100 ether - creator.balance;
        // ~1% of supply at a 40 HYPE cap is a little over 0.4 HYPE
        assertGt(spent, 0.4 ether);
        assertLt(spent, 0.45 ether);
    }

    function test_ConstantProductCurve_HalfSupplyCostsAboutFortyHype() public {
        address token = _launch(1_00, 0, 0, 100_00, 0, 0, 0);
        uint got = _buy(alice, token, 40.4 ether); // 40 HYPE plus the 1% fee
        assertApproxEqRel(got, 500_000_000 ether, 0.02e18, 'about half the supply for 40 HYPE');
    }

    function test_FeeValidation() public {
        vm.expectRevert();
        _launch(50, 0, 0, 0, 0, 0, 0); // below 1%
        vm.expectRevert();
        _launch(6_00, 0, 0, 0, 0, 0, 0); // above 5%
        vm.expectRevert();
        _launch(2_00, 31_00, 600, 0, 0, 0, 0); // anti-snipe above 30%
        vm.expectRevert();
        _launch(2_00, 20_00, 16 minutes, 0, 0, 0, 0); // window above 15 minutes
    }

    function test_SplitIsLockedAfterLaunch() public {
        address token = _launch(2_00, 0, 0, 50_00, 50_00, 0, 0);
        vm.prank(creator);
        vm.expectRevert(FeeDistributor.FeeSplitLocked.selector);
        pm.setCreatorFeeAllocation(token, 100_00);
    }

    function test_ScheduledOpeningBlocksTradingUntilOpen() public {
        address token = _launch(2_00, 0, 0, 50_00, 50_00, 0, block.timestamp + 1 days);

        PoolKey memory key = pm.poolKey(token);
        bool nativeIsZero = Currency.unwrap(key.currency0) == address(whype);
        vm.startPrank(alice);
        whype.deposit{value: 1 ether}();
        whype.approve(address(poolSwap), type(uint).max);
        vm.expectRevert();
        poolSwap.swap(
            key,
            SwapParams({
                zeroForOne: nativeIsZero,
                amountSpecified: -1 ether,
                sqrtPriceLimitX96: nativeIsZero ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            })
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);
        assertGt(_buy(alice, token, 1 ether), 0, 'trades once open');
    }

    /// ---------------------------------------------------------------- fees

    function test_AntiSnipeFeeDecaysToSwapFeeOnBuysOnly() public {
        address token = _launch(2_00, 30_00, 10 minutes, 50_00, 50_00, 0, 0);
        PoolId id = _poolId(token);

        assertEq(feeCalc.currentSwapFee(id, true), 30_00, 'buys start at 30%');
        assertEq(feeCalc.currentSwapFee(id, false), 2_00, 'sells pay the swap fee');

        vm.warp(block.timestamp + 5 minutes);
        assertEq(feeCalc.currentSwapFee(id, true), 16_00, 'halfway is 16%');

        vm.warp(block.timestamp + 5 minutes);
        assertEq(feeCalc.currentSwapFee(id, true), 2_00, 'back to the swap fee');
    }

    function test_FeesSplitThirtyPercentProtocolThenCreatorBuybackHolders() public {
        // 3% fee. Creator side: 50% creator, then the rest split 50/50 buyback/holders.
        address token = _launch(3_00, 0, 0, 50_00, 50_00, 0, 0);
        PoolId id = _poolId(token);

        // A series of buys generates fees in HYPE
        for (uint i; i < 10; ++i) {
            _buy(alice, token, 1 ether);
        }

        uint protocolEarned = feeEscrow.balances(protocolWallet);
        uint creatorEarned = feeEscrow.balances(creator);
        (uint128 buyback, uint128 holders,) = vault.balances(id);
        uint total = protocolEarned + creatorEarned + buyback + holders;

        assertGt(total, 0, 'fees distributed');
        // Buy fees are taken in the token and converted to HYPE as the next trade fills against
        // them, so after 10 buys about 9 buys' worth (3% of 9 HYPE) has been distributed.
        assertApproxEqRel(total, 0.27 ether, 0.02e18, 'fees are ~3% of converted volume');

        assertApproxEqRel(protocolEarned, total * 30 / 100, 0.001e18, 'protocol 30%');
        assertApproxEqRel(creatorEarned, total * 35 / 100, 0.001e18, 'creator 35% (50% of 70%)');
        assertApproxEqRel(uint(buyback), total * 175 / 1000, 0.001e18, 'buyback 17.5%');
        assertApproxEqRel(uint(holders), total * 175 / 1000, 0.001e18, 'holders 17.5%');

        // Creator and protocol can claim as native HYPE
        uint before = creator.balance;
        vm.prank(creator);
        feeEscrow.withdrawFees(creator, true);
        assertEq(creator.balance - before, creatorEarned, 'creator claims HYPE');

        before = protocolWallet.balance;
        vm.prank(protocolWallet);
        feeEscrow.withdrawFees(protocolWallet, true);
        assertEq(protocolWallet.balance - before, protocolEarned, 'protocol wallet claims HYPE');
    }

    function test_SellFeesAreConvertedAndDistributed() public {
        address token = _launch(5_00, 0, 0, 100_00, 0, 0, 0);
        uint got = _buy(alice, token, 20 ether);
        _sell(alice, token, got / 2); // fee taken in the token, held by the internal swap pool
        // Subsequent buys fill against the held token fees, converting them to HYPE
        for (uint i; i < 5; ++i) {
            _buy(bob, token, 1 ether);
        }
        assertGt(feeEscrow.balances(creator), 0, 'creator paid');
        assertGt(feeEscrow.balances(protocolWallet), 0, 'protocol paid');
    }

    /// ---------------------------------------------------------------- vault

    function test_BuybackBuysAndBurns() public {
        address token = _launch(5_00, 0, 0, 0, 0, 0, 0); // everything on the creator side to buyback
        for (uint i; i < 20; ++i) {
            _buy(alice, token, 1 ether);
        }
        PoolId id = _poolId(token);
        (uint128 buyback,,) = vault.balances(id);
        assertGt(buyback, vault.threshold());

        uint supplyBefore = IERC20(token).totalSupply();

        vm.prank(alice);
        vm.expectRevert(ZephyrVault.CallerIsNotKeeper.selector);
        vault.buyback(token, 0);

        vm.prank(keeper);
        uint burned = vault.buyback(token, 1);

        assertGt(burned, 0);
        assertEq(IERC20(token).totalSupply(), supplyBefore - burned, 'supply only falls');
        // The buyback's own trade converts held token fees, which refill the bucket a little
        (uint128 after_,,) = vault.balances(id);
        assertLt(after_, buyback / 2, 'bucket spent');
        assertEq(IERC20(token).balanceOf(address(vault)), 0, 'vault keeps no tokens');
    }

    function test_BuybackRespectsMinimumOutput() public {
        address token = _launch(5_00, 0, 0, 0, 0, 0, 0);
        for (uint i; i < 20; ++i) {
            _buy(alice, token, 1 ether);
        }
        vm.prank(keeper);
        vm.expectRevert();
        vault.buyback(token, type(uint).max);
    }

    function test_HolderRewardsPayHypeAndEscrowForRejectingContracts() public {
        address token = _launch(5_00, 0, 0, 0, 100_00, 0, 0); // everything on the creator side to holders
        for (uint i; i < 20; ++i) {
            _buy(alice, token, 1 ether);
        }
        PoolId id = _poolId(token);
        (, uint128 holders,) = vault.balances(id);
        assertGt(holders, vault.threshold());

        RejectsHYPE rejecter = new RejectsHYPE();
        address[] memory to = new address[](2);
        uint[] memory amounts = new uint[](2);
        to[0] = bob;
        to[1] = address(rejecter);
        amounts[0] = uint(holders) * 3 / 4;
        amounts[1] = uint(holders) / 4;

        uint bobBefore = bob.balance;
        vm.prank(keeper);
        vault.distribute(token, to, amounts);

        assertEq(bob.balance - bobBefore, amounts[0], 'bob paid in HYPE');
        assertEq(feeEscrow.balances(address(rejecter)), amounts[1], 'rejecting contract credited in escrow');

        // A second round needs both new funds and 10 minutes
        for (uint i; i < 20; ++i) {
            _buy(alice, token, 1 ether);
        }
        (, holders,) = vault.balances(id);
        amounts = new uint[](1);
        to = new address[](1);
        to[0] = bob;
        amounts[0] = holders;
        vm.prank(keeper);
        vm.expectRevert();
        vault.distribute(token, to, amounts);

        vm.warp(block.timestamp + 10 minutes);
        vm.prank(keeper);
        vault.distribute(token, to, amounts);
    }

    function test_DistributeCannotExceedHolderBalance() public {
        address token = _launch(5_00, 0, 0, 0, 100_00, 0, 0);
        for (uint i; i < 20; ++i) {
            _buy(alice, token, 1 ether);
        }
        (, uint128 holders,) = vault.balances(_poolId(token));
        address[] memory to = new address[](1);
        uint[] memory amounts = new uint[](1);
        to[0] = bob;
        amounts[0] = uint(holders) + 1;
        vm.prank(keeper);
        vm.expectRevert();
        vault.distribute(token, to, amounts);
    }

    function test_OnlyPositionManagerCanDeposit() public {
        address token = _launch(2_00, 0, 0, 0, 0, 0, 0);
        PoolKey memory key = pm.poolKey(token);
        vm.expectRevert(ZephyrVault.CallerIsNotPositionManager.selector);
        vault.deposit(key, 1 ether);
    }

    function test_RoundTripTradingDoesNotLeakValue() public {
        address token = _launch(1_00, 0, 0, 50_00, 50_00, 0, 0);
        uint got = _buy(alice, token, 5 ether);
        uint back = _sell(alice, token, got);
        // Two 1% fees plus rounding: alice gets back just under 98% of what she paid
        assertApproxEqRel(back, 4.9 ether, 0.01e18);
        assertLt(back, 5 ether);
    }

    /// ---------------------------------------------------------------- router

    function test_RouterBuysAndSellsWithPlainHype() public {
        address token = _launch(2_00, 0, 0, 50_00, 50_00, 0, 0);

        uint hypeBefore = alice.balance;
        vm.prank(alice);
        uint got = router.buy{value: 3 ether}(token, 1, alice, block.timestamp);
        assertGt(got, 0);
        assertEq(IERC20(token).balanceOf(alice), got, 'tokens delivered');
        assertEq(hypeBefore - alice.balance, 3 ether, 'paid in HYPE');

        vm.startPrank(alice);
        IERC20(token).approve(address(router), type(uint).max);
        uint back = router.sell(token, got, 1, payable(alice), block.timestamp);
        vm.stopPrank();

        assertEq(IERC20(token).balanceOf(alice), 0, 'tokens sold');
        assertApproxEqRel(back, 3 ether * 96 / 100, 0.01e18, 'about 96% back after two 2% fees');
        assertEq(whype.balanceOf(address(router)), 0, 'router holds no wrapped HYPE');
        assertEq(address(router).balance, 0, 'router holds no HYPE');
        assertEq(IERC20(token).balanceOf(address(router)), 0, 'router holds no tokens');
    }

    function test_RouterEnforcesSlippageAndDeadline() public {
        address token = _launch(2_00, 0, 0, 50_00, 50_00, 0, 0);

        vm.prank(alice);
        vm.expectRevert();
        router.buy{value: 1 ether}(token, type(uint).max, alice, block.timestamp);

        vm.prank(alice);
        vm.expectRevert(ZephyrRouter.DeadlinePassed.selector);
        router.buy{value: 1 ether}(token, 1, alice, block.timestamp - 1);

        vm.prank(alice);
        vm.expectRevert();
        router.buy{value: 1 ether}(address(0xBEEF), 1, alice, block.timestamp);
    }

    function test_RouterTradesStillPayFees() public {
        address token = _launch(5_00, 0, 0, 100_00, 0, 0, 0);
        for (uint i; i < 5; ++i) {
            vm.prank(alice);
            router.buy{value: 1 ether}(token, 1, alice, block.timestamp);
        }
        assertGt(feeEscrow.balances(creator), 0, 'creator earns from router trades');
        assertGt(feeEscrow.balances(protocolWallet), 0, 'protocol earns from router trades');
    }
}

contract ZephyrTestNativeZero is ZephyrTestBase {
    function _whypeAddress() internal pure override returns (address) {
        return address(0x0000000000000000000000000000000000000123);
    }
}

contract ZephyrTestNativeOne is ZephyrTestBase {
    function _whypeAddress() internal pure override returns (address) {
        return address(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
    }
}
