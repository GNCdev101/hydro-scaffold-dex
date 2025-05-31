// web/src/components/MarginPositions/index.js
import React from 'react';
import { connect } from 'react-redux';
import BigNumber from 'bignumber.js';
// import { fetchMarginPositions, submitAddCollateral, submitRepayLoan } from '../../actions/marginActions'; // To be created
import AddCollateralModal from './AddCollateralModal';
import RepayLoanModal from './RepayLoanModal';
import PerfectScrollbar from 'perfect-scrollbar';
import './styles.scss';
import { getSelectedAccount } from '@gongddex/hydro-sdk-wallet';
import {HydroWallet} from "@gongddex/hydro-sdk-wallet/build/wallets"; // For address formatting if needed

// Dummy actions for now - these should be in actions/marginActions.js
const fetchMarginPositions = (address) => ({ type: 'FETCH_MARGIN_POSITIONS_REQUEST', payload: { address } });
const submitAddCollateral = (data) => ({ type: 'ADD_POSITION_COLLATERAL_REQUEST', payload: data });
const submitRepayLoan = (data) => ({ type: 'REPAY_POSITION_LOAN_REQUEST', payload: data });


const mapStateToProps = state => {
  const selectedAccount = getSelectedAccount(state);
  const address = selectedAccount ? selectedAccount.get('address') : null;
  return {
    marginPositions: state.margin && state.margin.get('positions') ? state.margin.get('positions').toJS() : [], // Ensure .toJS() if Immutable List
    isLoadingMarginPositions: state.margin ? state.margin.get('isLoadingPositions') : false,
    address,
    markets: state.market.getIn(['markets', 'data']), // Map of market ID to market object
    // prices: state.market.get('prices') // Map of market ID to current price - assuming this structure
    // For placeholder, generate some prices if not available
    prices: state.market.get('prices') || new Map([['ETH-USDT', new BigNumber(3000)], ['BTC-USDT', new BigNumber(40000)]])
  };
};

class MarginPositionsTab extends React.PureComponent {
  state = {
    showAddCollateralModal: false,
    showRepayLoanModal: false,
    selectedPositionForModal: null,
    isSubmittingModal: false,
  };

  ps = null;
  scrollableContainer = null; // Added to store the ref DOM element

  componentDidMount() {
    if (this.props.address) {
      this.props.dispatch(fetchMarginPositions(this.props.address));
    }
    // setScrollbar will be called by the ref callback
  }

  componentDidUpdate(prevProps) {
    if (this.props.address && this.props.address !== prevProps.address) {
      this.props.dispatch(fetchMarginPositions(this.props.address));
    }
    if (this.props.marginPositions !== prevProps.marginPositions) {
        if (this.ps) this.ps.update();
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
         // This case might be hit if the component re-renders and the ref is temporarily null
         // or during unmounting.
         if (this.ps) {
            this.ps.destroy();
            this.ps = null;
         }
         this.scrollableContainer = null; // Clear stored ref
    }
  }


  handleAddCollateralClick = (position) => {
    this.setState({ selectedPositionForModal: position, showAddCollateralModal: true });
  };

  handleRepayLoanClick = (position) => {
    this.setState({ selectedPositionForModal: position, showRepayLoanModal: true });
  };

  handleSubmitAddCollateral = async (formData) => {
    const { address } = this.props;
    const { selectedPositionForModal } = this.state;
    if (!selectedPositionForModal || !address) return;

    this.setState({ isSubmittingModal: true });
    try {
      await this.props.dispatch(submitAddCollateral({
        userAddress: address,
        marketID: selectedPositionForModal.marketId, // Assuming position has marketId
        assetSymbol: formData.assetSymbol, // Or derive if fixed
        amount: formData.amount,
      }));
      this.props.dispatch(fetchMarginPositions(address)); // Refresh positions
    } catch (error) {
      console.error("Failed to add collateral", error);
      // Handle error display to user
    }
    this.setState({ showAddCollateralModal: false, selectedPositionForModal: null, isSubmittingModal: false });
  };

  handleSubmitRepayLoan = async (formData) => {
    const { address } = this.props;
    const { selectedPositionForModal } = this.state;
    if (!selectedPositionForModal || !address) return;

    this.setState({ isSubmittingModal: true });
    try {
      await this.props.dispatch(submitRepayLoan({
        userAddress: address,
        marketID: selectedPositionForModal.marketId,
        assetSymbol: selectedPositionForModal.borrowedAssetSymbol, // Repay the borrowed asset
        amount: formData.amount,
      }));
      this.props.dispatch(fetchMarginPositions(address)); // Refresh positions
    } catch (error) {
      console.error("Failed to repay loan", error);
    }
    this.setState({ showRepayLoanModal: false, selectedPositionForModal: null, isSubmittingModal: false });
  };

  getMarketDisplayId = (marketId) => {
    const { markets } = this.props;
    if (markets && markets.get(marketId)) {
      return markets.get(marketId).id; // e.g. "ETH-USDT"
    }
    return marketId;
  }

  getCurrentMarkPrice = (marketId) => {
    const { prices } = this.props;
    // Assuming prices is a Map with marketId as key and BigNumber price as value
    return prices && prices.get(marketId) ? prices.get(marketId) : new BigNumber(0);
  }

  calculateUnrealizedPnL = (position) => {
    const markPrice = this.getCurrentMarkPrice(position.marketId);
    if (!markPrice || markPrice.eq(0) || !position.entryPrice || !position.positionSizeAssetUnits) {
      return new BigNumber(0);
    }
    const entryPrice = new BigNumber(position.entryPrice);
    const positionSize = new BigNumber(position.positionSizeAssetUnits);

    let pnl = new BigNumber(0);
    if (position.side && position.side.toLowerCase() === 'long') {
      pnl = markPrice.minus(entryPrice).multipliedBy(positionSize);
    } else if (position.side && position.side.toLowerCase() === 'short') {
      pnl = entryPrice.minus(markPrice).multipliedBy(positionSize);
    }
    // This PnL is in quote asset.
    return pnl;
  }


  render() {
    const { marginPositions, isLoadingMarginPositions, markets } = this.props;
    const { showAddCollateralModal, showRepayLoanModal, selectedPositionForModal, isSubmittingModal } = this.state;

    if (isLoadingMarginPositions) {
      return <div className="loading-positions">Loading margin positions...</div>;
    }

    if (!marginPositions || marginPositions.length === 0) {
      return <div className="no-positions">No open margin positions.</div>;
    }

    return (
      <div className="margin-positions-tab flex-column flex-1">
        <div className="table-responsive flex-1 position-relative" ref={this.setScrollbar}>
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Side</th>
                <th>Leverage</th>
                <th>Size</th>
                <th>Entry Price</th>
                <th>Mark Price</th>
                <th>Collateral</th>
                <th>Borrowed</th>
                {/* <th>Interest</th> */}
                <th>Liq. Price (Est.)</th>
                <th>Unrealized P&L</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {marginPositions.map((pos, index) => {
                const marketDisplay = this.getMarketDisplayId(pos.marketId);
                const markPrice = this.getCurrentMarkPrice(pos.marketId);
                const pnl = this.calculateUnrealizedPnL(pos);
                const pnlClass = pnl.isPositive() ? 'text-success' : pnl.isNegative() ? 'text-danger' : '';
                const quoteSymbol = markets && markets.get(pos.marketId) ? markets.get(pos.marketId).quoteToken : '';
                const marketData = markets && markets.get(pos.marketId);
                const priceDecimals = marketData ? marketData.priceDecimals : 2;
                const amountDecimals = marketData ? marketData.amountDecimals : 4;


                return (
                  <tr key={pos.id || index}> {/* Assuming pos has a unique id */}
                    <td>{marketDisplay}</td>
                    <td>{pos.side}</td>
                    <td>{pos.leverage}x</td>
                    <td>{new BigNumber(pos.positionSizeAssetUnits).toFixed(amountDecimals)} {pos.baseAssetSymbol}</td>
                    <td>{new BigNumber(pos.entryPrice).toFixed(priceDecimals)} {quoteSymbol}</td>
                    <td>{markPrice.toFixed(priceDecimals)} {quoteSymbol}</td>
                    <td>{new BigNumber(pos.collateralAmount).toFixed(priceDecimals)} {pos.collateralAssetSymbol}</td>
                    <td>{new BigNumber(pos.borrowedAmount).toFixed(priceDecimals)} {pos.borrowedAssetSymbol}</td>
                    {/* <td>{new BigNumber(pos.accruedInterest).toFixed(priceDecimals)} {pos.borrowedAssetSymbol}</td> */}
                    <td>{new BigNumber(pos.currentLiquidationPrice).toFixed(priceDecimals)} {quoteSymbol}</td>
                    <td className={pnlClass}>{pnl.toFixed(priceDecimals)} {quoteSymbol}</td>
                    <td>
                      <button className="btn btn-sm btn-outline-primary mr-1" onClick={() => this.handleAddCollateralClick(pos)}>Add Collateral</button>
                      <button className="btn btn-sm btn-outline-warning" onClick={() => this.handleRepayLoanClick(pos)}>Repay Loan</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {showAddCollateralModal && selectedPositionForModal && (
          <AddCollateralModal
            visible={showAddCollateralModal}
            position={selectedPositionForModal}
            isSubmitting={isSubmittingModal}
            markets={markets}
            onSubmit={this.handleSubmitAddCollateral}
            onClose={() => this.setState({ showAddCollateralModal: false, selectedPositionForModal: null })}
          />
        )}
        {showRepayLoanModal && selectedPositionForModal && (
          <RepayLoanModal
            visible={showRepayLoanModal}
            position={selectedPositionForModal}
            isSubmitting={isSubmittingModal}
            markets={markets}
            onSubmit={this.handleSubmitRepayLoan}
            onClose={() => this.setState({ showRepayLoanModal: false, selectedPositionForModal: null })}
          />
        )}
      </div>
    );
  }
}

export default connect(mapStateToProps)(MarginPositionsTab);
