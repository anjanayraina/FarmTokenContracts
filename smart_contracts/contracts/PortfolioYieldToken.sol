// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PortfolioYieldToken
 * @dev Standard ERC-20 token representing yield within the private vault.
 */
contract PortfolioYieldToken is ERC20, Ownable {
    constructor() ERC20("Portfolio Yield Token", "PYT") Ownable(msg.sender) {
        // Mint exactly 50,000,000 tokens to the msg.sender (the Owner/Multisig) upon deployment.
        _mint(msg.sender, 50_000_000 * 10 ** decimals());
    }
}
