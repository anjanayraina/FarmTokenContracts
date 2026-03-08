// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/AssetNFT.sol";
import "../contracts/NAVOracle.sol";
import "../contracts/RightsToken.sol";
import "../contracts/PrivateStaking.sol";
import "../contracts/RevenueDistributor.sol";
import "./MockUSDC.sol";

/**
 * @title FractionalRWASetup
 * @dev Base setup contract for all RWA protocol tests.
 */
abstract contract FractionalRWASetup is Test {
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

/**
 * @title FractionalRWA_Unit_Test
 * @dev Granular unit tests for individual protocol components.
 */
contract FractionalRWA_Unit_Test is FractionalRWASetup {
    // --- AssetNFT Tests ---
    function test_Unit_AssetNFT_MintToTreasurySuccess() public {
        vm.prank(admin);
        assetNFT.mintToTreasury(admin, 1, "ipfs://nft-metadata");
        assertEq(assetNFT.ownerOf(1), admin);
        assertEq(assetNFT.tokenURI(1), "ipfs://nft-metadata");
    }

    function test_Unit_AssetNFT_MintToTreasuryRevertsIfNotAdmin() public {
        vm.prank(user1);
        vm.expectRevert();
        assetNFT.mintToTreasury(user1, 1, "ipfs://test");
    }

    // --- NAVOracle Tests ---
    function test_Unit_NAVOracle_UpdateNAVSuccess() public {
        vm.prank(updater);
        uint256 initPrice = 1000 * 10 ** 18;
        navOracle.updateNAV(1, initPrice);
        assertEq(navOracle.getPrice(1), initPrice);
    }

    function test_Unit_NAVOracle_UpdateNAVRevertsIfNotUpdater() public {
        vm.prank(user1);
        vm.expectRevert();
        navOracle.updateNAV(1, 1000 * 10 ** 18);
    }

    function test_Unit_NAVOracle_UpdateNAVRevertsIfDeltaExceeded() public {
        vm.startPrank(updater);
        navOracle.updateNAV(1, 1000 * 10 ** 18);

        // Max jump is 10%. 1101 should fail.
        vm.expectRevert("NAVOracle: Price delta exceeds limit");
        navOracle.updateNAV(1, 1101 * 10 ** 18);

        // Max drop is 10%. 899 should fail.
        vm.expectRevert("NAVOracle: Price delta exceeds limit");
        navOracle.updateNAV(1, 899 * 10 ** 18);
        vm.stopPrank();
    }

    function test_Unit_NAVOracle_IsStaleReturnsTrueAfterPeriod() public {
        vm.prank(updater);
        navOracle.updateNAV(1, 1000 * 10 ** 18);

        assertFalse(navOracle.isStale(1));

        // Advance block timestamp completely past the 1-hour 3600 limit
        vm.warp(block.timestamp + 3601);

        assertTrue(navOracle.isStale(1));
        vm.expectRevert("NAVOracle: Price is stale");
        navOracle.getPrice(1);
    }

    // --- RightsToken Tests ---
    function test_Unit_RightsToken_MintRevertsIfNotMinter() public {
        vm.prank(user1);
        vm.expectRevert();
        rightsToken.mint(user1, 100);
    }

    // --- PrivateStaking Tests ---
    function test_Unit_PrivateStaking_StakeRevertsIfOracleStale() public {
        vm.prank(admin);
        assetNFT.mintToTreasury(admin, 1, "uri");

        vm.prank(updater);
        navOracle.updateNAV(1, 1000 * 10 ** 18);

        // Advance beyond staleness limit
        vm.warp(block.timestamp + 3601);

        vm.startPrank(admin);
        assetNFT.approve(address(privateStaking), 1);
        vm.expectRevert("NAVOracle: Price is stale");
        privateStaking.stakeNFT(1);
        vm.stopPrank();
    }

    // --- RevenueDistributor Tests ---
    function test_Unit_RevenueDistributor_DepositRevertsIfNoStakers() public {
        vm.startPrank(admin);
        usdc.approve(address(revenueDistributor), 100 * 10 ** 6);
        vm.expectRevert("No staked RightsTokens to distribute to");
        revenueDistributor.depositRevenue(100 * 10 ** 6);
        vm.stopPrank();
    }
}

/**
 * @title FractionalRWA_Integration_Test
 * @dev Integration tests verifying two or more components work together correctly.
 */
contract FractionalRWA_Integration_Test is FractionalRWASetup {
    function test_Integration_StakeNFTMintsProportionalYieldTokens() public {
        uint256 tokenId = 1;
        uint256 expectedPrice = 1_500 * 10 ** 18; // $1,500

        // 1. Admin Mints NFT
        vm.prank(admin);
        assetNFT.mintToTreasury(admin, tokenId, "uri");

        // 2. Oracle Sets Price
        vm.prank(updater);
        navOracle.updateNAV(tokenId, expectedPrice);

        // 3. Admin Stakes NFT
        vm.startPrank(admin);
        assetNFT.approve(address(privateStaking), tokenId);
        privateStaking.stakeNFT(tokenId);
        vm.stopPrank();

        // 4. Verification
        assertEq(assetNFT.ownerOf(tokenId), address(privateStaking));
        assertEq(rightsToken.balanceOf(admin), expectedPrice);
        assertEq(privateStaking.mintedPerAsset(tokenId), expectedPrice);
    }

    function test_Integration_UnstakeNFTBurnsTokensAndReturnsAsset() public {
        uint256 tokenId = 5;
        uint256 expectedPrice = 500 * 10 ** 18;

        // Setup State for Stake
        vm.prank(admin);
        assetNFT.mintToTreasury(admin, tokenId, "uri");
        vm.prank(updater);
        navOracle.updateNAV(tokenId, expectedPrice);

        vm.startPrank(admin);
        assetNFT.approve(address(privateStaking), tokenId);
        privateStaking.stakeNFT(tokenId);

        // Action: Unstake
        privateStaking.unstakeNFT(tokenId);
        vm.stopPrank();

        // Verification
        assertEq(privateStaking.mintedPerAsset(tokenId), 0);
        assertEq(assetNFT.ownerOf(tokenId), admin);
        assertEq(rightsToken.balanceOf(admin), 0);
    }

    function test_Integration_ProRataRevenueClaiming() public {
        // Mock Admin directly minting Rights tokens to users for distributor integration test
        vm.startPrank(admin);
        rightsToken.grantRole(MINTER_ROLE, admin);
        rightsToken.mint(user1, 20_000 * 10 ** 18); // 20k tokens
        rightsToken.mint(user2, 80_000 * 10 ** 18); // 80k tokens
        vm.stopPrank();

        // Users Stake into Distributor
        vm.startPrank(user1);
        rightsToken.approve(address(revenueDistributor), 20_000 * 10 ** 18);
        revenueDistributor.stake(20_000 * 10 ** 18);
        vm.stopPrank();

        vm.startPrank(user2);
        rightsToken.approve(address(revenueDistributor), 80_000 * 10 ** 18);
        revenueDistributor.stake(80_000 * 10 ** 18);
        vm.stopPrank();

        // Admin drops 100,000 USDC revenue -> user1 gets 20%, user2 gets 80%
        vm.startPrank(admin);
        usdc.approve(address(revenueDistributor), 100_000 * 10 ** 6);
        revenueDistributor.depositRevenue(100_000 * 10 ** 6);
        vm.stopPrank();

        // Claiming Verification
        vm.prank(user1);
        revenueDistributor.claim();
        assertEq(usdc.balanceOf(user1), 20_000 * 10 ** 6);

        vm.prank(user2);
        revenueDistributor.claim();
        assertEq(usdc.balanceOf(user2), 80_000 * 10 ** 6);
    }
}

/**
 * @title FractionalRWA_E2E_Test
 * @dev Full End-to-End user flow reproducing a real-world mainnet scenario.
 */
contract FractionalRWA_E2E_Test is FractionalRWASetup {
    function test_E2E_CompleteLifecycle() public {
        uint256 tokenId = 99;

        // ==========================================================
        // STEP 1: Admin registers new RWA Vault holding a Rolex
        // ==========================================================
        vm.prank(admin);
        assetNFT.mintToTreasury(admin, tokenId, "ipfs://rolex-submariner");

        assertEq(assetNFT.ownerOf(tokenId), admin);

        // ==========================================================
        // STEP 2: Oracle evaluates Rolex value at $15,000.00
        // ==========================================================
        uint256 rolexValue = 15_000 * 10 ** 18;
        vm.prank(updater);
        navOracle.updateNAV(tokenId, rolexValue);

        // ==========================================================
        // STEP 3: Admin stakes Rolex, Mints 15,000 Rights Tokens
        // ==========================================================
        vm.startPrank(admin);
        assetNFT.approve(address(privateStaking), tokenId);
        privateStaking.stakeNFT(tokenId);

        assertEq(rightsToken.balanceOf(admin), rolexValue);
        assertEq(assetNFT.ownerOf(tokenId), address(privateStaking));
        vm.stopPrank();

        // ==========================================================
        // STEP 4: Admin distributes Rights Tokens via OTC/Market
        // User 1 buys 6,000 Rights (~40%)
        // User 2 buys 9,000 Rights (~60%)
        // ==========================================================
        vm.startPrank(admin);
        rightsToken.transfer(user1, 6_000 * 10 ** 18);
        rightsToken.transfer(user2, 9_000 * 10 ** 18);
        vm.stopPrank();

        assertEq(rightsToken.balanceOf(admin), 0);
        assertEq(rightsToken.balanceOf(user1), 6_000 * 10 ** 18);
        assertEq(rightsToken.balanceOf(user2), 9_000 * 10 ** 18);

        // ==========================================================
        // STEP 5: Users stake Rights Tokens to catch coming Yield
        // ==========================================================
        vm.startPrank(user1);
        rightsToken.approve(address(revenueDistributor), 6_000 * 10 ** 18);
        revenueDistributor.stake(6_000 * 10 ** 18);
        vm.stopPrank();

        vm.startPrank(user2);
        rightsToken.approve(address(revenueDistributor), 9_000 * 10 ** 18);
        revenueDistributor.stake(9_000 * 10 ** 18);
        vm.stopPrank();

        // ==========================================================
        // STEP 6: Rolex generates lease Revenue: $3,000
        // Admin receives it off-chain, distributes it on-chain
        // ==========================================================
        uint256 leaseRevenue = 3_000 * 10 ** 6; // USDC has 6 Decimals
        vm.startPrank(admin);
        usdc.approve(address(revenueDistributor), leaseRevenue);
        revenueDistributor.depositRevenue(leaseRevenue);
        vm.stopPrank();

        // ==========================================================
        // STEP 7: Users claim yields (User1 = $1200, User2 = $1800)
        // ==========================================================
        vm.prank(user1);
        revenueDistributor.claim();
        assertEq(usdc.balanceOf(user1), 1_200 * 10 ** 6); // 40% of 3000

        vm.prank(user2);
        revenueDistributor.claim();
        assertEq(usdc.balanceOf(user2), 1_800 * 10 ** 6); // 60% of 3000

        // ==========================================================
        // STEP 8: Attempt to Unstake NFT by Admin -> Reverts (missing tokens)
        // ==========================================================
        vm.startPrank(admin);
        vm.expectRevert("PrivateStaking: Insufficient RightsTokens to burn");
        privateStaking.unstakeNFT(tokenId);
        vm.stopPrank();

        // ==========================================================
        // STEP 9: Admin buys back tokens from Users & Unstakes Rolex
        // ==========================================================
        // Users withdraw from Distributor
        vm.prank(user1);
        revenueDistributor.withdraw(6_000 * 10 ** 18);
        vm.prank(user2);
        revenueDistributor.withdraw(9_000 * 10 ** 18);

        // Users sell back to Admin
        vm.prank(user1);
        rightsToken.transfer(admin, 6_000 * 10 ** 18);
        vm.prank(user2);
        rightsToken.transfer(admin, 9_000 * 10 ** 18);

        // Admin natively unstakes Rolex
        vm.prank(admin);
        privateStaking.unstakeNFT(tokenId);

        // Final States Check
        assertEq(assetNFT.ownerOf(tokenId), admin);
        assertEq(rightsToken.totalSupply(), 0); // All 15k tokens burned via unstaking mechanism!
    }
}
