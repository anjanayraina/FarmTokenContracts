// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/PortfolioYieldToken.sol";
import "../contracts/PrivateNFTVault.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

// Mock NFT collection for testing batch operations
contract MockERC721 is ERC721 {
    constructor() ERC721("Mock Asset", "MOCK") {}

    function mintBatch(address to, uint256 count) external {
        for (uint256 i = 1; i <= count; i++) {
            _mint(to, i);
        }
    }
}

contract PrivateNFTVaultTest is Test {
    PortfolioYieldToken pyt;
    PrivateNFTVault vault;
    MockERC721 mockNFT;

    address owner = address(this); // The test contract is the owner/multisig
    address unauthorizedUser = address(0xDEAD);

    function setUp() public {
        mockNFT = new MockERC721();
        pyt = new PortfolioYieldToken();

        vault = new PrivateNFTVault(address(mockNFT), address(pyt));

        // Transfer some PYT to vault so it can pay out rewards
        pyt.transfer(address(vault), 1_000_000 * 10 ** 18);
    }

    function test_PYTMintedToOwner() public {
        assertEq(pyt.balanceOf(owner), 49_000_000 * 10 ** 18); // 50m minus 1m given to vault
    }

    function test_OnlyOwnerCanBatchStake() public {
        mockNFT.mintBatch(owner, 5);
        mockNFT.setApprovalForAll(address(vault), true);

        uint256[] memory tokens = new uint256[](5);
        for (uint i = 0; i < 5; i++) {
            tokens[i] = i + 1;
        }

        vm.prank(unauthorizedUser);
        vm.expectRevert();
        vault.batchStake(tokens);

        // Owner succeeds
        vault.batchStake(tokens);
        assertEq(vault.totalStaked(), 5);
    }

    function test_YieldCalculation() public {
        mockNFT.mintBatch(owner, 10);
        mockNFT.setApprovalForAll(address(vault), true);

        uint256[] memory tokens = new uint256[](10);
        for (uint i = 0; i < 10; i++) {
            tokens[i] = i + 1;
        }

        vault.batchStake(tokens);

        // Advance 2 hours
        vm.warp(block.timestamp + 2 hours);

        // Expected formula: 10 NFTs * 2 hours * 1.23 = 24.6 PYT
        uint256 initialBal = pyt.balanceOf(owner);
        vault.claimRewards();
        uint256 currentBal = pyt.balanceOf(owner);

        assertEq(currentBal - initialBal, 24.6 * 10 ** 18);
    }

    function test_EmergencyWithdraw() public {
        mockNFT.mintBatch(owner, 2);
        mockNFT.setApprovalForAll(address(vault), true);

        uint256[] memory tokens = new uint256[](2);
        tokens[0] = 1;
        tokens[1] = 2;

        vault.batchStake(tokens);

        vault.emergencyWithdraw(tokens);

        assertEq(mockNFT.ownerOf(1), owner);
        assertEq(mockNFT.ownerOf(2), owner);
        assertEq(vault.totalStaked(), 0);
    }

    // Must implement to receive the token ourselves during testing
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
