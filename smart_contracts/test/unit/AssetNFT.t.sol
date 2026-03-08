// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../BaseSetup.sol";

contract AssetNFTUnitTest is BaseSetup {
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
}
