// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../BaseSetup.sol";

contract PrivateStakingUnitTest is BaseSetup {
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
}
