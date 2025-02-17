// Copyright 2022 Fluidity Money. All rights reserved. Use of this
// source code is governed by a GPL-style license that can be found in the
// LICENSE.md file.

package worker

import (
	"fmt"
	"database/sql"

	"github.com/fluidity-money/fluidity-app/lib/log"
	"github.com/fluidity-money/fluidity-app/lib/types/ethereum"
	"github.com/fluidity-money/fluidity-app/lib/postgres"
	"github.com/fluidity-money/fluidity-app/lib/types/network"
)

func GetFeeSwitch(originalAddress ethereum.Address, network_ network.BlockchainNetwork) *FeeSwitch {
	postgresClient := postgres.Client()

	statementText := fmt.Sprintf(`
		SELECT new_address
		FROM %s
		WHERE network = $1 AND original_address = $2`,

		TableFeeSwitch,
	)

	row := postgresClient.QueryRow(statementText, network_, originalAddress)

	if err := row.Err(); err != nil {
		log.Fatal(func(k *log.Log) {
			k.Context = Context
			k.Message = "Failed to get fee switch config!"
			k.Payload = err
		})
	}

	feeSwitch := FeeSwitch{
		OriginalAddress: originalAddress,
		Network:         network_,
	}

	switch err := row.Scan(&feeSwitch.NewAddress); err {
	case sql.ErrNoRows:
		log.Debug(func(k *log.Log) {
			k.Context = Context

			k.Format(
				"Failed to find the fee switch replacement for the address %v, network %v",
				originalAddress,
				network_,
			)
		})

		return nil

	case nil:
		// do nothing

	default:
		log.Fatal(func(k *log.Log) {
			k.Context = Context
			k.Message = "Failed to decode fee switch code!"
			k.Payload = err
		})
	}

	log.Debug(func(k *log.Log) {
		k.Context = Context

		k.Format(
			"Found the fee switch replacement for the address %v, network %v, is %v",
			originalAddress,
			network_,
			feeSwitch.NewAddress,
		)
	})

	return &feeSwitch
}
