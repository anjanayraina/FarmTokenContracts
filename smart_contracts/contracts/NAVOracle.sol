// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract NAVOracle is Initializable, AccessControlUpgradeable {
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    uint256 public currentNAV;
    uint256 public lastUpdateTimestamp;
    uint256 public constant MAX_DELTA_BPS = 1000; // 10% change max
    uint256 public constant HEARTBEAT = 1 hours;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function updateNAV(
        uint256 _nav,
        uint256 _timestamp
    ) external onlyRole(UPDATER_ROLE) {
        require(_timestamp <= block.timestamp, "Future timestamp not allowed");

        if (currentNAV > 0) {
            uint256 delta;
            if (_nav > currentNAV) {
                delta = _nav - currentNAV;
            } else {
                delta = currentNAV - _nav;
            }

            uint256 deltaBps = (delta * 10000) / currentNAV;
            require(deltaBps <= MAX_DELTA_BPS, "Price jump exceeds 10%");
        }

        currentNAV = _nav;
        lastUpdateTimestamp = _timestamp;
    }

    function isStale() public view returns (bool) {
        return (block.timestamp - lastUpdateTimestamp) > HEARTBEAT;
    }
}
