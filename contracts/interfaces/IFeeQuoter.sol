// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/// @title IFeeQuoter
/// @notice Prices a sterling-denominated fee in wei. Implemented by GbpFeeQuoter using Chainlink feeds.
interface IFeeQuoter {
    function quoteWei(uint256 pence) external view returns (uint256);
}
