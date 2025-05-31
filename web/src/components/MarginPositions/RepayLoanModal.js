// web/src/components/MarginPositions/RepayLoanModal.js
import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import BigNumber from 'bignumber.js';
import { getSelectedAccount } from '@gongddex/hydro-sdk-wallet';
import { stateUtils } from '../../selectors/account'; // For fetching token balances

const RepayLoanModal = ({ visible, position, markets, onSubmit, onClose, isSubmitting, address, mainWalletBalances }) => {
  const [amount, setAmount] = useState('');
  const [availableBalance, setAvailableBalance] = useState(new BigNumber(0));

  const marketInfo = markets && position && markets.get(position.marketId);
  const borrowedAssetSymbol = position ? position.borrowedAssetSymbol : '';

  useEffect(() => {
    if (address && borrowedAssetSymbol && mainWalletBalances) {
        const tokenInfo = mainWalletBalances.find(t => t.get('symbol') === borrowedAssetSymbol);
        if (tokenInfo) {
            const balance = new BigNumber(tokenInfo.get('balance') || 0);
            const lockedBalance = new BigNumber(tokenInfo.get('lockedBalance') || 0);
            const decimals = tokenInfo.get('decimals') || 18;
            setAvailableBalance(BigNumber.max(0, balance.minus(lockedBalance)).shiftedBy(-decimals));
        } else {
           setAvailableBalance(new BigNumber(0));
        }
    }
  }, [address, borrowedAssetSymbol, mainWalletBalances]);


  if (!visible || !position) return null;

  const borrowedAmountBN = new BigNumber(position.borrowedAmount);
  // const accruedInterestBN = new BigNumber(position.accruedInterest || 0); // Assuming interest is part of borrowedAmount from API for now
  const totalDebt = borrowedAmountBN; // .plus(accruedInterestBN) - needs clarity on how interest is presented
  const priceDecimals = marketInfo ? marketInfo.priceDecimals : 2;


  const handleAmountChange = (e) => {
    const value = e.target.value;
    if (!isNaN(Number(value)) && new BigNumber(value).gte(0)) { // Allow decimal input
      setAmount(value);
    } else if (value === '') {
      setAmount('');
    }
  };

  const handleMaxAmount = () => {
    // User can repay up to their available balance of the borrowed asset, or up to the total debt, whichever is smaller
    setAmount(BigNumber.min(availableBalance, totalDebt).toString());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const repayAmountBN = new BigNumber(amount);
    if (repayAmountBN.gt(0) && repayAmountBN.lte(availableBalance) && repayAmountBN.lte(totalDebt)) {
      onSubmit({
          amount,
          assetSymbol: borrowedAssetSymbol
        });
    } else {
        if (repayAmountBN.gt(availableBalance)) alert("Insufficient balance to repay this amount.");
        else if (repayAmountBN.gt(totalDebt)) alert("Repayment amount exceeds total debt.");
        else alert("Invalid amount.");
    }
  };

  return (
    <div className="modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Repay Loan for {marketInfo ? marketInfo.id : position.marketId}</h5>
            <button type="button" className="close" onClick={onClose}><span>&times;</span></button>
          </div>
          <div className="modal-body">
            <p>Borrowed: {new BigNumber(position.borrowedAmount).toFixed(priceDecimals)} {borrowedAssetSymbol}</p>
            {/* <p>Accrued Interest: {new BigNumber(position.accruedInterest || 0).toFixed(priceDecimals)} {borrowedAssetSymbol}</p> */}
            <p>Total Debt (approx.): {totalDebt.toFixed(priceDecimals)} {borrowedAssetSymbol}</p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="repayAmount">Amount to Repay ({borrowedAssetSymbol})</label>
                 <div className="input-group">
                    <input
                    type="number"
                    className="form-control"
                    id="repayAmount"
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
                <small>Available in wallet: {availableBalance.toFixed(priceDecimals)} {borrowedAssetSymbol}</small>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting || new BigNumber(amount).lte(0) || new BigNumber(amount).gt(availableBalance) || new BigNumber(amount).gt(totalDebt)}>
                {isSubmitting ? 'Submitting...' : 'Repay Loan'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

const modalMapStateToProps = state => {
  const selectedAccount = getSelectedAccount(state);
  const address = selectedAccount ? selectedAccount.get('address') : null;
  return {
    address,
    mainWalletBalances: address ? stateUtils.getTokensInfo(state, address) : null,
  };
};

export default connect(modalMapStateToProps)(RepayLoanModal);
