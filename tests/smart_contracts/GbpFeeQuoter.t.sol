// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Test} from "forge-std/Test.sol";
import {GbpFeeQuoter} from "../../contracts/GbpFeeQuoter.sol";
import {AggregatorV3Interface} from "../../contracts/interfaces/AggregatorV3Interface.sol";
import {MockV3Aggregator} from "./utils/MockV3Aggregator.sol";

contract GbpFeeQuoterTest is Test {
    MockV3Aggregator internal ethUsd;
    MockV3Aggregator internal gbpUsd;
    MockV3Aggregator internal sequencer;
    GbpFeeQuoter internal quoter;

    uint256 internal constant ETH_HEARTBEAT = 20 minutes;
    uint256 internal constant GBP_HEARTBEAT = 1 days;
    uint256 internal constant TWENTY_POUNDS = 2000;

    function setUp() public {
        vm.warp(1_790_000_000);
        ethUsd = new MockV3Aggregator(8, 3000e8); // $3,000 per ETH
        gbpUsd = new MockV3Aggregator(8, 1.27e8); // $1.27 per £
        sequencer = new MockV3Aggregator(0, 0); // 0 = up
        sequencer.set(0, block.timestamp - 2 hours, block.timestamp - 2 hours); // up for 2 hours
        quoter = new GbpFeeQuoter(
            AggregatorV3Interface(address(ethUsd)),
            AggregatorV3Interface(address(gbpUsd)),
            AggregatorV3Interface(address(sequencer)),
            ETH_HEARTBEAT,
            GBP_HEARTBEAT
        );
    }

    function test_quote_twentyPounds() public view {
        // £20 = $25.40 = 25.40 / 3000 ETH = 0.0084666... ETH, rounded up to the next wei
        assertEq(quoter.quoteWei(TWENTY_POUNDS), 8_466_666_666_666_667);
    }

    function test_quote_zeroIsFree() public view {
        assertEq(quoter.quoteWei(0), 0);
    }

    /// The protocol is never undercharged, and never overcharges by more than 1 wei.
    function testFuzz_quoteRoundsUpByAtMostOneWei(uint256 pence, uint256 ethPrice, uint256 gbpPrice) public {
        pence = bound(pence, 1, 1_000_000_00); // up to £1m
        ethPrice = bound(ethPrice, 1e8, 1_000_000e8);
        gbpPrice = bound(gbpPrice, 0.5e8, 3e8);
        // forge-lint: disable-next-line(unsafe-typecast) -- bounded above
        ethUsd.set(int256(ethPrice), block.timestamp, block.timestamp);
        // forge-lint: disable-next-line(unsafe-typecast) -- bounded above
        gbpUsd.set(int256(gbpPrice), block.timestamp, block.timestamp);

        uint256 wei_ = quoter.quoteWei(pence);
        uint256 owedUsd = pence * 1e16 * gbpPrice; // pounds(18dp) * gbpUsd(8dp)
        assertGe(wei_ * ethPrice, owedUsd); // paid value >= owed value
        assertLt((wei_ - 1) * ethPrice, owedUsd); // one wei less would underpay
    }

    function test_differentFeedDecimalsAreNormalised() public {
        MockV3Aggregator eth18 = new MockV3Aggregator(18, 3000e18);
        GbpFeeQuoter q = new GbpFeeQuoter(
            AggregatorV3Interface(address(eth18)),
            AggregatorV3Interface(address(gbpUsd)),
            AggregatorV3Interface(address(sequencer)),
            ETH_HEARTBEAT,
            GBP_HEARTBEAT
        );
        assertEq(q.quoteWei(TWENTY_POUNDS), quoter.quoteWei(TWENTY_POUNDS));
    }

    // ------------------------------------------------------------------ oracle failure modes

    function test_revert_staleEthPrice() public {
        uint256 old = block.timestamp - ETH_HEARTBEAT - 1;
        ethUsd.set(3000e8, old, old);
        vm.expectRevert(abi.encodeWithSelector(GbpFeeQuoter.StalePrice.selector, address(ethUsd), old));
        quoter.quoteWei(TWENTY_POUNDS);
    }

    function test_revert_staleGbpPrice() public {
        uint256 old = block.timestamp - GBP_HEARTBEAT - 1;
        gbpUsd.set(1.27e8, old, old);
        vm.expectRevert(abi.encodeWithSelector(GbpFeeQuoter.StalePrice.selector, address(gbpUsd), old));
        quoter.quoteWei(TWENTY_POUNDS);
    }

    function test_revert_priceFromTheFuture() public {
        ethUsd.set(3000e8, block.timestamp, block.timestamp + 1);
        vm.expectRevert(abi.encodeWithSelector(GbpFeeQuoter.StalePrice.selector, address(ethUsd), block.timestamp + 1));
        quoter.quoteWei(TWENTY_POUNDS);
    }

    function test_revert_incompleteRound() public {
        ethUsd.set(3000e8, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(GbpFeeQuoter.StalePrice.selector, address(ethUsd), 0));
        quoter.quoteWei(TWENTY_POUNDS);
    }

    function testFuzz_revert_nonPositivePrice(int256 answer) public {
        answer = bound(answer, type(int256).min, 0);
        ethUsd.set(answer, block.timestamp, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(GbpFeeQuoter.InvalidPrice.selector, address(ethUsd), answer));
        quoter.quoteWei(TWENTY_POUNDS);
    }

    function test_revert_sequencerDown() public {
        sequencer.set(1, block.timestamp - 10 minutes, block.timestamp);
        vm.expectRevert(GbpFeeQuoter.SequencerDown.selector);
        quoter.quoteWei(TWENTY_POUNDS);
    }

    function test_revert_gracePeriodAfterRestart() public {
        sequencer.set(0, block.timestamp - 30 minutes, block.timestamp - 30 minutes);
        vm.expectRevert(abi.encodeWithSelector(GbpFeeQuoter.GracePeriodNotOver.selector, 30 minutes));
        quoter.quoteWei(TWENTY_POUNDS);
    }

    function test_revert_uninitialisedSequencerFeed() public {
        sequencer.set(0, 0, 0);
        vm.expectRevert(GbpFeeQuoter.SequencerDown.selector);
        quoter.quoteWei(TWENTY_POUNDS);
    }

    function test_revert_unsupportedDecimals() public {
        MockV3Aggregator weird = new MockV3Aggregator(19, 3000e19);
        GbpFeeQuoter q = new GbpFeeQuoter(
            AggregatorV3Interface(address(weird)),
            AggregatorV3Interface(address(gbpUsd)),
            AggregatorV3Interface(address(0)),
            ETH_HEARTBEAT,
            GBP_HEARTBEAT
        );
        vm.expectRevert(abi.encodeWithSelector(GbpFeeQuoter.UnsupportedDecimals.selector, address(weird), 19));
        q.quoteWei(TWENTY_POUNDS);
    }

    function test_noSequencerFeedSkipsCheck() public {
        GbpFeeQuoter q = new GbpFeeQuoter(
            AggregatorV3Interface(address(ethUsd)),
            AggregatorV3Interface(address(gbpUsd)),
            AggregatorV3Interface(address(0)),
            ETH_HEARTBEAT,
            GBP_HEARTBEAT
        );
        sequencer.set(1, block.timestamp, block.timestamp); // ignored
        assertEq(q.quoteWei(TWENTY_POUNDS), 8_466_666_666_666_667);
    }

    function test_revert_zeroFeedAddress() public {
        vm.expectRevert(GbpFeeQuoter.ZeroAddress.selector);
        new GbpFeeQuoter(
            AggregatorV3Interface(address(0)),
            AggregatorV3Interface(address(gbpUsd)),
            AggregatorV3Interface(address(0)),
            ETH_HEARTBEAT,
            GBP_HEARTBEAT
        );
    }
}
