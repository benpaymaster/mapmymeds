// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IPharmacyRegistry} from "./interfaces/IPharmacyRegistry.sol";
import {ISettlementTicket} from "./interfaces/ISettlementTicket.sol";

/// @title SettlementTicket
/// @author Adegbenga (Ben) Ogungbeje
/// @notice ERC-721 ticket representing one pharmacy-to-pharmacy stock transfer that is due.
///         Held by the supplying pharmacy; burned when the receiving pharmacy confirms delivery.
/// @dev Replaces v1 `PrescriptionNFT`. Renamed because it never represented a patient prescription,
///      and no patient or medication data is stored here: only the listing ID and the recipient wallet.
///      - Token ID == listing ID, so double-issuing for one listing is impossible (ERC-721 forbids re-minting).
///      - Only the matching engine can mint or burn.
///      - Transfers (e.g. handing dispatch to another branch) are allowed only to verified pharmacies.
///      - The engine address can be set once, removing a standing admin power over issuance.
contract SettlementTicket is ISettlementTicket, ERC721, Ownable2Step {
    IPharmacyRegistry public immutable registry;

    /// @notice The only contract allowed to mint and burn. Set once after deployment.
    address public engine;

    /// @inheritdoc ISettlementTicket
    mapping(uint256 tokenId => address) public recipientOf;

    event EngineSet(address indexed engine);

    error ZeroAddress();
    error EngineAlreadySet();
    error NotEngine(address caller);
    error NotVerifiedPharmacy(address account);

    modifier onlyEngine() {
        _checkEngine();
        _;
    }

    function _checkEngine() internal view {
        if (msg.sender != engine) revert NotEngine(msg.sender);
    }

    constructor(address initialOwner, IPharmacyRegistry registry_)
        ERC721("MapMyMeds Settlement Ticket", "MMM-ST")
        Ownable(initialOwner)
    {
        if (address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
    }

    /// @notice One-time wiring to the matching engine.
    function setEngine(address engine_) external onlyOwner {
        if (engine_ == address(0)) revert ZeroAddress();
        if (engine != address(0)) revert EngineAlreadySet();
        engine = engine_;
        emit EngineSet(engine_);
    }

    /// @inheritdoc ISettlementTicket
    function mint(address supplier, uint256 listingId, address recipient) external onlyEngine {
        // Effects before the interaction: `_mint` (not `_safeMint`) avoids handing control to the supplier,
        // so there is no reentrancy path at all. Suppliers are EOAs or Safes, which accept ERC-721s.
        recipientOf[listingId] = recipient;
        _mint(supplier, listingId);
    }

    /// @inheritdoc ISettlementTicket
    function burn(uint256 tokenId) external onlyEngine {
        delete recipientOf[tokenId];
        _burn(tokenId);
    }

    /// @dev Central hook for every mint, transfer and burn in OpenZeppelin v5.
    ///      Ordinary transfers must land on a verified pharmacy. Mints are checked by the engine already.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to != address(0) && _ownerOf(tokenId) != address(0) && !registry.isVerifiedPharmacy(to)) {
            revert NotVerifiedPharmacy(to);
        }
        return super._update(to, tokenId, auth);
    }
}
