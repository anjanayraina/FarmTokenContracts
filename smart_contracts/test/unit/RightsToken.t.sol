// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../BaseSetup.sol";

contract RightsTokenUnitTest is BaseSetup {
    function test_Unit_RightsToken_MintRevertsIfNotMinter() public {
        vm.prank(user1);
        vm.expectRevert();
        rightsToken.mint(user1, 100);
    }
}
