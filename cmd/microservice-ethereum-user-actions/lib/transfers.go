// Copyright 2022 Fluidity Money. All rights reserved. Use of this
// source code is governed by a GPL-style license that can be found in the
// LICENSE.md file.

package microservice_user_actions

import (
	"fmt"
	"math/big"
	"time"

	"github.com/fluidity-money/fluidity-app/lib/types/ethereum"
	"github.com/fluidity-money/fluidity-app/lib/types/misc"
	"github.com/fluidity-money/fluidity-app/lib/types/network"
	"github.com/fluidity-money/fluidity-app/lib/types/user-actions"

	ethAbi "github.com/ethereum/go-ethereum/accounts/abi"
	ethCommon "github.com/ethereum/go-ethereum/common"
)

// coerceDataToUint256 using Ethereum's abi library and ReadInteger
func coerceDataToUint256(data []byte) (*big.Int, error) {
	ethAbiType := ethAbi.Type{
		T: ethAbi.UintTy,
	}

	amount, err := ethAbi.ReadInteger(ethAbiType, data)

	if err != nil {
		return nil, fmt.Errorf(
			"Failed to decode a uint256 from abi data! %w",
			err,
		)
	}

	var amountBigInt *big.Int

	switch amount.(type) {
	case *big.Int:
		amountBigInt = amount.(*big.Int)

	default:
		return nil, fmt.Errorf(
			"Failed to decode an amount (%#v)!",
			amount,
		)
	}

	return amountBigInt, nil
}

// DecodeTransfer, making a new UserAction that contains a transfer
func DecodeTransfer(network_ network.BlockchainNetwork, transactionHash ethereum.Hash, fromAddressPadded, toAddressPadded string, data []byte, when time.Time, tokenShortName string, tokenDecimals int) (*user_actions.UserAction, error) {
	var (
		fromAddress = ethCommon.HexToAddress(fromAddressPadded)
		toAddress   = ethCommon.HexToAddress(toAddressPadded)
	)

	amountBigInt, err := coerceDataToUint256(data)

	if err != nil {
		return nil, err
	}

	if amountBigInt == nil {
		return nil, fmt.Errorf(
			"Returned big.Int was nil when decoding a transfer!",
		)
	}

	var (
		fromAddressHex = fromAddress.Hex()
		toAddressHex   = toAddress.Hex()
		amount         = misc.NewBigIntFromInt(*amountBigInt)
	)

	send := user_actions.NewSendEthereum(
		network_,
		ethereum.AddressFromString(fromAddressHex),
		ethereum.AddressFromString(toAddressHex),
		transactionHash,
		amount,
		tokenShortName,
		tokenDecimals,
	)

	return &send, nil
}
