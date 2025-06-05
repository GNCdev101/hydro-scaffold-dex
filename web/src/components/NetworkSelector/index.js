import React, { useCallback } from "react";
import { connect } from "react-redux";
import { networkConfigs } from "../../networks";
import { loadWeb3NetworkID } from "../../actions/config";
import "./styles.scss";

const NetworkSelector = ({ currentNetworkId, loadWeb3NetworkIDDispatch }) => {
  const handleNetworkChange = useCallback(
    async event => {
      const targetNetworkID = event.target.value;
      const targetConfig = networkConfigs[targetNetworkID];

      if (!targetConfig) {
        console.error(`No config found for network ID: ${targetNetworkID}`);
        return;
      }

      if (!window.ethereum) {
        alert("MetaMask is not installed. Please install it to switch networks.");
        return;
      }

      try {
        // Try to switch to the network
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${parseInt(targetConfig.chainId, 10).toString(16)}` }],
        });
        loadWeb3NetworkIDDispatch(targetNetworkID);
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${parseInt(targetConfig.chainId, 10).toString(16)}`,
                  chainName: targetConfig.chainName,
                  nativeCurrency: targetConfig.nativeCurrency,
                  rpcUrls: targetConfig.rpcUrls,
                  blockExplorerUrls: targetConfig.blockExplorerUrls,
                },
              ],
            });
            // After adding, attempt to switch again or assume it switched
            loadWeb3NetworkIDDispatch(targetNetworkID);
          } catch (addError) {
            console.error("Failed to add network:", addError);
            alert(`Failed to add network ${targetConfig.chainName}. Please add it manually in MetaMask.`);
          }
        } else {
          console.error("Failed to switch network:", switchError);
          alert(`Failed to switch to network ${targetConfig.chainName}.`);
        }
      }
    },
    [loadWeb3NetworkIDDispatch]
  );

  return (
    <div className="network-selector-container">
      <select className="network-selector-select" value={currentNetworkId || ""} onChange={handleNetworkChange}>
        {Object.values(networkConfigs).map(config => (
          <option key={config.chainId} value={config.chainId}>
            {config.chainName}
          </option>
        ))}
      </select>
    </div>
  );
};

const mapStateToProps = state => ({
  currentNetworkId: state.config.get("web3NetworkID"),
});

const mapDispatchToProps = dispatch => ({
  loadWeb3NetworkIDDispatch: networkId => dispatch(loadWeb3NetworkID(networkId)),
});

export default connect(mapStateToProps, mapDispatchToProps)(NetworkSelector);
