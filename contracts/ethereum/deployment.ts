
import { ethers } from 'ethers';

import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import type {
  FluidityContracts,
  FluidityFactories,
  Token,
  TokenAddresses } from './types';

export const getFactories = async (
  hre: HardhatRuntimeEnvironment
): Promise<FluidityFactories> => {
  const upgradeableBeaconFactory = await hre.ethers.getContractFactory("UpgradeableBeacon");

  const govTokenFactory = await hre.ethers.getContractFactory("GovToken");

  const veGovLockupFactory = await hre.ethers.getContractFactory("VEGovLockup");

  const registryFactory = await hre.ethers.getContractFactory("Registry");

  const operatorFactory = await hre.ethers.getContractFactory("Executor");

  const tokenFactory = await hre.ethers.getContractFactory("Token");

  const compoundLiquidityProviderFactory = await hre.ethers.getContractFactory(
    "CompoundLiquidityProvider"
  );

  const aaveV2LiquidityProviderFactory = await hre.ethers.getContractFactory(
    "AaveV2LiquidityProvider"
  );

  const aaveV3LiquidityProviderFactory = await hre.ethers.getContractFactory(
    "AaveV3LiquidityProvider"
  );

  const daoFactory = await hre.ethers.getContractFactory("DAOStable");

  const utilityGaugesFactory = await hre.ethers.getContractFactory("UtilityGauges");

  return {
    upgradeableBeacon: upgradeableBeaconFactory,
    token: tokenFactory,
    govToken: govTokenFactory,
    veGovLockup: veGovLockupFactory,
    registry: registryFactory,
    operator: operatorFactory,
    compoundLiquidityProvider: compoundLiquidityProviderFactory,
    aaveV2LiquidityProvider: aaveV2LiquidityProviderFactory,
    aaveV3LiquidityProvider: aaveV3LiquidityProviderFactory,
    dao: daoFactory,
    utilityGauges: utilityGaugesFactory,
  };
};

export const deployTestUtilityWithoutDAO = async (
  hre: HardhatRuntimeEnvironment,
  operator: ethers.Contract,
  token: string,
) => {
  const factory = await hre.ethers.getContractFactory("TestClient");
  const client = await factory.deploy(operator.address);

  await client.deployed();

  await operator.updateUtilityClients([{
    name: "test",
    overwrite: false,
    token,
    client,
  }]);

  return client;
};

export const deployBeacon = async (
  upgradeableBeaconFactory: ethers.ContractFactory,
  ownerAddress: string,
  implFactory: ethers.ContractFactory
): Promise<ethers.Contract> => {
  const impl = await implFactory.deploy();
  const beacon = await upgradeableBeaconFactory.deploy(impl.address);
  await beacon.transferOwnership(ownerAddress);
  return beacon;
};

export const deployBeacons = async(
  upgradeableBeaconFactory: ethers.ContractFactory,
  ownerAddress: string,
  ...factories: ethers.ContractFactory[]
): Promise<ethers.Contract[]> =>
  Promise.all(factories.map((v) => deployBeacon(
    upgradeableBeaconFactory,
    ownerAddress,
    v
  )));

// deployTokens, registering the utility clients against the registry
// (not listing the tokens here though)
export const deployTokens = async (
  hre: HardhatRuntimeEnvironment,
  tokens: Token[],
  aaveV2PoolProvider: string,
  aaveV3PoolProvider: string,
  councilAddress: string,
  externalOperatorAddress: string,
  boundOperatorOperator: ethers.Contract,
  boundRegistryOperator: ethers.Contract,
  externalOracleAddress: string,

  tokenFactory: ethers.ContractFactory,
  tokenBeacon: string,

  compoundFactory: ethers.ContractFactory,
  compoundBeacon: string,

  aaveV2Factory: ethers.ContractFactory,
  aaveV2Beacon: string,

  aaveV3Factory: ethers.ContractFactory,
  aaveV3Beacon: string
): Promise<{
  tokens: TokenAddresses,
}> => {
  const tokenAddresses: TokenAddresses = {};

  for (const token of tokens) {
    let deployedPool: ethers.Contract;

    const deployedToken = await hre.upgrades.deployBeaconProxy(
      tokenBeacon,
      tokenFactory,
    );

    switch (token.backend) {
      case 'compound':
        deployedPool = await hre.upgrades.deployBeaconProxy(
          compoundBeacon,
          compoundFactory,
          [token.compoundAddress, deployedToken.address],
          {initializer: "init(address, address)"},
        );

        break;

      case 'aaveV2':
        deployedPool = await hre.upgrades.deployBeaconProxy(
          aaveV2Beacon,
          aaveV2Factory,
          [aaveV2PoolProvider, token.aaveAddress, deployedToken.address],
          {initializer: "init(address, address, address)"},
        );

        break;

      case 'aaveV3':
        deployedPool = await hre.upgrades.deployBeaconProxy(
          aaveV3Beacon,
          aaveV3Factory,
          [aaveV3PoolProvider, token.aaveAddress, deployedToken.address],
          {initializer: "init(address, address, address)"},
        );

        break;

      default:
        throw new Error("token backend ${token.backend} unusual!");
    }

    await deployedPool.deployed();

    await deployedToken.deployed();

    await deployedToken.functions.init(
      deployedPool.address,
      token.decimals,
      token.name,
      token.symbol,
      councilAddress,
      externalOperatorAddress,
      boundOperatorOperator.address,
    );

    await boundRegistryOperator.updateUtilityClients([{
      name: "FLUID",
      overwrite: false,
      token: deployedToken.address,
      client: deployedToken.address,
    }]);

    await boundOperatorOperator.updateOracles([{
      contractAddr: deployedToken.address,
      newOracle: externalOracleAddress,
    }]);

    tokenAddresses[token.symbol] = {deployedToken, deployedPool};
  }

  return {
    tokens: tokenAddresses
  };
};

export const deployRegistry = async(
  hre: HardhatRuntimeEnvironment,
  signer: ethers.Signer,
  factory: ethers.ContractFactory,
  beaconAddress: string,
  operatorAddress: string
): Promise<ethers.Contract> => {
  const beaconProxy = await hre.upgrades.deployBeaconProxy(
    beaconAddress,
    factory.connect(signer),
    [operatorAddress],
    {
      initializer: "init(address)"
    }
  );

  return beaconProxy;
};

export const deployOperator = async(
  hre: HardhatRuntimeEnvironment,
  signer: ethers.Signer,
  factory: ethers.ContractFactory,
  beaconAddress: string,
  operatorAddress: string,
  emergencyCouncilAddress: string,
  registryAddress: string
): Promise<ethers.Contract> => {
  const beaconProxy = await hre.upgrades.deployBeaconProxy(
    beaconAddress,
    factory.connect(signer),
    [operatorAddress, emergencyCouncilAddress, registryAddress],
    {
      initializer: "init(address,address,address)"
    }
  );

  return beaconProxy;
};

export const deployGovToken = async(
  factory: ethers.ContractFactory,
  signer: ethers.Signer,
  name: string,
  symbol: string,
  decimals: number,
  totalSupply: number
): Promise<ethers.Contract> => factory.connect(signer).deploy(
  name,
  symbol,
  decimals,
  totalSupply
);

export const deployVEGovLockup = async (
  factory: ethers.ContractFactory,
  signer: ethers.Signer,
  voteTokenAddress: string
): Promise<ethers.Contract> => factory.connect(signer).deploy(voteTokenAddress);

export const deployUtilityGauges = async (
  factory: ethers.ContractFactory,
  signer: ethers.Signer,
  operator: ethers.Signer,
  veGovLockupAddress: string,
): Promise<ethers.Contract> => {
  const contract = await factory.connect(signer).deploy(operator.getAddress(), veGovLockupAddress);
  return contract;
};

export const deployDAOStable = async(
  factory: ethers.ContractFactory,
  emergencyCouncil: string,
  veGovLockupAddress: string
): Promise<ethers.Contract> => factory.deploy(
  emergencyCouncil,
  veGovLockupAddress
);

// deployFluidity by deploying contracts that aren't tokens
export const deployFluidity = async (
  hre: HardhatRuntimeEnvironment,
  emergencyCouncilAddress: string,

  govTokenName: string,
  govTokenSymbol: string,
  govTokenDecimals: number,
  govTokenTotalSupply: number,

  registryFactory: ethers.ContractFactory,
  registrySigner: ethers.Signer,

  operatorFactory: ethers.ContractFactory,
  operatorSigner: ethers.Signer,

  govTokenFactory: ethers.ContractFactory,
  govTokenSigner: ethers.Signer,

  veGovLockupFactory: ethers.ContractFactory,
  veGovLockupSigner: ethers.Signer,

  daoFactory: ethers.ContractFactory,

  registryBeaconAddress: string,
  operatorBeaconAddress: string
): Promise<FluidityContracts> => {
  const registry = await deployRegistry(
    hre,
    registrySigner,
    registryFactory,
    registryBeaconAddress,
    await registrySigner.getAddress()
  );

  const operator = await deployOperator(
    hre,
    operatorSigner,
    operatorFactory,
    operatorBeaconAddress,
    await operatorSigner.getAddress(),
    emergencyCouncilAddress,
    registry.address
  );

  const govToken = await deployGovToken(
    govTokenFactory,
    govTokenSigner,
    govTokenName,
    govTokenSymbol,
    govTokenDecimals,
    govTokenTotalSupply
  );

  const veGovLockup = await deployVEGovLockup(
    veGovLockupFactory,
    veGovLockupSigner,
    govToken.address
  );

  const dao = await deployDAOStable(
    daoFactory,
    emergencyCouncilAddress,
    veGovLockup.address
  );

  return {
    operator: operator,
    govToken: govToken,
    registry: registry,
    dao: dao,
    veGovLockup: veGovLockup
  }
};
