// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../BaseSetup.sol";

contract PrivateStakingIntegrationTest is BaseSetup {
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
}
