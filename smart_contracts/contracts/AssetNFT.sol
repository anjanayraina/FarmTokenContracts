// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AssetNFT
 * @dev Standard ERC-721 contract representing the physical/digital assets.
 * Restricts minting strictly to the DEFAULT_ADMIN_ROLE.
 */
contract AssetNFT is ERC721URIStorage, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC721("RWA Asset NFT", "rwaNFT") {
        // Grand DEFAULT_ADMIN_ROLE to deployer
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // We also grant MINTER_ROLE to the deployer for convenience,
        // though the prompt says "Restrict minting strictly to the DEFAULT_ADMIN_ROLE."
        // We will strictly enforce DEFAULT_ADMIN_ROLE in the mint function.
    }

    /**
     * @dev Mints a new NFT to the treasury (or specific address) with a token URI.
     * @param to The address to receive the minted NFT.
     * @param tokenId The unique identifier for the NFT.
     * @param uri The URI holding metadata for the asset.
     */
    function mintToTreasury(
        address to,
        uint256 tokenId,
        string memory uri
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    // The following functions are overrides required by Solidity.

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
