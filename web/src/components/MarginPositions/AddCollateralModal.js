// web/src/components/MarginPositions/AddCollateralModal.js
import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import BigNumber from 'bignumber.js';
import { getSelectedAccount } from '@gongddex/hydro-sdk-wallet';
import { stateUtils } from '../../selectors/account'; // For fetching token balances


const AddCollateralModal = ({ visible, position, markets, onSubmit, onClose, isSubmitting, address, dispatch, mainWalletBalances }) => {
  const [amount, setAmount] = useState('');
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState(''); // e.g., position.collateralAssetSymbol or quoteToken of market
  const [availableBalance, setAvailableBalance] = useState(new BigNumber(0));

  const marketInfo = markets && position && markets.get(position.marketId);

  useEffect(() => {
    if (position && marketInfo) {
        // Default to quote token for collateral, or allow selection if more complex
        const defaultCollateralSymbol = marketInfo.quoteToken;
        setSelectedAssetSymbol(defaultCollateralSymbol);

        if (address && mainWalletBalances) {
            const tokenInfo = mainWalletBalances.find(t => t.get('symbol') === defaultCollateralSymbol);
            if (tokenInfo) {
                const balance = new BigNumber(tokenInfo.get('balance') || 0);
                const lockedBalance = new BigNumber(tokenInfo.get('lockedBalance') || 0);
                const decimals = tokenInfo.get('decimals') || 18;
                setAvailableBalance(BigNumber.max(0, balance.minus(lockedBalance)).shiftedBy(-decimals));
            } else {
                setAvailableBalance(new BigNumber(0));
            }
        }
    }
  }, [position, marketInfo, address, mainWalletBalances]);


  if (!visible || !position) return null;

  const handleAmountChange = (e) => {
    const value = e.target.value;
    if (!isNaN(Number(value)) && new BigNumber(value).gte(0)) { // Allow decimal input
      setAmount(value);
    } else if (value === '') {
      setAmount('');
    }
  };

  const handleMaxAmount = () => {
    setAmount(availableBalance.toString());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (new BigNumber(amount).gt(0) && new BigNumber(amount).lte(availableBalance)) {
      onSubmit({
          amount,
          assetSymbol: selectedAssetSymbol
        });
    } else {
        alert("Invalid amount or insufficient balance.");
    }
  };

  const collateralAssetForDisplay = selectedAssetSymbol || (marketInfo ? marketInfo.quoteToken : 'N/A');
  const priceDecimals = marketInfo ? marketInfo.priceDecimals : 2;


  return (
    <div className="modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Add Collateral to {marketInfo ? marketInfo.id : position.marketId}</h5>
            <button type="button" className="close" onClick={onClose}><span>&times;</span></button>
          </div>
          <div className="modal-body">
            <p>Current Collateral: {new BigNumber(position.collateralAmount).toFixed(priceDecimals)} {position.collateralAssetSymbol}</p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="collateralAmount">Amount to Add ({collateralAssetForDisplay})</label>
                <div className="input-group">
                    <input
                    type="number"
                    className="form-control"
                    id="collateralAmount"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    min="0"
                    step="any"
                    />
                    <div className="input-group-append">
                        <button className="btn btn-outline-secondary" type="button" onClick={handleMaxAmount}>Max</button>
                    </div>
                </div>
                <small>Available in wallet: {availableBalance.toFixed(priceDecimals)} {collateralAssetForDisplay}</small>
              </div>
              {/* TODO: Add asset selector if multiple collateral types are allowed */}
              <button type="submit" className="btn btn-primary" disabled={isSubmitting || new BigNumber(amount).lte(0) || new BigNumber(amount).gt(availableBalance) }>
                {isSubmitting ? 'Submitting...' : 'Add Collateral'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

// Need to connect to get mainWalletBalances for the selected asset
const modalMapStateToProps = state => {
  const selectedAccount = getSelectedAccount(state);
  const address = selectedAccount ? selectedAccount.get('address') : null;
  return {
    address,
    mainWalletBalances: address ? stateUtils.getTokensInfo(state, address) : null, // from Tokens.js
  };
};


export default connect(modalMapStateToProps)(AddCollateralModal);
