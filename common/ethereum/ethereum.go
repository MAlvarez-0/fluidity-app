// Copyright 2022 Fluidity Money. All rights reserved. Use of this
// source code is governed by a GPL-style license that can be found in the
// LICENSE.md file.

package ethereum

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"

	geth "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	ethAbiBind "github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	ethTypes "github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

// NewTransactionOptions created using the user's private key, figuring
// out the chain id using the client.
func NewTransactionOptions(client *ethclient.Client, privateKey *ecdsa.PrivateKey) (*ethAbiBind.TransactOpts, error) {

	chainId, err := client.ChainID(context.Background())

	if err != nil {
		return nil, fmt.Errorf(
			"failed to use the client to get the chain id! %v",
			err,
		)
	}

	transactionOpts, err := ethAbiBind.NewKeyedTransactorWithChainID(privateKey, chainId)

	if err != nil {
		return nil, fmt.Errorf(
			"failed to create new transaction options! %v",
			err,
		)
	}

	return transactionOpts, nil
}

// UpdateValue sets the Value field in the transaction options to 0
func UpdateValue(options *ethAbiBind.TransactOpts) {
	options.Value = big.NewInt(0)
}

// GetGasPriceTipHardhat to accomodate hardhat's bug with the gas price
func GetGasPriceTipHardhat(ctx context.Context, client *ethclient.Client) (*big.Int, error) {
	header, err := client.HeaderByNumber(ctx, nil)

	if err != nil {
		return nil, fmt.Errorf(
			"failed to get the header by number! %v",
			err,
		)
	}

	gasBaseFee := header.BaseFee

	gasPrice, err := client.SuggestGasPrice(ctx)

	if err != nil {
		return nil, fmt.Errorf(
			"failed to suggest the gas price using the client! %v",
			err,
		)
	}

	var (
		gasPriceTip = new(big.Int)
		zero        = big.NewInt(0)
	)

	gasPriceTip.Sub(gasPrice, gasBaseFee)

	if gasPriceTip.Cmp(zero) <= 0 {
		gasPriceTip = gasBaseFee
	}

	return gasPriceTip, nil
}

// UpdateGasAmounts by suggesting the gas tip cap then setting the gas
// limit to a fixed amount
func UpdateGasAmounts(ctx context.Context, client *ethclient.Client, options *ethAbiBind.TransactOpts) error {
	gasTipCap, err := client.SuggestGasTipCap(ctx)

	if err != nil {
		return fmt.Errorf(
			"failed to suggest the gas tip cap! %v",
			err,
		)
	}

	options.GasTipCap = gasTipCap

	return nil
}

func EstimateGas(client *ethclient.Client, contractAbi *abi.ABI, opts *ethAbiBind.TransactOpts, contractAddress *common.Address, method string, args ...interface{}) (uint64, error) {
	var (
		from = opts.From
		gasPrice = opts.GasPrice
		feeCap = opts.GasFeeCap
		tipCap = opts.GasTipCap
		value = opts.Value
	)

	data, err := contractAbi.Pack(method, args...)

	if err != nil {
		return 0, fmt.Errorf(
			"Failed to construct a transaction to estimate gas with! %w",
			err,
		)
	}

	msg := geth.CallMsg{
		From:       from,
		To:         contractAddress,
		Gas:        0,
		GasPrice:   gasPrice,
		GasFeeCap:  feeCap,
		GasTipCap:  tipCap,
		Value:      value,
		Data:       data,
		AccessList: []ethTypes.AccessTuple{},
	}

	return client.EstimateGas(opts.Context, msg)
}

// Calls a method on a bound contract, first simulating it to see if it reverts
func MakeTransaction(contract *ethAbiBind.BoundContract, opts *ethAbiBind.TransactOpts, method string, args ...interface{}) (*ethTypes.Transaction, error) {
	callOptions := ethAbiBind.CallOpts{
		Pending:     false,
		From:        opts.From,
		BlockNumber: nil,
		Context:     opts.Context,
	}

	err := contract.Call(
		&callOptions,
		nil,
		method,
		args...,
	)

	if err != nil {
		return nil, fmt.Errorf(
			"transaction simulation failed calling method %s! %w",
			method,
			err,
		)
	}

	transaction, err := contract.Transact(
		opts,
		method,
		args...,
	)

	return transaction, err
}
