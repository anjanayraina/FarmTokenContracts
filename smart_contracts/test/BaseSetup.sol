// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/AssetNFT.sol";
import "../contracts/NAVOracle.sol";
import "../contracts/RightsToken.sol";
import "../contracts/PrivateStaking.sol";
import "../contracts/RevenueDistributor.sol";
import "./MockUSDC.sol";

abstract contract BaseSetup is Test {
    AssetNFT assetNFT;
    NAVOracle navOracle;
    RightsToken rightsToken;
    PrivateStaking privateStaking;
    RevenueDistributor revenueDistributor;
    MockUSDC usdc;

    address admin = address(0x111);
    address updater = address(0x222);
    address user1 = address(0x333);
    address user2 = address(0x444);

    bytes32 constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    function setUp() public virtual {
        vm.startPrank(admin);

        assetNFT = new AssetNFT();
        navOracle = new NAVOracle();
        rightsToken = new RightsToken();
        usdc = new MockUSDC();

        privateStaking = new PrivateStaking(
            address(assetNFT),
            address(navOracle),
            address(rightsToken)
        );

        revenueDistributor = new RevenueDistributor(
            address(rightsToken),
            address(usdc)
        );

        rightsToken.grantRole(MINTER_ROLE, address(privateStaking));
        navOracle.grantRole(UPDATER_ROLE, updater);

        // Pre-mint some USDC to admin for revenue distribution testing
        usdc.mint(admin, 10_000_000 * 10 ** 6);

        vm.stopPrank();

        // Ensure users have ETH if needed by the chains
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
    }
}
