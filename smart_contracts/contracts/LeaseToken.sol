// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract LeaseToken is Initializable, ERC20Upgradeable, OwnableUpgradeable {
    address public navOracle;
    address public assetNFT;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address treasury,
        address _navOracle,
        address _assetNFT
    ) public initializer {
        __ERC20_init("FARMToken", "FARM");
        __Ownable_init(msg.sender);

        navOracle = _navOracle;
        assetNFT = _assetNFT;

        // Mint 100% of the supply to the treasury on initialization
        _mint(treasury, 1_000_000_000 * 10 ** decimals()); // 1 Billion FARMTokens
    }
}
