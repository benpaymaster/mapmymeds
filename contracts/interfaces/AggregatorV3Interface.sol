// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/// @notice Chainlink Data Feeds read interface (identical to @chainlink/contracts AggregatorV3Interface).
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
