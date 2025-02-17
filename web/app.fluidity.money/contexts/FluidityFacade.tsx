import type { TransactionResponse } from "~/util/chainUtils/instructions";
import type BN from "bn.js";

import { createContext } from "react";

export interface IFluidityFacade {
  swap: (
    amount: string,
    tokenAddr: string
  ) => Promise<TransactionResponse | undefined>;
  limit: (tokenAddr: string) => Promise<BN | undefined>;
  amountMinted: (tokenAddr: string) => Promise<BN | undefined>;
  balance: (tokenAddr: string) => Promise<BN | undefined>;
  disconnect: () => Promise<void>;
  tokens: () => Promise<string[]>;
  signBuffer?: (buffer: string) => Promise<string | undefined>;

  connected: boolean;
  connecting: boolean;
  useConnectorType: (use: string) => void;

  // Normalised address - For filtering, etc
  address: string;

  // Raw address - For UI
  rawAddress: string;

  // Ethereum only
  manualReward?: (
    fluidTokenAddrs: string[],
    userAddr: string
  ) => Promise<
    | ({ gasFee: number; networkFee: number; amount: number } | undefined)[]
    | undefined
  >;

  getDegenScore?: (address: string) => Promise<number>;

  addToken?: (symbol: string) => Promise<boolean | undefined>;
}

const FluidityFacadeContext = createContext<Partial<IFluidityFacade>>({
  connected: false,
});

export default FluidityFacadeContext;
