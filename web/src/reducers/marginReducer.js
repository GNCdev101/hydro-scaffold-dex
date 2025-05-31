// web/src/reducers/marginReducer.js
import Immutable from 'immutable';
import * as types from '../actions/marginTypes';

const initialState = Immutable.fromJS({
  positions: [],
  isLoadingPositions: false,
  positionsError: null,

  accountBalancesByMarket: {}, // { marketId: { assetSymbol: balanceStr } }
  isLoadingAccountBalances: false,
  accountBalancesError: null,

  marketBorrowDetails: {}, // { marketId: { borrowableAssets: [...] } }
  isLoadingMarketBorrowDetails: false,
  marketBorrowDetailsError: null,

  isTransferringFunds: false, // For Wallet transfers
  transferError: null,

  isSubmittingMarginAction: false, // Generic for add collateral/repay from positions tab
  marginActionError: null,
});

export default function marginReducer(state = initialState, action) {
  switch (action.type) {
    case types.FETCH_MARGIN_POSITIONS_REQUEST:
      return state.set('isLoadingPositions', true).set('positionsError', null);
    case types.FETCH_MARGIN_POSITIONS_SUCCESS:
      return state.set('isLoadingPositions', false).set('positions', Immutable.fromJS(action.payload || []));
    case types.FETCH_MARGIN_POSITIONS_FAILURE:
      return state.set('isLoadingPositions', false).set('positionsError', action.payload);

    case types.FETCH_MARGIN_ACCOUNT_BALANCES_REQUEST:
      return state.set('isLoadingAccountBalances', true).set('accountBalancesError', null);
    case types.FETCH_MARGIN_ACCOUNT_BALANCES_SUCCESS:
      return state.set('isLoadingAccountBalances', false).set('accountBalancesByMarket', Immutable.fromJS(action.payload || {}));
    case types.FETCH_MARGIN_ACCOUNT_BALANCES_FAILURE:
      return state.set('isLoadingAccountBalances', false).set('accountBalancesError', action.payload);

    case types.FETCH_MARKET_BORROW_DETAILS_REQUEST:
      return state.set('isLoadingMarketBorrowDetails', true).set('marketBorrowDetailsError', null);
    case types.FETCH_MARKET_BORROW_DETAILS_SUCCESS:
      return state.set('isLoadingMarketBorrowDetails', false)
                  .setIn(['marketBorrowDetails', action.payload.marketID], Immutable.fromJS(action.payload.details || {}));
    case types.FETCH_MARKET_BORROW_DETAILS_FAILURE:
      return state.set('isLoadingMarketBorrowDetails', false).set('marketBorrowDetailsError', action.payload);

    case types.TRANSFER_COLLATERAL_FUNDS_REQUEST:
      return state.set('isTransferringFunds', true).set('transferError', null);
    case types.TRANSFER_COLLATERAL_FUNDS_SUCCESS:
      return state.set('isTransferringFunds', false);
    case types.TRANSFER_COLLATERAL_FUNDS_FAILURE:
      return state.set('isTransferringFunds', false).set('transferError', action.payload);

    case types.ADD_POSITION_COLLATERAL_REQUEST:
    case types.REPAY_POSITION_LOAN_REQUEST:
      return state.set('isSubmittingMarginAction', true).set('marginActionError', null);
    case types.ADD_POSITION_COLLATERAL_SUCCESS:
    case types.REPAY_POSITION_LOAN_SUCCESS:
      return state.set('isSubmittingMarginAction', false);
    case types.ADD_POSITION_COLLATERAL_FAILURE:
    case types.REPAY_POSITION_LOAN_FAILURE:
      return state.set('isSubmittingMarginAction', false).set('marginActionError', action.payload);

    default:
      return state;
  }
}
