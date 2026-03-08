// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title INAVOracle
 * @dev Interface expected by PrivateStaking and other consumer contracts.
 */
interface INAVOracle {
    struct Valuation {
        uint256 price;
        uint256 lastUpdated;
        bool isStale;
    }

    function getValuation(
        uint256 tokenId
    ) external view returns (Valuation memory);
    function isStale(uint256 tokenId) external view returns (bool);
    function getPrice(uint256 tokenId) external view returns (uint256);
}

/**
 * @title NAVOracle
 * @dev Stores the USD value (with 18 decimals) of specific NFTs.
 * Implement Delta bounds and staleness checks to ensure prices can't
 * be manipulated excessively or go out of date without warning.
 */
contract NAVOracle is INAVOracle, AccessControl {
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    uint256 public stalePeriodSeconds = 3600; // 1 hour
    uint256 public maxDeltaBps = 1000; // 1000 = 10%, 10000 = 100%

    mapping(uint256 => Valuation) private _valuations;

    // Events
    event ValuationUpdated(
        uint256 indexed tokenId,
        uint256 oldPrice,
        uint256 newPrice
    );
    event StalePeriodUpdated(uint256 newPeriod);
    event MaxDeltaBpsUpdated(uint256 newDelta);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Allows the updater role to set a new price for a given token ID.
     * Enforces that the new price does not exceed maxDeltaBps delta if a price exists.
     * @param tokenId The ID of the Asset NFT
     * @param newPrice The new USD price with 18 decimals
     */
    function updateNAV(
        uint256 tokenId,
        uint256 newPrice
    ) external onlyRole(UPDATER_ROLE) {
        require(newPrice > 0, "NAVOracle: Price must be > 0");

        Valuation storage val = _valuations[tokenId];

        // If price is 0, it means it's the first time being updated
        if (val.price > 0) {
            uint256 oldPrice = val.price;
            uint256 delta;

            // Calculate delta
            if (newPrice > oldPrice) {
                delta = newPrice - oldPrice;
            } else {
                delta = oldPrice - newPrice;
            }

            // Check max percentage deviation (maxDeltaBps)
            // delta / oldPrice <= maxDeltaBps / 10000
            // Therefore: delta * 10000 <= oldPrice * maxDeltaBps
            require(
                (delta * 10000) <= (oldPrice * maxDeltaBps),
                "NAVOracle: Price delta exceeds limit"
            );
        }

        uint256 previousPrice = val.price;
        val.price = newPrice;
        val.lastUpdated = block.timestamp;
        val.isStale = false; // We use block.timestamp to dynamically check stale, but flag is maintained as requested

        emit ValuationUpdated(tokenId, previousPrice, newPrice);
    }

    /**
     * @dev Checks if the oracle value is considered stale.
     * @param tokenId The token ID to query
     * @return true if stale, false otherwise
     */
    function isStale(uint256 tokenId) public view override returns (bool) {
        Valuation memory val = _valuations[tokenId];
        if (val.lastUpdated == 0) return true; // Never updated
        return (block.timestamp - val.lastUpdated) > stalePeriodSeconds;
    }

    /**
     * @dev Returns the full Valuation struct for a token.
     * Also updates the dynamic `isStale` flag in the returned struct for accuracy.
     * @param tokenId The token ID to query
     */
    function getValuation(
        uint256 tokenId
    ) external view override returns (Valuation memory) {
        Valuation memory val = _valuations[tokenId];
        val.isStale = isStale(tokenId);
        return val;
    }

    /**
     * @dev Returns just the price. Reverts if state.
     * @param tokenId The token ID to query
     */
    function getPrice(
        uint256 tokenId
    ) external view override returns (uint256) {
        require(!isStale(tokenId), "NAVOracle: Price is stale");
        return _valuations[tokenId].price;
    }

    // --- Admin Configuration ---

    function setStalePeriod(
        uint256 newPeriod
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stalePeriodSeconds = newPeriod;
        emit StalePeriodUpdated(newPeriod);
    }

    function setMaxDeltaBps(
        uint256 newDelta
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newDelta <= 10000, "NAVOracle: delta cannot exceed 10000 bps");
        maxDeltaBps = newDelta;
        emit MaxDeltaBpsUpdated(newDelta);
    }
}
