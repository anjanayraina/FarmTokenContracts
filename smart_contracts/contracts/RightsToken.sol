// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title RightsToken
 * @dev Standard ERC-20 representing the leasing/yield rights for fractionalized NFTs.
 * Must NOT have public minting.
 * Includes explicit `mint(address, uint256)` and `burn(address, uint256)`.
 * Restrict mint and burn strictly to a MINTER_ROLE (to be granted to the Staking Contract).
 */
contract RightsToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC20("Fractionalized Vault RWA Rights", "RT-RWA") {
        // Grant DEFAULT_ADMIN_ROLE to deployer so they can grant MINTER_ROLE subsequently
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Mints Rights Tokens directly to an address.
     * @param to The recipient address.
     * @param amount The number of tokens (18 decimals assumed).
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @dev Burns Rights Tokens directly from any address.
     * Note: This is an administrative burn meant to be called by the Staking Contract (vault)
     * during the unstaking process, overriding standard allowance checks assuming vault authority.
     * @param from The address holding the tokens to burn.
     * @param amount The number of tokens (18 decimals assumed).
     */
    function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }
}
