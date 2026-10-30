// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IFeeQuoter} from "./interfaces/IFeeQuoter.sol";

/// @title GbpFeeQuoter
/// @author Adegbenga (Ben) Ogungbeje
/// @notice Converts a fee in pounds sterling into ETH using Chainlink Data Feeds on Base.
/// @dev wei = pence * 1e16 * (GBP/USD) / (ETH/USD), rounded up so the protocol is never undercharged.
///      Both feeds are normalised to 18 decimals first, so feeds with different decimals cannot skew the result.
///
///      Oracle safety checks, each a known class of real-world exploit:
///      - L2 sequencer down: on Base, if the sequencer stops, prices freeze while some users can still post
///        transactions via L1. Chainlink's Sequencer Uptime Feed reports this; we refuse to quote while it is down
///        and for a grace period after it restarts, so stale prices cannot be used.
///      - Stale price: `updatedAt` older than the feed's heartbeat means the feed has stopped updating.
///      - Invalid answer: zero or negative prices, or an unfinished round (`updatedAt == 0`).
///      Heartbeats differ per feed and network; check https://data.chain.link before deploying.
contract GbpFeeQuoter is IFeeQuoter {
    uint256 public constant GRACE_PERIOD = 1 hours;

    AggregatorV3Interface public immutable ethUsdFeed;
    AggregatorV3Interface public immutable gbpUsdFeed;
    /// @notice Zero address disables the sequencer check (for L1 or local testing only).
    AggregatorV3Interface public immutable sequencerUptimeFeed;
    uint256 public immutable ethUsdHeartbeat;
    uint256 public immutable gbpUsdHeartbeat;

    error ZeroAddress();
    error SequencerDown();
    error GracePeriodNotOver(uint256 secondsSinceRestart);
    error StalePrice(address feed, uint256 updatedAt);
    error InvalidPrice(address feed, int256 answer);
    error UnsupportedDecimals(address feed, uint8 decimals);

    constructor(
        AggregatorV3Interface ethUsdFeed_,
        AggregatorV3Interface gbpUsdFeed_,
        AggregatorV3Interface sequencerUptimeFeed_,
        uint256 ethUsdHeartbeat_,
        uint256 gbpUsdHeartbeat_
    ) {
        if (address(ethUsdFeed_) == address(0) || address(gbpUsdFeed_) == address(0)) {
            revert ZeroAddress();
        }
        ethUsdFeed = ethUsdFeed_;
        gbpUsdFeed = gbpUsdFeed_;
        sequencerUptimeFeed = sequencerUptimeFeed_;
        ethUsdHeartbeat = ethUsdHeartbeat_;
        gbpUsdHeartbeat = gbpUsdHeartbeat_;
    }

    /// @notice ETH (in wei) needed to pay `pence`, at current Chainlink prices.
    function quoteWei(uint256 pence) external view returns (uint256) {
        if (pence == 0) return 0;
        _checkSequencer();
        uint256 ethUsd = _price(ethUsdFeed, ethUsdHeartbeat); // 18 decimals
        uint256 gbpUsd = _price(gbpUsdFeed, gbpUsdHeartbeat); // 18 decimals
        // pence * 1e16 = pounds in 18 decimals; * gbpUsd / 1e18 = USD in 18 decimals; / ethUsd * 1e18 = wei
        return Math.mulDiv(pence * 1e16, gbpUsd, ethUsd, Math.Rounding.Ceil);
    }

    function _checkSequencer() internal view {
        if (address(sequencerUptimeFeed) == address(0)) return;
        // slither-disable-next-line unused-return -- roundId/answeredInRound are deprecated by Chainlink
        (, int256 answer, uint256 startedAt,,) = sequencerUptimeFeed.latestRoundData();
        if (answer != 0) revert SequencerDown(); // 0 = up, 1 = down
        // startedAt == 0 means the feed has not been initialised on this network yet: treat as unsafe.
        if (startedAt == 0) revert SequencerDown();
        if (startedAt > block.timestamp) revert SequencerDown();
        uint256 sinceRestart = block.timestamp - startedAt;
        if (sinceRestart <= GRACE_PERIOD) revert GracePeriodNotOver(sinceRestart);
    }

    function _price(AggregatorV3Interface feed, uint256 heartbeat) internal view returns (uint256) {
        // slither-disable-next-line unused-return -- roundId/answeredInRound are deprecated by Chainlink
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (answer <= 0) revert InvalidPrice(address(feed), answer);
        if (updatedAt == 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > heartbeat) {
            revert StalePrice(address(feed), updatedAt);
        }
        uint8 dec = feed.decimals();
        if (dec > 18) revert UnsupportedDecimals(address(feed), dec);
        // Normalise to 18 decimals. Chainlink USD pairs use 8; this also handles any feed up to 18.
        // forge-lint: disable-next-line(unsafe-typecast) -- answer > 0 is checked above
        return uint256(answer) * 10 ** (18 - dec);
    }
}
