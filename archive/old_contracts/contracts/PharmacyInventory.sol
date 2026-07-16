// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PharmacyInventory {
    struct Medication {
        string name;
        uint256 quantity;
        uint256 expiry;
    }

    mapping(address => mapping(string => Medication)) public inventory;
    event StockUpdated(
        address indexed pharmacy,
        string medication,
        uint256 quantity,
        uint256 expiry
    );
    event ExpiryAlert(
        address indexed pharmacy,
        string medication,
        uint256 expiry
    );

    function updateStock(
        string memory _name,
        uint256 _quantity,
        uint256 _expiry
    ) public {
        inventory[msg.sender][_name] = Medication(_name, _quantity, _expiry);
        emit StockUpdated(msg.sender, _name, _quantity, _expiry);
        if (_expiry < block.timestamp + 30 days) {
            emit ExpiryAlert(msg.sender, _name, _expiry);
        }
    }

    function getStock(
        address _pharmacy,
        string memory _name
    ) public view returns (Medication memory) {
        return inventory[_pharmacy][_name];
    }
}
