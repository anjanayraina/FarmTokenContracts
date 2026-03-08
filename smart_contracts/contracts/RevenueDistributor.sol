// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RevenueDistributor
 * @dev Distributes USDC to RightsToken holders using Pull-Payment logic.
 *
 * To participate in the yield payouts, users MUST deposit (stake) their RightsTokens
 * into this contract. When the Admin deposits USDC revenue, it is instantly distributed
 * pro-rata among all currently deposited RightsTokens using the dividend-paying token pattern.
 *
 * Users can safely call `claim()` to pull their entitled USDC at their convenience.
 */
contract RevenueDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable rightsToken;
    IERC20 public immutable usdc;

    // Standard dividend tracker magnitude to prevent rounding loss
    uint256 private constant MAGNITUDE = 1e18;

    // Total RightsTokens staked in this vault
    uint256 public totalStaked;

    // Running tally of total USDC distributed per 1 staked RightsToken
    uint256 public accumulatedRewardPerShare;

    // Mapping to track staked balance points and claimed rewards
    mapping(address => uint256) public stakedBalances;
    mapping(address => uint256) public rewardDebt; // The last read value of accumulatedRewardPerShare
    mapping(address => uint256) public rewardsClaimable; // Calculated, un-claimed USDC

    // Events
    event RevenueDistributed(
        address indexed admin,
        uint256 amount,
        uint256 timestamp
    );
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);

    /**
     * @param _rightsToken Address of the RightsToken.
     * @param _usdc Address of the USDC stablecoin.
     */
    constructor(address _rightsToken, address _usdc) {
        require(_rightsToken != address(0), "Invalid RightsToken");
        require(_usdc != address(0), "Invalid USDC");

        rightsToken = IERC20(_rightsToken);
        usdc = IERC20(_usdc);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Distributes USDC uniformly to all currently staked RightsTokens.
     * Accessible only by Admin. Requires Admin to approve USDC beforehand.
     * @param _amount Explicit amount of USDC (decimals usually 6) to distribute.
     */
    function depositRevenue(
        uint256 _amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(totalStaked > 0, "No staked RightsTokens to distribute to");

        usdc.safeTransferFrom(msg.sender, address(this), _amount);

        // Increase accumulated rewards per share based on total supply currently locked
        accumulatedRewardPerShare += (_amount * MAGNITUDE) / totalStaked;

        emit RevenueDistributed(msg.sender, _amount, block.timestamp);
    }

    /**
     * @dev User deposits their RightsToken to start earning pro-rata USDC distributions.
     * @param _amount The amount of RightsToken to lock.
     */
    function stake(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Amount must be > 0");

        // Sync accounting for user before modifying balances
        _updateReward(msg.sender);

        totalStaked += _amount;
        stakedBalances[msg.sender] += _amount;

        rightsToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Staked(msg.sender, _amount);
    }

    /**
     * @dev User withdraws their RightsTokens.
     * @param _amount The amount of RightsToken to unlock.
     */
    function withdraw(uint256 _amount) external nonReentrant {
        require(
            _amount > 0 && stakedBalances[msg.sender] >= _amount,
            "Invalid amount"
        );

        // Sync accounting for user before modifying balances
        _updateReward(msg.sender);

        totalStaked -= _amount;
        stakedBalances[msg.sender] -= _amount;

        rightsToken.safeTransfer(msg.sender, _amount);

        emit Unstaked(msg.sender, _amount);
    }

    /**
     * @dev Internal function to update a user's claimable balance dynamically based on distributions.
     */
    function _updateReward(address account) internal {
        rewardsClaimable[account] = claimableUSDC(account);
        rewardDebt[account] = accumulatedRewardPerShare;
    }

    /**
     * @dev Views dynamically claimable USDC without syncing state.
     * Helps UI accurately track total due.
     */
    function claimableUSDC(address account) public view returns (uint256) {
        if (stakedBalances[account] == 0) {
            return rewardsClaimable[account];
        }

        uint256 pendingAccrual = ((accumulatedRewardPerShare -
            rewardDebt[account]) * stakedBalances[account]) / MAGNITUDE;
        return rewardsClaimable[account] + pendingAccrual;
    }

    /**
     * @dev User calls to execute pull-payment and claim all of their accrued USDC yield.
     */
    function claim() external nonReentrant {
        _updateReward(msg.sender);

        uint256 reward = rewardsClaimable[msg.sender];
        require(reward > 0, "No rewards to claim");

        rewardsClaimable[msg.sender] = 0;

        usdc.safeTransfer(msg.sender, reward);

        emit RewardClaimed(msg.sender, reward);
    }
}
