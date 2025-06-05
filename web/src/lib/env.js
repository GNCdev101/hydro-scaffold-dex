import { networkConfigs, defaultNetworkId } from "../networks";

let _env = process.env;

// In a deployed environment, process.env might not be directly available in the browser,
// so we fall back to window._env, which should be populated by public/config.js
if (!_env.REACT_APP_NETWORK_ID && window._env) {
  _env = window._env;
}

const currentNetworkId = _env.REACT_APP_NETWORK_ID || defaultNetworkId;

export const getNetworkConfig = networkId => {
  return networkConfigs[networkId] || networkConfigs[defaultNetworkId];
};

const currentConfig = getNetworkConfig(currentNetworkId);

export default {
  API_ADDRESS: currentConfig.apiUrl,
  WS_ADDRESS: currentConfig.wsUrl,
  NODE_URL: currentConfig.rpcUrls[0], // Use the first RPC URL from the list
  HYDRO_PROXY_ADDRESS: currentConfig.hydroProxyAddress,
  HYDRO_TOKEN_ADDRESS: currentConfig.hydroTokenAddress,
  WETH_TOKEN_ADDRESS: currentConfig.wethTokenAddress,
  NETWORK_ID: currentConfig.chainId, // This is the chainId from the config
  CHAIN_NAME: currentConfig.chainName, // Add chain name for convenience
  NATIVE_CURRENCY: currentConfig.nativeCurrency, // Add native currency for convenience
  BLOCK_EXPLORER_URLS: currentConfig.blockExplorerUrls, // Add block explorer for convenience
  // It's good practice to also export the function to get any network's config
  getNetworkConfig,
  // And the full map if needed elsewhere, though typically consumed via getNetworkConfig
  networkConfigs,
  // The initially determined network ID based on environment
  initialNetworkId: currentNetworkId,
};
