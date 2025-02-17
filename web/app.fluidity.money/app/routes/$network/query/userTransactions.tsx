import type Transaction from "~/types/Transaction";
import {
  PendingWinner,
  useUserPendingRewardsAll,
  useUserPendingRewardsByAddress,
  Winner,
} from "~/queries/useUserRewards";

import { LoaderFunction, json } from "@remix-run/node";
import config from "~/webapp.config.server";
import {
  useUserRewardsAll,
  useUserRewardsByAddress,
  useUserTransactionsAll,
  useUserTransactionsByAddress,
} from "~/queries";
import { captureException } from "@sentry/react";
import { MintAddress } from "~/types/MintAddress";
import { getTokenForNetwork } from "~/util";

type UserTransaction = {
  sender: string;
  receiver: string;
  hash: string;
  timestamp: number;
  value: number;
  currency: string;
};

export type TransactionsLoaderData = {
  transactions: Transaction[];
  page: number;
  count: number;
  loaded: boolean;
};

export const loader: LoaderFunction = async ({ params, request }) => {
  const { network } = params;

  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  const token = url.searchParams.get("token");
  const page_ = url.searchParams.get("page");

  if (!network || !page_) return new Error("Invalid Request");

  const page = parseInt(page_);

  if (!page || page < 1 || page > 20) return new Error("Invalid Request");

  try {
    const [
      { data: winnersData, errors: winnersErr },
      { data: pendingWinnersData, errors: pendingWinnersErr },
    ] = await Promise.all(
      address
        ? [
            useUserRewardsByAddress(network ?? "", address),
            useUserPendingRewardsByAddress(network ?? "", address),
          ]
        : [
            useUserRewardsAll(network ?? ""),
            useUserPendingRewardsAll(network ?? ""),
          ]
    );

    if (
      winnersErr ||
      !winnersData ||
      !pendingWinnersData ||
      pendingWinnersErr
    ) {
      throw winnersErr;
    }

    // winnersMap looks up if a transaction was the send that caused a win
    const winnersMap = winnersData.winners.reduce(
      (map, winner) => ({
        ...map,
        [winner.send_transaction_hash]: {
          ...winner,
          win_amount:
            winner.winning_amount +
            (map[winner.transaction_hash]?.winning_amount || 0),
        },
      }),
      {} as { [key: string]: Winner }
    );

    // winnersMap looks up if a transaction was the send that caused a win
    const pendingWinnersMap =
      pendingWinnersData.ethereum_pending_winners.reduce(
        (map, winner) => ({
          ...map,
          [winner.transaction_hash]: {
            ...winner,
            win_amount:
              winner.win_amount +
              (map[winner.transaction_hash]?.win_amount || 0),
          },
        }),
        {} as { [key: string]: PendingWinner }
      );

    const jointWinnersMap = {
      ...pendingWinnersMap,
      ...winnersMap,
    };

    // payoutsMap looks up if a transaction was a payout transaction
    const winnersPayoutAddrs = winnersData.winners.map(
      ({ transaction_hash }) => transaction_hash
    );

    const pendingWinnersPayoutAddrs = winnersData.winners.map(
      ({ transaction_hash }) => transaction_hash
    );

    // Because every ethereum_pending_winners is present in winner
    // and nothing in ethereum_pending_winners ever gets deleted after a payout (thats moving data to winners)
    const jointPayoutAddrs = [
      ...new Set(winnersPayoutAddrs.concat(pendingWinnersPayoutAddrs)),
    ];

    const chunkArray = <T,>(arr: T[], size: number): T[][] =>
      arr.reduce(
        (chunkedArr, el, index) => {
          const chunkIndex = Math.floor(index / size);

          if (!chunkedArr[chunkIndex]) {
            chunkedArr[chunkIndex] = []; // start a new chunk
          }

          chunkedArr[chunkIndex].push(el);

          return chunkedArr;
        },
        [[]] as T[][]
      );

    // Why's this loop here ? - because bitquery cant take in more than 100
    // jointPayoutAddrs at a time
    // we do a split and send in 99 if array length of jointPayoutAddrs is
    // greater than 100.
    const rawUserTransfers = (
      await Promise.all(
        chunkArray(jointPayoutAddrs, 100).map(async (filterHashes) => {
          const { data: transactionsData, errors: transactionsErr } =
            await (address
              ? useUserTransactionsByAddress(
                  network,
                  token ? [token] : getTokenForNetwork(network),
                  page,
                  address as string,
                  filterHashes,
                  12
                )
              : useUserTransactionsAll(
                  network,
                  token ? [token] : getTokenForNetwork(network),
                  page,
                  filterHashes,
                  12
                ));

          if (!transactionsData || transactionsErr) {
            captureException(
              new Error(
                `Could not fetch User Transactions for ${address}, on ${network}`
              ),
              {
                tags: {
                  section: "dashboard",
                },
              }
            );

            throw new Error("Server could not fulfill request");
          }

          return transactionsData[network as string].transfers;
        })
      )
    ).flat();

    // Destructure GraphQL data
    const userTransactions: UserTransaction[] = rawUserTransfers.map(
      (transaction) => {
        const {
          sender: { address: sender },
          receiver: { address: receiver },
          block: {
            timestamp: { unixtime: timestamp },
          },
          transaction: { hash },
          amount: value,
          currency: { symbol: currency },
        } = transaction;

        return {
          sender,
          receiver,
          hash,
          // Normalise timestamp to ms
          timestamp: timestamp * 1000,
          // Bitquery stores DAI decimals (6) incorrectly (should be 18)
          value:
            network !== "arbitrum" &&
            (currency === "DAI" || currency === "fDAI")
              ? value / 10 ** 12
              : value,
          currency,
        };
      }
    );

    const {
      config: {
        [network as string]: { tokens },
      },
    } = config;

    const tokenLogoMap = tokens.reduce(
      (map, token) => ({
        ...map,
        [token.symbol]: token.logo,
      }),
      {} as Record<string, string>
    );

    const defaultLogo = "/assets/tokens/usdt.svg";

    const mergedTransactions: Transaction[] = userTransactions.map((tx) => {
      const swapType =
        tx.sender === MintAddress
          ? "in"
          : tx.receiver === MintAddress
          ? "out"
          : undefined;

      const winner = jointWinnersMap[tx.hash];
      const isFromPendingWin = winner && tx.hash === winner.transaction_hash;

      return {
        sender: tx.sender,
        receiver: tx.receiver,
        winner: isFromPendingWin
          ? ((winner as PendingWinner)?.address as unknown as string)
          : ((winner as Winner)?.winning_address as unknown as string) ?? "",
        reward: winner
          ? (isFromPendingWin
              ? (winner as PendingWinner).win_amount
              : (winner as Winner).winning_amount) /
            10 ** winner.token_decimals
          : 0,
        hash: tx.hash,
        rewardHash: !isFromPendingWin ? winner?.transaction_hash : "" ?? "",
        currency: tx.currency,
        value: tx.value,
        timestamp: tx.timestamp,
        logo: tokenLogoMap[tx.currency] || defaultLogo,
        provider:
          (network === "ethereum" || network === "arbitrum"
            ? !isFromPendingWin
              ? (winner as Winner)?.ethereum_application
              : (winner as Winner)?.solana_application
            : "Fluidity") ?? "Fluidity",
        swapType,
      };
    });

    return json({
      page,
      transactions: mergedTransactions,
      count: Object.keys(winnersMap).length,
      loaded: true,
    } satisfies TransactionsLoaderData);
  } catch (err) {
    captureException(
      new Error(
        `BitQuery returned an invalid response for ${address}, on ${network}. Maybe your API key is invalid?`
      ),
      {
        tags: {
          section: "dashboard",
        },
      }
    );
    return new Error("Server could not fulfill request");
  }
};
