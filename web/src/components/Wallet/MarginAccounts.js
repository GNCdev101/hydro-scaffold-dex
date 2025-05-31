// web/src/components/Wallet/MarginAccounts.js
import React from 'react';
import { connect } from 'react-redux';
import BigNumber from 'bignumber.js';
// import { fetchMarginAccountBalances, transferFundsForMargin } from '../../actions/marginActions'; // To be created
import TransferModal from './TransferModal'; // Assumes TransferModal.js is in the same directory
import PerfectScrollbar from 'perfect-scrollbar';
// Assuming Wallet/styles.scss or a global style handles general appearance
// import './styles.scss'; // Or use existing Wallet styles
import { getSelectedAccount } from '@gongddex/hydro-sdk-wallet';
import { stateUtils } from '../../selectors/account';
import {HydroWallet} from "@gongddex/hydro-sdk-wallet/build/wallets";


// Dummy actions for now
const fetchMarginAccountBalances = (address) => ({ type: 'FETCH_MARGIN_ACCOUNT_BALANCES_REQUEST', payload: { address } });
const transferFundsForMargin = (data) => ({ type: 'TRANSFER_COLLATERAL_FUNDS_REQUEST', payload: data });


const mapStateToProps = state => {
  const selectedAccount = getSelectedAccount(state);
  const address = selectedAccount ? selectedAccount.get('address') : null;
  return {
    // Example: { "ETH-USDT": { "USDT": "1000.00", "ETH": "0.5" } }
    marginAccountBalances: state.margin && state.margin.get('accountBalancesByMarket')
                            ? state.margin.get('accountBalancesByMarket').toJS()
                            : {},
    mainWalletBalances: address ? stateUtils.getTokensInfo(state, address) : null, // Immutable.Map of token info
    address,
    markets: state.market.getIn(['markets', 'data']), // Immutable.Map of market ID to market object
    tokens: state.config.get('tokens'), // For decimals, symbols if not in market object
    isLoading: state.margin ? state.margin.get('isLoadingAccountBalances') : false,
    isTransferring: state.margin ? state.margin.get('isTransferringFunds') : false,
  };
};

class MarginAccounts extends React.PureComponent {
  state = {
    showTransferModal: false,
    transferModalData: {
        marketId: null,
        marketSymbol: null, // e.g. ETH-USDT
        assetSymbol: null,
        assetDecimals: 18,
        direction: 'TO_MARGIN', // 'TO_MARGIN' or 'FROM_MARGIN'
        maxAmount: new BigNumber(0)
    },
  };
  ps = null;
  scrollableContainer = null;


  componentDidMount() {
    if (this.props.address) {
      this.props.dispatch(fetchMarginAccountBalances(this.props.address));
    }
    // setScrollbar will be called by the ref callback
  }

  componentDidUpdate(prevProps) {
    if (this.props.address && this.props.address !== prevProps.address) {
      this.props.dispatch(fetchMarginAccountBalances(this.props.address));
    }
    if (this.props.marginAccountBalances !== prevProps.marginAccountBalances && this.ps) {
        this.ps.update();
    }
  }

  componentWillUnmount() {
    if (this.ps) {
      this.ps.destroy();
      this.ps = null;
    }
  }

  setScrollbar = (ref) => {
    if (ref) {
        this.scrollableContainer = ref; // Store the DOM element
        if (this.ps) { // Destroy existing if any
            this.ps.destroy();
        }
        this.ps = new PerfectScrollbar(ref, {
            suppressScrollX: true,
            maxScrollbarLength: 20,
        });
    } else {
         if (this.ps) {
            this.ps.destroy();
            this.ps = null;
         }
         this.scrollableContainer = null; // Clear stored ref
    }
  }

  handleOpenTransferModal = (marketId, marketSymbol, assetSymbol, assetDecimals, direction) => {
    const { mainWalletBalances, marginAccountBalances } = this.props;
    let maxAmount = new BigNumber(0);

    if (direction === 'TO_MARGIN') {
      if (mainWalletBalances) {
        const tokenInfo = mainWalletBalances.find(t => t.get('symbol') === assetSymbol);
        if (tokenInfo) {
          const balance = new BigNumber(tokenInfo.get('balance') || 0);
          const lockedBalance = new BigNumber(tokenInfo.get('lockedBalance') || 0);
          maxAmount = BigNumber.max(0, balance.minus(lockedBalance)).shiftedBy(-assetDecimals);
        }
      }
    } else { // FROM_MARGIN
      const marketBalances = marginAccountBalances[marketId];
      if (marketBalances && marketBalances[assetSymbol]) {
        maxAmount = new BigNumber(marketBalances[assetSymbol]);
        // TODO: Here we should ideally check CollateralAccounts.getTransferableAmount()
        // This requires an async call or having that data pre-fetched.
        // For now, just allowing transfer of full margin balance for that asset.
      }
    }

    this.setState({
      showTransferModal: true,
      transferModalData: { marketId, marketSymbol, assetSymbol, assetDecimals, direction, maxAmount },
    });
  };

  handleSubmitTransfer = async (formData) => {
    const { address } = this.props;
    const { marketId, assetSymbol, direction } = this.state.transferModalData;

    this.props.dispatch(transferFundsForMargin({
      userAddress: address,
      marketID: marketId,
      assetSymbol,
      amount: formData.amount,
      direction,
    }));
    // TODO: Add success/error handling, refresh balances from Redux state update
    this.setState({ showTransferModal: false });
  };

  renderMarketAssets(market) {
    const { marginAccountBalances, tokens } = this.props;
    const marketAssets = [market.baseToken, market.quoteToken]; // Assuming these are symbols
    const marketBalances = marginAccountBalances[market.id] || {};

    return marketAssets.map(assetSymbol => {
      const tokenDetails = tokens && tokens.get(assetSymbol);
      const decimals = tokenDetails ? tokenDetails.get('decimals') : 18;
      const balanceInMargin = new BigNumber(marketBalances[assetSymbol] || 0);

      return (
        <div key={assetSymbol} className="token-row flex justify-content-between align-items-center py-2 border-bottom">
          <div className="asset-symbol">{assetSymbol}</div>
          <div className="asset-balance">
            In Margin: {balanceInMargin.toFixed(Math.min(decimals, 5))}
          </div>
          <div className="asset-actions">
            <button
                className="btn btn-sm btn-outline-success mr-1"
                onClick={() => this.handleOpenTransferModal(market.id, market.id, assetSymbol, decimals, 'TO_MARGIN')}>
                Deposit
            </button>
            <button
                className="btn btn-sm btn-outline-danger"
                disabled={balanceInMargin.lte(0)}
                onClick={() => this.handleOpenTransferModal(market.id, market.id, assetSymbol, decimals, 'FROM_MARGIN')}>
                Withdraw
            </button>
          </div>
        </div>
      );
    });
  }

  render() {
    const { markets, isLoading, isTransferring } = this.props;
    const { showTransferModal, transferModalData } = this.state;

    if (isLoading) {
      return <div className="loading-balances">Loading margin account balances...</div>;
    }

    const displayMarkets = markets ? Array.from(markets.values()) : [];
    // TODO: Filter markets to only show those enabled for margin trading if applicable

    return (
      <div className="margin-accounts-panel flex-column flex-1 p-3">
        <h5>Margin Account Balances</h5>
        <div className="flex-1 position-relative overflow-hidden" ref={this.setScrollbar}>
            {displayMarkets.length === 0 && <p>No markets available for margin trading.</p>}
            {displayMarkets.map(market => (
            <div key={market.id} className="market-section mb-3">
                <h6>{market.id}</h6>
                {this.renderMarketAssets(market)}
            </div>
            ))}
        </div>

        {showTransferModal && (
          <TransferModal
            visible={showTransferModal}
            data={transferModalData}
            isSubmitting={isTransferring}
            onSubmit={this.handleSubmitTransfer}
            onClose={() => this.setState({ showTransferModal: false })}
          />
        )}
      </div>
    );
  }
}

export default connect(mapStateToProps)(MarginAccounts);
