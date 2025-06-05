import React from 'react'; // useEffect was present but not used for class component
import { connect } from 'react-redux';
import { loadMarkets, loadTradeHistory } from './actions/markets';
import { loadWeb3NetworkID } from './actions/config';
import { networkConfigs } from './networks'; // Make sure this is imported
import Header from './components/Header';
import WebsocketConnector from './components/WebsocketConnector';
import OrderBook from './components/Orderbook';
import Trade from './components/Trade';
import Wallet from './components/Wallet';
import Orders from './components/Orders';
import Charts from './components/Charts';
import TradeHistory from './components/TradeHistory';
import { HydroWallet } from '@gongddex/hydro-sdk-wallet/build/wallets';
import { watchWallet } from '@gongddex/hydro-sdk-wallet/build/actions/wallet';
import env from './lib/env';
import MediaQuery from 'react-responsive';
import Fold from './components/Fold';
import PerfectScrollbar from 'perfect-scrollbar';
import { Wallet as SDKWallet } from '@gongddex/hydro-sdk-wallet';
import '@gongddex/hydro-sdk-wallet/index.css';

const mapStateToProps = state => {
  const selectedAccountID = state.WalletReducer.get('selectedAccountID');
  return {
    selectedAccountID,
    currentMarket: state.market.getIn(['markets', 'currentMarket']),
    networkId: state.WalletReducer.getIn(['accounts', selectedAccountID, 'networkId']), // This is from the wallet's state
    appNetworkId: state.config.get('web3NetworkID'), // This is from our app's config reducer
    currentNetworkConfig: state.config.get('currentNetworkConfig'), // Get the full config object
  };
};

class App extends React.PureComponent {
  constructor() {
    super();
    this.state = {
      mobileTab: 'trade'
    };
  }

  componentDidMount() {
    const { dispatch, currentMarket } = this.props;
    dispatch(loadMarkets());
    // Initial network ID sync logic is moved to useEffect below

    if (parseInt(env.NETWORK_ID) === 66) { // env.NETWORK_ID is now from currentNetworkConfig
      this.initTestBrowserWallet();
    }
    if (currentMarket) {
      dispatch(loadTradeHistory(currentMarket.id));
    }
  }

  // useEffect for initial network synchronization
  // This replaces the direct componentDidMount logic for network ID
  // We need to wrap App with connect to get dispatch in useEffect if we convert App to functional component
  // For class components, we can call a method from componentDidMount.
  // Let's add a new method for this.

  initializeNetwork = async () => {
    const { dispatch } = this.props;
    const envNetworkId = env.initialNetworkId;

    if (window.ethereum && window.ethereum.isMetaMask) {
      try {
        const walletChainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const walletNetworkId = String(parseInt(walletChainIdHex, 16));

        if (networkConfigs[walletNetworkId]) { // Check if the wallet's network is one we support
          if (walletNetworkId !== envNetworkId) {
            console.log(`Wallet network (${walletNetworkId}) differs from environment (${envNetworkId}). Syncing to wallet's network.`);
            dispatch(loadWeb3NetworkID(walletNetworkId));
          } else {
            // Wallet and env agree
            dispatch(loadWeb3NetworkID(envNetworkId));
          }
        } else {
          // Wallet's network is not in our supported list, stick to env default
          console.log(`Wallet network ID ${walletNetworkId} not in supported list. Using environment default: ${envNetworkId}`);
          dispatch(loadWeb3NetworkID(envNetworkId));
        }
      } catch (error) {
        console.error("Error fetching wallet chainId, defaulting to environment config:", error);
        dispatch(loadWeb3NetworkID(envNetworkId));
      }
    } else {
      console.log("No MetaMask provider, defaulting to environment config network ID.");
      dispatch(loadWeb3NetworkID(envNetworkId));
    }
  };

  componentDidMount() {
    const { dispatch, currentMarket } = this.props;
    this.initializeNetwork(); // Call the network initialization logic
    dispatch(loadMarkets());
    if (parseInt(env.NETWORK_ID, 10) === 66) { // env.NETWORK_ID is now from currentNetworkConfig
      this.initTestBrowserWallet();
    }
    if (currentMarket) {
      dispatch(loadTradeHistory(currentMarket.id));
    }
  }


  componentDidUpdate(prevProps) {
    const { currentMarket, dispatch } = this.props;
    if (currentMarket !== prevProps.currentMarket) {
      dispatch(loadTradeHistory(currentMarket.id));
    }
  }

  async initTestBrowserWallet() {
    HydroWallet.setNodeUrl(env.NODE_URL);
    const wallet = await HydroWallet.import(
      'B7A0C9D2786FC4DD080EA5D619D36771AEB0C8C26C290AFD3451B92BA2B7BC2C',
      '123456'
    );
    this.props.dispatch(watchWallet(wallet));
  }

  render() {
    const { currentMarket, networkId, selectedAccountID } = this.props;
    if (!currentMarket) {
      return null;
    }
    return (
      <div className="app">
        <SDKWallet title="Starter Kit Wallet" nodeUrl={env.NODE_URL} defaultWalletType="Hydro-Wallet" />
        <WebsocketConnector />
        <Header />
        {/* Use appNetworkId from Redux state for checking against wallet's networkId */}
        {selectedAccountID === 'EXTENSION' && this.props.networkId && this.props.appNetworkId && parseInt(this.props.networkId, 10) !== parseInt(this.props.appNetworkId, 10) && (
          <span className="network-warning bg-warning text-white text-center" style={{ padding: 4 }}>
            Network Error: Switch Metamask's network to {this.getNetworkName()}. Your wallet is on network ID {this.props.networkId}.
          </span>
        )}
        <MediaQuery minWidth={1366}>{this.renderDesktop()}</MediaQuery>
        <MediaQuery minWidth={1024} maxWidth={1365}>
          {this.renderLaptop()}
        </MediaQuery>
        <MediaQuery minWidth={768} maxWidth={1023}>
          {this.renderTablet()}
        </MediaQuery>
        <MediaQuery maxWidth={767}>{this.renderMobile()}</MediaQuery>
      </div>
    );
  }

  setRef(ref) {
    if (ref) {
      this.ps = new PerfectScrollbar(ref, {
        suppressScrollY: true,
        maxScrollbarLength: 20
      });
    }
  }

  getNetworkName() {
    // this.props.appNetworkId is the chainId of the network the app is configured for.
    // this.props.currentNetworkConfig holds the full configuration for that network.
    if (this.props.currentNetworkConfig && this.props.currentNetworkConfig.chainName) {
      return this.props.currentNetworkConfig.chainName;
    }
    // Fallback if currentNetworkConfig is somehow not populated yet
    // env.NETWORK_ID here refers to the one from the import 'env.js', which is the initial one.
    const fallbackConfig = networkConfigs[env.NETWORK_ID] || networkConfigs[defaultNetworkId];
    return fallbackConfig.chainName || ('ID: ' + env.NETWORK_ID);
  }

  renderMobile() {
    const selectTab = this.state.mobileTab;
    let content;
    if (selectTab === 'trade' || !selectTab) {
      content = <Trade />;
    } else if (selectTab === 'orders') {
      content = <Orders />;
    } else if (selectTab === 'charts') {
      content = <Charts />;
    } else if (selectTab === 'orderbook') {
      content = (
        <>
          <div className="title">
            <div>
              <div>Orderbook</div>
              <div className="text-secondary">Available Bid and Ask orders</div>
            </div>
          </div>
          <OrderBook />
        </>
      );
    } else if (selectTab === 'history') {
      content = (
        <>
          <div className="title flex align-items-center">
            <div>Trade History</div>
          </div>
          <TradeHistory />
        </>
      );
    } else if (selectTab === 'wallet') {
      content = <Wallet />;
    }

    return (
      <div className="flex-column flex-1 overflow-hidden">
        <div className="flex-column flex-1">{content}</div>
        <div className="flex nav-tabs overflow-hidden position-relative" ref={ref => this.setRef(ref)}>
          <div className="nav-item flex-1 border-top d-inline-block">
            <div
              onClick={() => this.setState({ mobileTab: 'trade' })}
              className={`tab-button text-secondary text-center${selectTab === 'trade' ? ' active' : ''}`}>
              Trade
            </div>
          </div>
          <div className="nav-item flex-1 border-top d-inline-block">
            <div
              onClick={() => this.setState({ mobileTab: 'orders' })}
              className={`tab-button text-secondary text-center${selectTab === 'orders' ? ' active' : ''}`}>
              Orders
            </div>
          </div>
          <div className="nav-item flex-1 border-top d-inline-block">
            <div
              onClick={() => this.setState({ mobileTab: 'charts' })}
              className={`tab-button text-secondary text-center${selectTab === 'charts' ? ' active' : ''}`}>
              Charts
            </div>
          </div>
          <div className="nav-item flex-1 border-top d-inline-block">
            <div
              onClick={() => this.setState({ mobileTab: 'orderbook' })}
              className={`tab-button text-secondary text-center${selectTab === 'orderbook' ? ' active' : ''}`}>
              Orderbook
            </div>
          </div>
          <div className="nav-item flex-1 border-top d-inline-block">
            <div
              onClick={() => this.setState({ mobileTab: 'history' })}
              className={`tab-button text-secondary text-center${selectTab === 'history' ? ' active' : ''}`}>
              History
            </div>
          </div>
          <div className="nav-item flex-1 border-top d-inline-block">
            <div
              onClick={() => this.setState({ mobileTab: 'wallet' })}
              className={`tab-button text-secondary text-center${selectTab === 'wallet' ? ' active' : ''}`}>
              Wallet
            </div>
          </div>
        </div>
      </div>
    );
  }

  renderTablet() {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-column border-right">
          <div className="grid flex-1">
            <Trade />
          </div>
        </div>
        <div className="flex-column">
          <div className="flex-column flex-1">
            <div className="grid flex-1">
              <Charts />
            </div>
            <Fold className="border-top flex-1 flex-column">
              <div className="" data-fold-item-title="Orderbook">
                <OrderBook />
              </div>
              <div className="" data-fold-item-title="Trade History">
                <TradeHistory />
              </div>
              <div className="" data-fold-item-title="Wallet">
                <Wallet />
              </div>
              <div className="" data-fold-item-title="Orders">
                <Orders />
              </div>
            </Fold>
          </div>
        </div>
      </div>
    );
  }

  renderLaptop() {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-column border-right">
          <div className="grid flex-1">
            <Trade />
          </div>
        </div>
        <Fold className="grid border-right flex-column">
          <div className="grid flex-column" data-fold-item-title="Orderbook">
            <OrderBook />
          </div>
          <div className="grid flex-column" data-fold-item-title="Trade History">
            <TradeHistory />
          </div>
          <div className="grid flex-column" data-fold-item-title="Wallet">
            <Wallet />
          </div>
        </Fold>
        <div className="flex-column flex-1">
          <div className="grid flex-2">
            <Charts />
          </div>
          <div className="grid flex-1 border-top">
            <Orders />
          </div>
        </div>
      </div>
    );
  }

  renderDesktop() {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex">
          <div className="flex-column flex-1 border-right">
            <div className="grid flex-1">
              <Trade />
            </div>
          </div>
          <div className="grid border-right flex-column">
            <div className="title">
              <div>
                <div>Orderbook</div>
                <div className="text-secondary">Available Bid and Ask orders</div>
              </div>
            </div>
            <OrderBook />
          </div>
        </div>
        <div className="flex-column flex-1 border-right">
          <div className="grid flex-2">
            <Charts />
          </div>
          <div className="grid flex-1 border-top">
            <Orders />
          </div>
        </div>
        <div className="flex-column">
          <div className="grid flex-1">
            <div className="title flex align-items-center">
              <div>Trade History</div>
            </div>
            <TradeHistory />
          </div>
          <div className="grid flex-1 border-top">
            <Wallet />
          </div>
        </div>
      </div>
    );
  }
}

export default connect(mapStateToProps)(App);
