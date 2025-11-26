// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PrescriptionNFT is ERC721, Ownable {
    uint256 public nextTokenId;
    mapping(uint256 => string) public medication;
    mapping(uint256 => address) public pharmacy;

    constructor() ERC721("PrescriptionNFT", "PRX") {}

    function mint(
        address to,
        string memory _medication,
        address _pharmacy
    ) public onlyOwner {
        uint256 tokenId = nextTokenId;
        _safeMint(to, tokenId);
        medication[tokenId] = _medication;
        pharmacy[tokenId] = _pharmacy;
        nextTokenId++;
    }

    function getPrescription(
        uint256 tokenId
    ) public view returns (string memory, address) {
        require(_exists(tokenId), "Token does not exist");
        return (medication[tokenId], pharmacy[tokenId]);
    }
}
