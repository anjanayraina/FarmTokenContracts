// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../BaseSetup.sol";

contract RevenueDistributorUnitTest is BaseSetup {
    function test_Unit_RevenueDistributor_DepositRevertsIfNoStakers() public {
        vm.startPrank(admin);
        usdc.approve(address(revenueDistributor), 100 * 10 ** 6);
        vm.expectRevert("No staked RightsTokens to distribute to");
        revenueDistributor.depositRevenue(100 * 10 ** 6);
        vm.stopPrank();
    }
}
