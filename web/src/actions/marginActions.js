// web/src/actions/marginActions.js
import api from '../lib/api'; // Assuming your API utility
import * as types from './marginTypes';
import { loadAccountHydroAuthentication } from '../lib/session'; // For auth header if needed by new endpoints
import { getSelectedAccount } from '@gongddex/hydro-sdk-wallet';

// Helper to get authenticated API instance if new endpoints require it
// (api.js already handles this, but good to be mindful)
const getAuthApi = (getState) => {
  const state = getState();
  const selectedAccount = getSelectedAccount(state);
  const address = selectedAccount ? selectedAccount.get('address') : null;
  if (address) { // Only load auth if address is available
    loadAccountHydroAuthentication(address); // Ensure auth header is loaded for api util
  }
  return api;
};


export const fetchMarginPositions = (userAddress) => async (dispatch, getState) => {
  dispatch({ type: types.FETCH_MARGIN_POSITIONS_REQUEST });
  try {
    const authenticatedApi = getAuthApi(getState);
    // Ensure userAddress is passed if required by backend, or backend gets from auth token
    // If API uses auth token to identify user, userAddress might not be needed in query string
    const response = await authenticatedApi.get(`/margin/positions`);
    dispatch({ type: types.FETCH_MARGIN_POSITIONS_SUCCESS, payload: response.data.data || response.data || [] }); // Adjust based on actual API response structure
  } catch (error) {
    dispatch({ type: types.FETCH_MARGIN_POSITIONS_FAILURE, payload: error.message || 'Failed to fetch margin positions' });
  }
};

export const fetchMarginAccountBalances = (userAddress) => async (dispatch, getState) => {
  dispatch({ type: types.FETCH_MARGIN_ACCOUNT_BALANCES_REQUEST });
  try {
    const authenticatedApi = getAuthApi(getState);
    const response = await authenticatedApi.get(`/margin/market_balances`);
    dispatch({ type: types.FETCH_MARGIN_ACCOUNT_BALANCES_SUCCESS, payload: response.data.data || response.data || {} });
  } catch (error) {
    dispatch({ type: types.FETCH_MARGIN_ACCOUNT_BALANCES_FAILURE, payload: error.message || 'Failed to fetch margin account balances' });
  }
};

export const fetchMarketBorrowDetails = (marketID) => async (dispatch, getState) => {
  dispatch({ type: types.FETCH_MARKET_BORROW_DETAILS_REQUEST });
  try {
    // This endpoint might not need auth if it's general market data
    const response = await api.get(`/markets/${marketID}/borrow_details`);
    dispatch({ type: types.FETCH_MARKET_BORROW_DETAILS_SUCCESS, payload: { marketID, details: response.data.data || response.data || {} } });
  } catch (error) {
    dispatch({ type: types.FETCH_MARKET_BORROW_DETAILS_FAILURE, payload: error.message || 'Failed to fetch market borrow details' });
  }
};

export const transferCollateralFunds = (transferData) => async (dispatch, getState) => {
  // transferData: { marketID, assetSymbol, amount, direction, userAddress (can be from getState) }
  dispatch({ type: types.TRANSFER_COLLATERAL_FUNDS_REQUEST });
  try {
    const authenticatedApi = getAuthApi(getState);
    // Backend should get userAddress from auth token
    const { userAddress, ...payload } = transferData;
    await authenticatedApi.post('/margin/transfer_collateral', payload);
    dispatch({ type: types.TRANSFER_COLLATERAL_FUNDS_SUCCESS });

    const currentUserAddress = userAddress || (getSelectedAccount(getState()) ? getSelectedAccount(getState()).get('address') : null);
    if (currentUserAddress) {
        dispatch(fetchMarginAccountBalances(currentUserAddress));
        // May also need to refresh main wallet balances (dispatch action from accountActions.js)
        // Example: dispatch(actionsFromAccount.fetchAccountBalance(currentUserAddress));
    }
  } catch (error) {
    dispatch({ type: types.TRANSFER_COLLATERAL_FUNDS_FAILURE, payload: error.message || 'Failed to transfer collateral funds' });
  }
};

export const addPositionCollateral = (collateralData) => async (dispatch, getState) => {
  // collateralData: { marketID, assetSymbol, amount, userAddress (from getState) }
  dispatch({ type: types.ADD_POSITION_COLLATERAL_REQUEST });
  try {
    const authenticatedApi = getAuthApi(getState);
    const { userAddress, ...payload } = collateralData;
    await authenticatedApi.post('/margin/add_collateral', payload);
    dispatch({ type: types.ADD_POSITION_COLLATERAL_SUCCESS });

    const currentUserAddress = userAddress || (getSelectedAccount(getState()) ? getSelectedAccount(getState()).get('address') : null);
    if (currentUserAddress) {
        dispatch(fetchMarginPositions(currentUserAddress)); // Refresh positions
    }
  } catch (error) {
    dispatch({ type: types.ADD_POSITION_COLLATERAL_FAILURE, payload: error.message || 'Failed to add collateral' });
  }
};

export const repayPositionLoan = (loanData) => async (dispatch, getState) => {
  // loanData: { marketID, assetSymbol, amount, userAddress (from getState) }
  dispatch({ type: types.REPAY_POSITION_LOAN_REQUEST });
  try {
    const authenticatedApi = getAuthApi(getState);
    const { userAddress, ...payload } = loanData;
    await authenticatedApi.post('/margin/repay_loan', payload);
    dispatch({ type: types.REPAY_POSITION_LOAN_SUCCESS });

    const currentUserAddress = userAddress || (getSelectedAccount(getState()) ? getSelectedAccount(getState()).get('address') : null);
    if (currentUserAddress) {
        dispatch(fetchMarginPositions(currentUserAddress)); // Refresh positions
    }
  } catch (error) {
    dispatch({ type: types.REPAY_POSITION_LOAN_FAILURE, payload: error.message || 'Failed to repay loan' });
  }
};
