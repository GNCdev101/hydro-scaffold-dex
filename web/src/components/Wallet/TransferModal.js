// web/src/components/Wallet/TransferModal.js
import React, { useState, useEffect } from 'react';
import BigNumber from 'bignumber.js';

const TransferModal = ({ visible, data, isSubmitting, onSubmit, onClose }) => {
  const [amount, setAmount] = useState('');
  const { marketSymbol, assetSymbol, direction, maxAmount, assetDecimals } = data || {}; // Added default for data

  useEffect(() => {
    // Reset amount if modal data changes (e.g. different asset/direction)
    setAmount('');
  }, [data]);


  if (!visible || !data) return null; // Ensure data is present

  const handleAmountChange = (e) => {
    const value = e.target.value;
     // Allow empty string or valid number
    if (value === '' || (!isNaN(Number(value)) && new BigNumber(value).gte(0))) { // Use Number(value) for isNaN check
      setAmount(value);
    }
  };

  const handleMaxAmount = () => {
    if (maxAmount) { // Ensure maxAmount is available
        setAmount(maxAmount.toString());
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const bnAmount = new BigNumber(amount);
    if (maxAmount && bnAmount.gt(0) && bnAmount.lte(maxAmount)) { // Ensure maxAmount is available
      onSubmit({ amount }); // Pass only amount, other details are in parent state
    } else {
        if (maxAmount && bnAmount.gt(maxAmount)) alert("Amount exceeds maximum available.");
        else alert("Invalid amount.");
    }
  };

  const title = direction === 'TO_MARGIN'
    ? `Deposit ${assetSymbol} to ${marketSymbol} Margin Account`
    : `Withdraw ${assetSymbol} from ${marketSymbol} Margin Account`;

  return (
    <div className="modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="close" onClick={onClose}><span>&times;</span></button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="transferAmount">Amount ({assetSymbol})</label>
                <div className="input-group">
                    <input
                    type="number"
                    className="form-control"
                    id="transferAmount"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    min="0"
                    step="any" // Consider token decimals for step
                    />
                    <div className="input-group-append">
                        <button className="btn btn-outline-secondary" type="button" onClick={handleMaxAmount}>Max</button>
                    </div>
                </div>
                {maxAmount && <small>Max: {maxAmount.toFixed(Math.min(assetDecimals || 8, 5))} {assetSymbol}</small>}
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || new BigNumber(amount).lte(0) || (maxAmount && new BigNumber(amount).gt(maxAmount))}
              >
                {isSubmitting ? 'Processing...' : (direction === 'TO_MARGIN' ? 'Deposit' : 'Withdraw')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransferModal;
