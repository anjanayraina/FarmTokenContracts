// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/FarmNFT.sol";

contract FarmNFTTest is Test {
    FarmNFT public farmNFT;

    bytes32 root;
    bytes32 leaf1;
    bytes32 leaf2;
    bytes32 leaf3;
    bytes32 invalidLeaf;

    bytes32[] proof1;
    bytes32[] proof2;

    function setUp() public {
        farmNFT = new FarmNFT();

        leaf1 = keccak256(abi.encodePacked(address(1)));
        leaf2 = keccak256(abi.encodePacked(address(2)));
        leaf3 = keccak256(abi.encodePacked(address(3)));
        invalidLeaf = keccak256(abi.encodePacked(address(5)));

        bytes32 L1 = leaf1;
        bytes32 L2 = leaf2;

        bytes32 hashL1L2;
        if (L1 <= L2) {
            hashL1L2 = keccak256(abi.encodePacked(L1, L2));
        } else {
            hashL1L2 = keccak256(abi.encodePacked(L2, L1));
        }

        root = hashL1L2;

        proof1.push(L2);
        proof2.push(L1);
    }

    function test_ProcessProof_Valid() public {
        bytes32 computedRoot = farmNFT.processProof(proof1, leaf1);
        assertEq(computedRoot, root);

        bytes32 computedRoot2 = farmNFT.processProof(proof2, leaf2);
        assertEq(computedRoot2, root);
    }

    function test_ProcessProof_InvalidProof() public {
        bytes32 computedRoot = farmNFT.processProof(proof1, invalidLeaf);
        assertTrue(computedRoot != root);
    }

    function test_Verify_Valid() public {
        bool isValid = farmNFT.verify(proof1, root, leaf1);
        assertTrue(isValid);

        isValid = farmNFT.verify(proof2, root, leaf2);
        assertTrue(isValid);
    }

    function test_Verify_Invalid() public {
        bool isValid = farmNFT.verify(proof1, root, invalidLeaf);
        assertTrue(!isValid);
    }

    function test_Verify_InvalidRoot() public {
        bytes32 fakeRoot = keccak256("fake");
        bool isValid = farmNFT.verify(proof1, fakeRoot, leaf1);
        assertTrue(!isValid);
    }
}
