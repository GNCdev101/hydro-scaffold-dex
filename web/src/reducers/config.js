import { Map } from 'immutable';
import BigNumber from 'bignumber.js';
import env from '../lib/env'; // env will now use the initialNetworkId

// Get the initial network configuration based on initialNetworkId from env.js
const initialNetworkConfig = env.getNetworkConfig(env.initialNetworkId);

const initialState = Map({
  WETH: { // This might become redundant if WETH_TOKEN_ADDRESS is part of currentNetworkConfig
    address: initialNetworkConfig.wethTokenAddress,
    symbol: 'WETH', // Symbol might also come from currentNetworkConfig if it's the native wrapped token
    decimals: 18, // Or initialNetworkConfig.nativeCurrency.decimals if WETH is native
  },
  hotTokenAmount: new BigNumber(0),
  websocketConnected: false,
  web3NetworkID: env.initialNetworkId, // Store the initial network ID
  currentNetworkConfig: initialNetworkConfig, // Store the full config object
});

export default (state = initialState, action) => {
  switch (action.type) {
    case 'SET_CONFIGS': // This action might need to be deprecated or updated
      for (const key of Object.keys(action.payload)) {
        state = state.set(key, action.payload[key]);
      }
      return state;
    case 'SET_CURRENT_NETWORK_CONFIG':
      return state
        .set('currentNetworkConfig', action.payload)
        .set('web3NetworkID', action.payload.chainId) // Ensure web3NetworkID is also updated
        .setIn(['WETH', 'address'], action.payload.wethTokenAddress); // Update WETH address dynamically
    default:
      return state;
  }
};
