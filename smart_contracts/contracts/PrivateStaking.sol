// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @dev Reusing the interface here to avoid cyclic/heavy dependencies visually.
 * Could also natively import "./NAVOracle.sol" if it defines the INAVOracle interface loosely.
 */
interface INAVOracle {
    function getPrice(uint256 tokenId) external view returns (uint256);
    function isStale(uint256 tokenId) external view returns (bool);
}

interface IRightsToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title PrivateStaking
 * @dev The Core Issuance Logic (Escrow Vault).
 * Requires the DEFAULT_ADMIN_ROLE to operate (mint/unstake).
 * Evaluates the NAV of an NFT, holds it in escrow, and mints matching RightsTokens.
 */
contract PrivateStaking is
    ERC721Holder,
    AccessControl,
    ReentrancyGuard,
    Pausable
{
    IERC721 public immutable assetNFT;
    INAVOracle public oracle;
    IRightsToken public rightsToken;

    // Track the amount of RightsTokens issued per NFT ID
    mapping(uint256 => uint256) public mintedPerAsset;

    // Events
    event Staked(
        address indexed admin,
        uint256 indexed tokenId,
        uint256 tokensMinted
    );
    event Unstaked(
        address indexed admin,
        uint256 indexed tokenId,
        uint256 tokensBurned
    );

    constructor(
        address _nftAddress,
        address _oracleAddress,
        address _rightsTokenAddress
    ) {
        require(_nftAddress != address(0), "Invalid NFT address");
        require(_oracleAddress != address(0), "Invalid Oracle address");
        require(
            _rightsTokenAddress != address(0),
            "Invalid RightsToken address"
        );

        assetNFT = IERC721(_nftAddress);
        oracle = INAVOracle(_oracleAddress);
        rightsToken = IRightsToken(_rightsTokenAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Sets new Oracle Address.
     * @param _oracleAddress New oracle.
     */
    function setOracle(
        address _oracleAddress
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_oracleAddress != address(0), "Invalid Oracle address");
        oracle = INAVOracle(_oracleAddress);
    }

    /**
     * @dev Pauses staking capabilities.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses staking capabilities.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Stakes an NFT and mints RightsTokens.
     * Only Admin can stake. Must transfer NFT to this contract.
     * @param tokenId The ID of the Asset NFT to stake.
     */
    function stakeNFT(
        uint256 tokenId
    ) external nonReentrant whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            mintedPerAsset[tokenId] == 0,
            "PrivateStaking: NFT already staked"
        );

        // 1. Ensure the oracle is not stale before fetching (getPrice typically checks this anyway, but enforced)
        require(
            !oracle.isStale(tokenId),
            "PrivateStaking: Oracle price is stale"
        );

        // 2. Fetch price (18 decimals representing USD)
        // If price is 50.00 USD, it natively returns 50 * 10^18.
        uint256 nftValue = oracle.getPrice(tokenId);
        require(nftValue > 0, "PrivateStaking: Asset value is 0");

        // Prepare amount to mint -> 1 RightsToken (10^18 base units) per $1 (10^18 base units from Oracle)
        uint256 amountToMint = nftValue;

        // 3. Keep internal tracking of what was minted for this explicit NFT
        mintedPerAsset[tokenId] = amountToMint;

        // 4. Transfer NFT to the vault (this contract)
        // Requires Admin to have called `approve` or `setApprovalForAll` on the NFT first.
        assetNFT.safeTransferFrom(msg.sender, address(this), tokenId);

        // 5. Mint tokens equivalent to the value.
        // The staking contract itself uses the IRightsToken.mint via MINTER_ROLE permissions
        rightsToken.mint(msg.sender, amountToMint);

        emit Staked(msg.sender, tokenId, amountToMint);
    }

    /**
     * @dev Unstakes an NFT and burns the original RightsTokens minted against it.
     * the Admin must possess enough tokens in their wallet.
     * @param tokenId The ID of the Asset NFT to unstake.
     */
    function unstakeNFT(
        uint256 tokenId
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 requiredToBurn = mintedPerAsset[tokenId];
        require(
            requiredToBurn > 0,
            "PrivateStaking: Asset not historically staked"
        );

        // Verify Admin balance
        require(
            rightsToken.balanceOf(msg.sender) >= requiredToBurn,
            "PrivateStaking: Insufficient RightsTokens to burn"
        );

        // Reset the tracker before actions (CEI pattern: Checks-Effects-Interactions)
        mintedPerAsset[tokenId] = 0;

        // Burn the necessary tokens from the Admin
        rightsToken.burn(msg.sender, requiredToBurn);

        // Transfer the NFT back to Admin
        assetNFT.safeTransferFrom(address(this), msg.sender, tokenId);

        emit Unstaked(msg.sender, tokenId, requiredToBurn);
    }
}
