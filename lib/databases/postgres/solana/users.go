// Copyright 2022 Fluidity Money. All rights reserved. Use of this
// source code is governed by a GPL-style license that can be found in the
// LICENSE.md file.

package solana

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/fluidity-money/fluidity-app/lib/log"
	"github.com/fluidity-money/fluidity-app/lib/postgres"
)

// GetUserMintLimit for the per-user limit for the given token
func GetUserMintLimit(tokenName string) float64 {
	databaseClient := postgres.Client()

	now := time.Now().UTC()

	statementText := fmt.Sprintf(
		`SELECT 
			mint_limit	
		FROM %s
		WHERE token_short_name = $1
		AND $2 >= date AND $2 < date + interval '1 day';`,

		TableMintLimits,
	)

	row := databaseClient.QueryRow(statementText, tokenName, now)

	if err := row.Err(); err != nil {
		log.Fatal(func(k *log.Log) {
			k.Context = Context

			k.Format(
				"Failed to query the Solana token (%#v) mint limit!",
				tokenName,
			)

			k.Payload = err
		})
	}

	var mintLimit float64

	err := row.Scan(
		&mintLimit,
	)

	// no mint limit for today, return 0
	if err == sql.ErrNoRows {
		return 0	
	}

	if err != nil {
		log.Fatal(func(k *log.Log) {
			k.Context = Context

			k.Format(
				"Failed to scan the mint limit for a token (%#v)",
				tokenName,
			)

			k.Payload = err
		})
	}

	return mintLimit
}

// GetUserAmountMinted for the amount the given address has minted so far
func GetUserAmountMinted(address string) float64 {
	databaseClient := postgres.Client()

	statementText := fmt.Sprintf(
		`SELECT amount_minted
		FROM %s
		WHERE address = $1`,

		TableUsers,
	)

	row := databaseClient.QueryRow(statementText, address)

	if err := row.Err(); err != nil {
		log.Fatal(func(k *log.Log) {
			k.Context = Context

			k.Format(
				"Failed to query the Solana user (%#v) mint limit!",
				address,
			)

			k.Payload = err
		})
	}

	var amount float64

	err := row.Scan(&amount)

	if err == sql.ErrNoRows {
		return 0
	}

	if err != nil {
		log.Fatal(func(k *log.Log) {
			k.Context = Context

			k.Format(
				"Failed to scan the mint amount for a user address (%#v)",
				address,
			)

			k.Payload = err
		})
	}

	return amount
}

func ReduceMintUserLimit(address string, amount float64, tokenName string) {
	databaseClient := postgres.Client()

	statementText := fmt.Sprintf(
		`INSERT INTO %s (
			address,
			amount_minted,
			last_updated,
			token_short_name
		)

		VALUES (
			$1,
			0,
			NOW(),
			$3
		)

		ON CONFLICT (address, token_short_name)
		DO UPDATE SET amount_minted = solana_users.amount_minted - $2;`,

		TableUsers,
	)

	_, err := databaseClient.Exec(
		statementText,
		address,
		amount,
		tokenName,
	)

	if err != nil {
		log.Fatal(func(k *log.Log) {
			k.Context = Context

			k.Format(
				"Failed to reduce the Solana user (%#v) mint limit by %v!",
				address,
				amount,
			)

			k.Payload = err
		})
	}
}

func AddMintUserLimit(address string, amount float64, tokenName string) {
	databaseClient := postgres.Client()

	statementText := fmt.Sprintf(
		`INSERT INTO %s (
			address,
			amount_minted,
			last_updated,
			token_short_name
		)

		VALUES (
			$1,
			$2,
			NOW(),
			$3
		)

		ON CONFLICT (address, token_short_name)
		DO UPDATE SET amount_minted = solana_users.amount_minted + $2;`,

		TableUsers,
	)

	_, err := databaseClient.Exec(
		statementText,
		address,
		amount,
		tokenName,
	)

	if err != nil {
		log.Fatal(func(k *log.Log) {
			k.Context = Context

			k.Format(
				"Failed to add the Solana user (%#v) mint limit by %v!",
				address,
				amount,
			)

			k.Payload = err
		})
	}
}
