export type RuntimeNetwork = 'deepx_devnet' | 'deepx_testnet';

export type NetworkConfig = {
  id: RuntimeNetwork;
  label: string;
  shortLabel: 'DEVNET' | 'TESTNET';
  chainId: number;
  rpcUrl: string;
  appUrl: string;
  explorerUrl: string;
  apiBaseUrl: string;
  marketWsUrl: string;
};

const runtimeNetworkAliases = {
  devnet: 'deepx_devnet',
  deepx_devnet: 'deepx_devnet',
  testnet: 'deepx_testnet',
  deepx_testnet: 'deepx_testnet',
  beta_testnet: 'deepx_testnet',
} as const satisfies Record<string, RuntimeNetwork>;

const networkConfigs: Record<RuntimeNetwork, NetworkConfig> = {
  deepx_devnet: {
    id: 'deepx_devnet',
    label: 'DeepX Devnet',
    shortLabel: 'DEVNET',
    chainId: 4835,
    rpcUrl: 'https://devnet-rpc.deepx.fi',
    appUrl: 'https://devnet.deepx.fi',
    explorerUrl: 'http://explorer-devnet.deepx.fi',
    apiBaseUrl: 'https://devnet-api.deepx.fi',
    marketWsUrl: 'wss://devnet-api.deepx.fi/v2/ws',
  },
  deepx_testnet: {
    id: 'deepx_testnet',
    label: 'DeepX Testnet',
    shortLabel: 'TESTNET',
    chainId: 4836,
    rpcUrl: 'https://rpc-testnet.deepx.fi',
    appUrl: 'https://testnet.deepx.fi',
    explorerUrl: 'https://explorer-testnet.deepx.fi',
    apiBaseUrl: 'https://testnet-api.deepx.fi',
    marketWsUrl: 'wss://testnet-api.deepx.fi/v2/ws',
  },
};

export function normalizeRuntimeNetwork(network?: string): RuntimeNetwork {
  if (!network) {
    return 'deepx_devnet';
  }

  return (
    runtimeNetworkAliases[
      network.trim().toLowerCase() as keyof typeof runtimeNetworkAliases
    ] ?? 'deepx_devnet'
  );
}

export function getNetworkConfig(network?: string): NetworkConfig {
  return networkConfigs[normalizeRuntimeNetwork(network)];
}
