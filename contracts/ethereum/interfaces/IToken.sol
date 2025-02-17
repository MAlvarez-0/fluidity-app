// SPDX-License-Identifier: GPL

// Copyright 2022 Fluidity Money. All rights reserved. Use of this
// source code is governed by a GPL-style license that can be found in the
// LICENSE.md file.

pragma solidity 0.8.16;
pragma abicoder v2;

import "./IFluidClient.sol";
import "./ILiquidityProvider.sol";

import "./IERC20.sol";

interface IToken is IERC20 {
    /// @notice emitted when a reward is quarantined for being too large
    event BlockedReward(
        address indexed winner,
        uint256 amount,
        uint256 startBlock,
        uint256 endBlock
    );

    /// @notice emitted when a blocked reward is released
    event UnblockReward(
        bytes32 indexed originalRewardTx,
        address indexed winner,
        uint256 amount,
        uint256 startBlock,
        uint256 endBlock
    );

    /// @notice emitted when an underlying token is wrapped into a fluid asset
    event MintFluid(address indexed addr, uint256 amount);

    /// @notice emitted when a fluid token is unwrapped to its underlying asset
    event BurnFluid(address indexed addr, uint256 amount);

    /// @notice emitted when a new operator takes over the contract management
    event OperatorChanged(address indexed oldOperator, address indexed newOperator);

    /// @notice emitted when restrictions
    event MaxUncheckedRewardLimitChanged(uint256 amount);

    /// @notice updating the reward quarantine before manual signoff
    /// @notice by the multisig (with updateRewardQuarantineThreshold)
    event RewardQuarantineThresholdUpdated(uint256 amount);

    /// @notice emitted when a user is permitted to mint on behalf of another user
    event MintApproval(
        address indexed owner,
        address indexed spender,
        uint256 amount
    );

    /**
     * @notice getter for the RNG oracle provided by `workerConfig_`
     * @return the address of the trusted oracle
     *
     * @dev individual oracles are now recorded in the operator, this
     *      now should return the registry contract
     */
    function oracle() external view returns (address);

    /**
     * @notice underlyingToken that this IToken wraps
     */
    function underlyingToken() external view returns (IERC20);

    /**
     * @notice underlyingLp that's in use for the liquidity provider
     */
    function underlyingLp() external view returns (ILiquidityProvider);

    /// @notice updates the reward quarantine threshold if called by the operator
    function updateRewardQuarantineThreshold(uint256) external;

    /**
     * @notice wraps `amount` of underlying tokens into fluid tokens
     * @notice requires you to have called the ERC20 `approve` method
     * @notice targeting this contract first on the underlying asset
     *
     * @param _amount the number of tokens to wrap
     * @return the number of tokens wrapped
     */
    function erc20In(uint256 _amount) external returns (uint256);

    /**
     * @notice erc20InTo wraps the `amount` given and transfers the tokens to `receiver`
     *
     * @param _recipient of the wrapped assets
     * @param _amount to wrap and send to the recipient
     */
    function erc20InTo(address _recipient, uint256 _amount) external returns (uint256);

    /**
     * @notice unwraps `amount` of fluid tokens back to underlying
     *
     * @param _amount the number of fluid tokens to unwrap
     */
    function erc20Out(uint256 _amount) external;

   /**
     * @notice unwraps `amount` of fluid tokens with the address as recipient
     *
     * @param _recipient to receive the underlying tokens to
     * @param _amount the number of fluid tokens to unwrap
     */
    function erc20OutTo(address _recipient, uint256 _amount) external;

    /**
     * @notice calculates the size of the reward pool (the interest we've earned)
     *
     * @return the number of tokens in the reward pool
     */
    function rewardPoolAmount() external returns (uint256);

    /**
     * @notice admin function, unblocks a reward that was quarantined for being too large
     * @notice allows for paying out or removing the reward, in case of abuse
     *
     * @param _user the address of the user who's reward was quarantined
     *
     * @param _amount the amount of tokens to release (in case
     *        multiple rewards were quarantined)
     *
     * @param _payout should the reward be paid out or removed?
     *
     * @param _firstBlock the first block the rewards include (should
     *        be from the BlockedReward event)
     *
     * @param _lastBlock the last block the rewards include
     */
    function unblockReward(
        bytes32 _rewardTx,
        address _user,
        uint256 _amount,
        bool _payout,
        uint256 _firstBlock,
        uint256 _lastBlock
    )
        external;

    /**
     * @notice return the max unchecked reward that's currently set
     */
    function maxUncheckedReward() external view returns (uint256);

    /// @notice upgrade the underlying ILiquidityProvider to a new source
    function upgradeLiquidityProvider(ILiquidityProvider newPool) external;

    /**
     * @notice drain the reward pool of the amount given without
     *         touching any principal amounts
     *
     * @dev this is intended to only be used to retrieve initial
     *       liquidity provided by the team OR by the DAO to allocate funds
     */
    function drainRewardPool(address _recipient, uint256 _amount) external;
}
