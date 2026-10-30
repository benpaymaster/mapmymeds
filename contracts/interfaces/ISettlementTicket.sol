// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/// @title ISettlementTicket
/// @notice Hooks the matching engine uses to issue and close settlement tickets.
/// @dev The token ID always equals the listing ID, so a listing can never produce two tickets.
interface ISettlementTicket {
    /// @notice Mints ticket `listingId` to the supplying pharmacy, recording who receives the stock.
    function mint(address supplier, uint256 listingId, address recipient) external;

    /// @notice Burns a ticket once delivery is confirmed.
    function burn(uint256 tokenId) external;

    /// @notice Pharmacy due to receive the stock for `tokenId`.
    function recipientOf(uint256 tokenId) external view returns (address);
}
