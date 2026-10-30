// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {AggregatorV3Interface} from "../../../contracts/interfaces/AggregatorV3Interface.sol";

/// @notice Fully controllable Chainlink feed for tests (price feeds and the sequencer uptime feed).
contract MockV3Aggregator is AggregatorV3Interface {
    uint8 public decimals;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;

    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        answer = answer_;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }

    function set(int256 answer_, uint256 startedAt_, uint256 updatedAt_) external {
        answer = answer_;
        startedAt = startedAt_;
        updatedAt = updatedAt_;
    }

    function description() external pure returns (string memory) {
        return "mock";
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, startedAt, updatedAt, 1);
    }
}
