// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../BaseSetup.sol";

contract FractionalRWAE2ETest is BaseSetup {
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
