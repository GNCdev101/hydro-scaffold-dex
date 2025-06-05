export const networkConfigs = {
  "1": {
    chainId: "1",
    chainName: "Ethereum Mainnet",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://mainnet.infura.io/v3/cabc724fb9534d1bb245582a74ccf3e7"],
    blockExplorerUrls: ["https://etherscan.io"],
    hydroProxyAddress: "0x74622073a4821dbfd046e9aa2ccf691341a076e1",
    hydroTokenAddress: "0x9af839687f6c94542ac5ece2e317daae355493a1",
    wethTokenAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    apiUrl: "http://localhost:3001",
    wsUrl: "ws://localhost:3002",
  },
  "3": {
    chainId: "3",
    chainName: "Ropsten",
    nativeCurrency: {
      name: "Ropsten Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://ropsten.infura.io/v3/cabc724fb9534d1bb245582a74ccf3e7"],
    blockExplorerUrls: ["https://ropsten.etherscan.io"],
    hydroProxyAddress: "0x445CA52435b2A2A451f8f7039993d58A0C1A7C44", // Placeholder
    hydroTokenAddress: "0x30D985456491C777150A643a226609E250697549", // Placeholder
    wethTokenAddress: "0xc778417e063141139fce010982780140aa0cd5ab", // Placeholder
    apiUrl: "http://localhost:3001",
    wsUrl: "ws://localhost:3002",
  },
  "137": {
    chainId: "137",
    chainName: "Polygon Mainnet",
    nativeCurrency: {
      name: "MATIC",
      symbol: "MATIC",
      decimals: 18,
    },
    rpcUrls: ["https://polygon-rpc.com"],
    blockExplorerUrls: ["https://polygonscan.com"],
    hydroProxyAddress: "0xPOLYGON_MAINNET_HYDRO_PROXY_PLACEHOLDER",
    hydroTokenAddress: "0xPOLYGON_MAINNET_HYDRO_TOKEN_PLACEHOLDER",
    wethTokenAddress: "0xPOLYGON_MAINNET_WETH_TOKEN_PLACEHOLDER",
    apiUrl: "http://localhost:3001/polygon", // Example, can be same as default
    wsUrl: "ws://localhost:3002/polygon", // Example, can be same as default
  },
  "80001": {
    chainId: "80001",
    chainName: "Polygon Mumbai",
    nativeCurrency: {
      name: "MATIC",
      symbol: "MATIC",
      decimals: 18,
    },
    rpcUrls: ["https://rpc-mumbai.maticvigil.com"],
    blockExplorerUrls: ["https://mumbai.polygonscan.com"],
    hydroProxyAddress: "0xPOLYGON_MUMBAI_HYDRO_PROXY_PLACEHOLDER",
    hydroTokenAddress: "0xPOLYGON_MUMBAI_HYDRO_TOKEN_PLACEHOLDER",
    wethTokenAddress: "0xPOLYGON_MUMBAI_WETH_TOKEN_PLACEHOLDER",
    apiUrl: "http://localhost:3001/polygon_mumbai",
    wsUrl: "ws://localhost:3002/polygon_mumbai",
  },
  "42161": {
    chainId: "42161",
    chainName: "Arbitrum One",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://arbiscan.io"],
    hydroProxyAddress: "0xARBITRUM_MAINNET_HYDRO_PROXY_PLACEHOLDER",
    hydroTokenAddress: "0xARBITRUM_MAINNET_HYDRO_TOKEN_PLACEHOLDER",
    wethTokenAddress: "0xARBITRUM_MAINNET_WETH_TOKEN_PLACEHOLDER",
    apiUrl: "http://localhost:3001/arbitrum",
    wsUrl: "ws://localhost:3002/arbitrum",
  },
  "421613": {
    chainId: "421613",
    chainName: "Arbitrum Goerli",
    nativeCurrency: {
      name: "Arbitrum Goerli Ether",
      symbol: "AGOR",
      decimals: 18,
    },
    rpcUrls: ["https://goerli-rollup.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://goerli.arbiscan.io"],
    hydroProxyAddress: "0xARBITRUM_GOERLI_HYDRO_PROXY_PLACEHOLDER",
    hydroTokenAddress: "0xARBITRUM_GOERLI_HYDRO_TOKEN_PLACEHOLDER",
    wethTokenAddress: "0xARBITRUM_GOERLI_WETH_TOKEN_PLACEHOLDER",
    apiUrl: "http://localhost:3001/arbitrum_goerli",
    wsUrl: "ws://localhost:3002/arbitrum_goerli",
  },
};

export const defaultNetworkId = "1"; // Default to Ethereum Mainnet if no other config is found

export const getRpcUrl = networkId => {
  const config = networkConfigs[networkId] || networkConfigs[defaultNetworkId];
  return config.rpcUrls[0]; // Return the first RPC URL
};

export const getApiUrl = networkId => {
  const config = networkConfigs[networkId] || networkConfigs[defaultNetworkId];
  return config.apiUrl;
};

export const getWsUrl = networkId => {
  const config = networkConfigs[networkId] || networkConfigs[defaultNetworkId];
  return config.wsUrl;
};

export const getHydroProxyAddress = networkId => {
  const config = networkConfigs[networkId] || networkConfigs[defaultNetworkId];
  return config.hydroProxyAddress;
};

export const getHydroTokenAddress = networkId => {
  const config = networkConfigs[networkId] || networkConfigs[defaultNetworkId];
  return config.hydroTokenAddress;
};

export const getWethTokenAddress = networkId => {
  const config = networkConfigs[networkId] || networkConfigs[defaultNetworkId];
  return config.wethTokenAddress;
};
