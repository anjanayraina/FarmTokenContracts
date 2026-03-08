// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/AssetNFT.sol";
import "../contracts/NAVOracle.sol";
import "../contracts/RightsToken.sol";
import "../contracts/PrivateStaking.sol";
import "../contracts/RevenueDistributor.sol";
import "./MockUSDC.sol";

contract FractionalRWATest is Test {
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

    function setUp() public {
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

        // Pre-mint some USDC to admin
        usdc.mint(admin, 1000000 * 10 ** 6);

        vm.stopPrank();

        // Ensure user1 has some USDC or ETH if needed
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
    }

    // 1. AssetNFT tests
    function testAssetNFTMinting() public {
        vm.prank(admin);
        assetNFT.mintToTreasury(user1, 1, "ipfs://test");

        assertEq(assetNFT.ownerOf(1), user1);
        assertEq(assetNFT.tokenURI(1), "ipfs://test");
    }

    function testAssetNFTNonAdminMintFails() public {
        vm.prank(user1);

        vm.expectRevert();
        assetNFT.mintToTreasury(user1, 1, "ipfs://test");
    }

    // 2. NAVOracle tests
    function testNAVOracleUpdate() public {
        vm.startPrank(updater);

        uint256 initPrice = 1000 * 10 ** 18;
        navOracle.updateNAV(1, initPrice);
        assertEq(navOracle.getPrice(1), initPrice);

        uint256 maxUp = 1100 * 10 ** 18;
        navOracle.updateNAV(1, maxUp);
        assertEq(navOracle.getPrice(1), maxUp);

        vm.stopPrank();
    }

    function testNAVOracleFailsDeltaBoundaries() public {
        vm.startPrank(updater);

        navOracle.updateNAV(1, 1000 * 10 ** 18);

        vm.expectRevert("NAVOracle: Price delta exceeds limit");
        navOracle.updateNAV(1, 1101 * 10 ** 18);

        vm.expectRevert("NAVOracle: Price delta exceeds limit");
        navOracle.updateNAV(1, 899 * 10 ** 18);

        vm.stopPrank();
    }

    function testNAVOracleStalePrice() public {
        vm.prank(updater);
        navOracle.updateNAV(1, 1000 * 10 ** 18);

        // Advance block timestamp
        vm.warp(block.timestamp + 3601);

        assertTrue(navOracle.isStale(1));

        vm.expectRevert("NAVOracle: Price is stale");
        navOracle.getPrice(1);
    }

    // 3. PrivateStaking tests
    function testStaking() public {
        uint256 tokenId = 1;
        uint256 price = 500 * 10 ** 18;

        // Mint NFT
        vm.prank(admin);
        assetNFT.mintToTreasury(admin, tokenId, "uri");

        // Set Price
        vm.prank(updater);
        navOracle.updateNAV(tokenId, price);

        vm.startPrank(admin);
        assetNFT.approve(address(privateStaking), tokenId);

        // Stake
        privateStaking.stakeNFT(tokenId);

        // Assert NFT owner is vault
        assertEq(assetNFT.ownerOf(tokenId), address(privateStaking));

        // Assert Tokens minted to admin
        assertEq(rightsToken.balanceOf(admin), price);

        vm.stopPrank();
    }

    function testUnstaking() public {
        uint256 tokenId = 1;
        uint256 price = 500 * 10 ** 18;

        vm.prank(admin);
        assetNFT.mintToTreasury(admin, tokenId, "uri");

        vm.prank(updater);
        navOracle.updateNAV(tokenId, price);

        vm.startPrank(admin);
        assetNFT.approve(address(privateStaking), tokenId);
        privateStaking.stakeNFT(tokenId);

        // Try unstake
        privateStaking.unstakeNFT(tokenId);

        // Assets returned to admin, tokens burned
        assertEq(assetNFT.ownerOf(tokenId), admin);
        assertEq(rightsToken.balanceOf(admin), 0);

        vm.stopPrank();
    }

    function testStakingPreventsStaleOracle() public {
        uint256 tokenId = 1;

        vm.prank(admin);
        assetNFT.mintToTreasury(admin, tokenId, "uri");

        vm.prank(updater);
        navOracle.updateNAV(tokenId, 500 * 10 ** 18);

        // Advance block timestamp past staleness
        vm.warp(block.timestamp + 3601);

        vm.startPrank(admin);
        assetNFT.approve(address(privateStaking), tokenId);

        vm.expectRevert("NAVOracle: Price is stale");
        privateStaking.stakeNFT(tokenId);
        vm.stopPrank();
    }

    // 4. RevenueDistributor tests
    function testRevenueDistributorPayouts() public {
        uint256 stakeA = 300 * 10 ** 18; // 30%
        uint256 stakeB = 700 * 10 ** 18; // 70%

        // Admin needs MINTER_ROLE on RightsToken to mint to users directly (mocking market purchase)
        vm.startPrank(admin);
        rightsToken.grantRole(MINTER_ROLE, admin);
        rightsToken.mint(user1, stakeA);
        rightsToken.mint(user2, stakeB);
        vm.stopPrank();

        // Users stake their RightsToken
        vm.startPrank(user1);
        rightsToken.approve(address(revenueDistributor), stakeA);
        revenueDistributor.stake(stakeA);
        vm.stopPrank();

        vm.startPrank(user2);
        rightsToken.approve(address(revenueDistributor), stakeB);
        revenueDistributor.stake(stakeB);
        vm.stopPrank();

        assertEq(revenueDistributor.totalStaked(), stakeA + stakeB);

        // Admin distributes 1000 USDC
        uint256 revenue = 1000 * 10 ** 6;
        vm.startPrank(admin);
        usdc.approve(address(revenueDistributor), revenue);
        revenueDistributor.depositRevenue(revenue);
        vm.stopPrank();

        // 3. User1 and User2 claim rewards
        vm.startPrank(user1);
        revenueDistributor.claim();
        assertEq(usdc.balanceOf(user1), 300 * 10 ** 6);
        vm.stopPrank();

        vm.startPrank(user2);
        revenueDistributor.claim();
        assertEq(usdc.balanceOf(user2), 700 * 10 ** 6);
        vm.stopPrank();
    }

    function testWithdrawFromRevenueDistributor() public {
        uint256 stakeA = 100 * 10 ** 18;

        vm.startPrank(admin);
        rightsToken.grantRole(MINTER_ROLE, admin);
        rightsToken.mint(user1, stakeA);
        vm.stopPrank();

        vm.startPrank(user1);
        rightsToken.approve(address(revenueDistributor), stakeA);
        revenueDistributor.stake(stakeA);

        assertEq(revenueDistributor.stakedBalances(user1), stakeA);

        revenueDistributor.withdraw(stakeA);
        assertEq(revenueDistributor.stakedBalances(user1), 0);
        assertEq(rightsToken.balanceOf(user1), stakeA);
        vm.stopPrank();
    }
}
