// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../BaseSetup.sol";

contract RevenueDistributorIntegrationTest is BaseSetup {
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
