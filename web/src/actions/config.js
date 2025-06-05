import { networkConfigs, defaultNetworkId } from "../networks";

export const setCurrentNetworkConfig = config => {
  return {
    type: 'SET_CURRENT_NETWORK_CONFIG',
    payload: config,
  };
};

// Existing setConfigs can be kept if used for other miscellaneous configs,
// or deprecated if all configs are now part of networkConfigs.
// For now, let's assume it might be used for other things.
export const setConfigs = configs => {
  return {
    type: 'SET_CONFIGS',
    payload: configs,
  };
};

export const loadWeb3NetworkID = targetNetworkID => {
  // Ensure targetNetworkID is a string, as our networkConfigs keys are strings
  const targetIdStr = String(targetNetworkID);

  return async (dispatch, getState) => {
    const state = getState();
    const oldWeb3NetworkID = state.config.get('web3NetworkID'); // This is already a string from currentNetworkConfig.chainId

    const newNetworkConfig = networkConfigs[targetIdStr] || networkConfigs[defaultNetworkId];

    if (oldWeb3NetworkID === newNetworkConfig.chainId) {
      // Already on the target network, or config is already set to it.
      // Ensure the full config is in state if it's just an ID match.
      if (state.config.get('currentNetworkConfig').chainId !== newNetworkConfig.chainId) {
        dispatch(setCurrentNetworkConfig(newNetworkConfig));
      }
      return;
    }

    // If there was a previous network ID and it's different, reload.
    // This is kept from original logic to ensure dApp state resets correctly.
    if (oldWeb3NetworkID && oldWeb3NetworkID !== newNetworkConfig.chainId) {
      // Before reloading, set the new config so that after reload,
      // env.js picks up the correct REACT_APP_NETWORK_ID if it was persisted
      // or if the wallet connection dictates the new ID.
      // However, direct persistence to window._env here is tricky and might be out of scope.
      // The reload itself will cause env.js to re-evaluate.
      // For now, we dispatch then reload.
      dispatch(setCurrentNetworkConfig(newNetworkConfig));
      window.location.reload();
    } else {
      // This is likely the initial load or a scenario where oldWeb3NetworkID was not set.
      dispatch(setCurrentNetworkConfig(newNetworkConfig));
    }
  };
};
