// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../BaseSetup.sol";

contract NAVOracleUnitTest is BaseSetup {
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
}
