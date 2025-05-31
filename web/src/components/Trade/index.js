import React from 'react';
import { connect } from 'react-redux';
import { formValueSelector, Field, stopSubmit, change as changeFieldValue } from 'redux-form'; // Added changeFieldValue
import { TRADE_FORM_ID } from '../../actions/trade'; // Assuming trade action is updated
import { reduxForm } from 'redux-form';
import { trade } from '../../actions/trade';
import BigNumber from 'bignumber.js';
import { loadHotDiscountRules, getHotTokenAmount } from '../../actions/fee';
import { calculateTrade } from '../../lib/tradeCalculator';
import { loginRequest } from '../../actions/account';
import PerfectScrollbar from 'perfect-scrollbar';
import './styles.scss';
import { sleep, toUnitAmount } from '../../lib/utils';
import { getSelectedAccount } from '@gongddex/hydro-sdk-wallet';
import { stateUtils } from '../../selectors/account';
// import { fetchMarketBorrowDetails } from '../../actions/marginActions'; // To be created

const mapStateToProps = state => {
  const selector = formValueSelector(TRADE_FORM_ID);
  const currentMarket = state.market.getIn(['markets', 'currentMarket']);
  const selectedAccount = getSelectedAccount(state);
  const address = selectedAccount ? selectedAccount.get('address') : null;

  // Margin related state (assuming structure from marginReducer)
  // const marketBorrowDetails = currentMarket ? state.margin.getIn(['marketBorrowDetails', currentMarket.id]) : null;
  // const borrowableAssetInfo = marketBorrowDetails && marketBorrowDetails.get('borrowableAssets') && marketBorrowDetails.get('borrowableAssets').first(); // Example: get first borrowable

  // For now, using placeholder borrow info, actual fetching needs action/reducer
   const placeholderBorrowInfo = currentMarket ? {
    asset: currentMarket.side === 'buy' ? currentMarket.quoteToken : currentMarket.baseToken, // Simplistic assumption
    annualRate: new BigNumber('0.05'), // 5% APR placeholder
    liquidityUSD: new BigNumber('1000000'),
  } : null;


  return {
    initialValues: {
      side: 'buy',
      orderType: 'limit',
      price: currentMarket ? currentMarket.lastPrice || new BigNumber(0) : new BigNumber(0),
      amount: new BigNumber(0),
      // from calculator
      subtotal: new BigNumber(0),
      total: new BigNumber(0), // Represents user's cost/proceeds for the trade action
      totalBase: new BigNumber(0), // Base amount from trade
      feeRate: new BigNumber(0),
      gasFee: new BigNumber(0),
      hotDiscount: new BigNumber(1),
      tradeFee: new BigNumber(0),
      estimatedPrice: new BigNumber(0), // For market orders

      // Margin fields
      isMargin: false,
      leverage: 2, // Default leverage
      estimatedLiquidationPrice: new BigNumber(0),
      userCollateralCommitted: new BigNumber(0), // In quote asset terms for simplicity here
      borrowedAmount: new BigNumber(0),         // In quote asset terms for simplicity here
      totalPositionValue: new BigNumber(0),    // Total value of the leveraged position
    },
    lastPrice: currentMarket ? currentMarket.lastPrice || new BigNumber(0) : new BigNumber(0),
    currentMarket,
    quoteTokenBalance: address && currentMarket ? stateUtils.getTokenAvailableBalance(state, address, currentMarket.quoteToken) : new BigNumber(0),
    baseTokenBalance: address && currentMarket ? stateUtils.getTokenAvailableBalance(state, address, currentMarket.baseToken) : new BigNumber(0),
    hotTokenAmount: state.config.get('hotTokenAmount') || new BigNumber(0),
    address,
    isLoggedIn: address ? state.account.getIn(['isLoggedIn', address]) : false,

    // Form values
    price: new BigNumber(selector(state, 'price') || 0),
    amount: new BigNumber(selector(state, 'amount') || 0),
    side: selector(state, 'side') || 'buy',
    orderType: selector(state, 'orderType') || 'limit',
    isMargin: selector(state, 'isMargin') || false,
    leverage: new BigNumber(selector(state, 'leverage') || 2),

    // Calculated values from form state (populated by updateTradeCalculations)
    subtotal: new BigNumber(selector(state, 'subtotal') || 0),
    total: new BigNumber(selector(state, 'total') || 0), // User's cost/proceeds
    totalBase: new BigNumber(selector(state, 'totalBase') || 0),
    feeRate: new BigNumber(selector(state, 'feeRate') || 0),
    gasFee: new BigNumber(selector(state, 'gasFee') || 0),
    hotDiscount: new BigNumber(selector(state, 'hotDiscount') || 1),
    tradeFee: new BigNumber(selector(state, 'tradeFee') || 0),
    estimatedPrice: new BigNumber(selector(state, 'estimatedPrice') || 0),
    estimatedLiquidationPrice: new BigNumber(selector(state, 'estimatedLiquidationPrice') || 0),
    userCollateralCommitted: new BigNumber(selector(state, 'userCollateralCommitted') || 0),
    borrowedAmount: new BigNumber(selector(state, 'borrowedAmount') || 0),
    totalPositionValue: new BigNumber(selector(state, 'totalPositionValue') || 0),

    // Borrow Info (placeholder, replace with actual fetched data)
    borrowAssetInfo: placeholderBorrowInfo, // e.g. { asset: 'USDT', annualRate: BigNumber(0.05) }
    // marketLiquidationThreshold from currentMarket, e.g., currentMarket.liquidateRate (needs to be on market object)
    marketLiquidationThreshold: currentMarket ? new BigNumber(currentMarket.liquidateRate || 1.15) : new BigNumber(1.15),


  };
};

class Trade extends React.PureComponent {
  componentDidMount() {
    const { dispatch, currentMarket } = this.props;
    dispatch(loadHotDiscountRules()); // Existing
    this.ps = null; // Initialize ps for setRef

    if (currentMarket) {
      // dispatch(fetchMarketBorrowDetails(currentMarket.id)); // TODO: Implement and dispatch this
      this.updateAllCalculations(); // Initial calculation
    }
    this.interval = window.setInterval(() => {
      if (this.props.address) { // Check if address exists before dispatching
         dispatch(getHotTokenAmount());
      }
    }, 30 * 1000);
  }

  componentWillUnmount() {
    if (this.interval) {
      window.clearInterval(this.interval);
    }
    if (this.ps) {
      this.ps.destroy();
      this.ps = null;
    }
  }

  componentDidUpdate(prevProps) {
    const { currentMarket, side, price, amount, isMargin, leverage, hotTokenAmount, orderType, dispatch, address } = this.props;

    if (currentMarket && currentMarket.id !== (prevProps.currentMarket ? prevProps.currentMarket.id : null)) {
      this.props.reset(); // Reset form on market change
      // dispatch(fetchMarketBorrowDetails(currentMarket.id)); // TODO: Fetch for new market
      this.updateAllCalculations();
      return; // Return early as other checks might use prevProps of old market
    }

    // Check if any relevant prop for calculation has changed
    if (
      currentMarket && (
      orderType !== prevProps.orderType ||
      side !== prevProps.side ||
      !price.eq(prevProps.price) ||
      !amount.eq(prevProps.amount) ||
      isMargin !== prevProps.isMargin ||
      !leverage.eq(prevProps.leverage) ||
      (hotTokenAmount && !hotTokenAmount.eq(prevProps.hotTokenAmount)) || // Ensure hotTokenAmount exists
      address !== prevProps.address // Recalculate if user logs in/out for balance checks
      )
    ) {
      this.updateAllCalculations();
    }
  }

  updateAllCalculations = () => {
    const {
        currentMarket, orderType, side, price, amount, hotTokenAmount,
        isMargin, leverage, marketLiquidationThreshold, dispatch // dispatch from props
    } = this.props;

    if (!currentMarket || price.isNaN() || amount.isNaN() || leverage.isNaN()) {
        return;
    }

    const { asMakerFeeRate, asTakerFeeRate, gasFeeAmount, priceDecimals, amountDecimals, baseTokenDecimals, quoteTokenDecimals } = currentMarket;

    const calculateParam = {
      orderType,
      side,
      price,
      amount,
      hotTokenAmount: hotTokenAmount || new BigNumber(0), // Default if undefined
      gasFeeAmount: new BigNumber(gasFeeAmount || 0), // Default if undefined
      asMakerFeeRate: new BigNumber(asMakerFeeRate || 0),
      asTakerFeeRate: new BigNumber(asTakerFeeRate || 0),
      amountDecimals: amountDecimals || 8, // Default if undefined
      priceDecimals: priceDecimals || 8,   // Default if undefined
      baseTokenDecimals: baseTokenDecimals || 18,  // Default if undefined
      quoteTokenDecimals: quoteTokenDecimals || 18, // Default if undefined

      // Margin params
      isMargin,
      leverage,
      marketLiquidationThreshold,
      // collateralAssetPriceUSD: new BigNumber(1), // Placeholder, ideally from oracle
      // borrowAssetInterestRate: this.props.borrowAssetInfo ? this.props.borrowAssetInfo.annualRate : new BigNumber(0),
    };

    const calculateResult = calculateTrade(calculateParam);

    dispatch(changeFieldValue(TRADE_FORM_ID, 'subtotal', calculateResult.subtotal));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'estimatedPrice', calculateResult.estimatedPrice));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'totalBase', calculateResult.totalBaseTokens));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'total', calculateResult.totalQuoteTokens));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'feeRate', calculateResult.feeRateAfterDiscount));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'gasFee', calculateResult.gasFeeAmount));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'hotDiscount', calculateResult.hotDiscount));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'tradeFee', calculateResult.tradeFeeAfterDiscount));

    // Margin results
    dispatch(changeFieldValue(TRADE_FORM_ID, 'userCollateralCommitted', calculateResult.userCollateralCommitted));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'borrowedAmount', calculateResult.borrowedAmount));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'estimatedLiquidationPrice', calculateResult.estimatedLiquidationPrice));
    dispatch(changeFieldValue(TRADE_FORM_ID, 'totalPositionValue', calculateResult.subtotal)); // Total position value is the subtotal before leverage adjustment of user's part
  }

  renderField = ({ input, label, unit, meta: { touched, error, submitFailed }, ...attrs }) => {
    return (
      <div className="form-group">
        <label>{label}</label>
        <div className="input-group">
          <input className="form-control" {...input} {...attrs} />
          {unit && <span className="text-secondary unit">{unit}</span>}
        </div>
        {(touched || submitFailed) && error && <span className="text-danger">{error}</span>}
      </div>
    );
  };

  renderCheckboxField = ({ input, label, meta: { touched, error, submitFailed } }) => {
    return (
      <div className="form-group form-check">
        <input type="checkbox" className="form-check-input" {...input} id={input.name} />
        <label className="form-check-label" htmlFor={input.name}>{label}</label>
        {(touched || submitFailed) && error && <span className="text-danger d-block">{error}</span>}
      </div>
    );
  }

  renderLeverageButtons = ({ input, label }) => {
    const levels = [2, 3, 5, 10];
    return (
      <div className="form-group">
        <label>{label}</label>
        <div>
          {levels.map(level => (
            <button
              type="button"
              key={level}
              className={`btn btn-sm ${input.value.eq(level) ? 'btn-primary' : 'btn-outline-secondary'} mr-1`}
              onClick={() => input.onChange(new BigNumber(level))}
            >
              {level}x
            </button>
          ))}
           <input
             type="number"
             value={input.value.toNumber()}
             onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (val >=1 ) input.onChange(new BigNumber(val));
             }}
             className="form-control form-control-sm d-inline-block ml-2"
             style={{width: "70px"}}
             min="1"
            />
        </div>
      </div>
    );
  }


  async submit() {
    const { amount, price, side, orderType, dispatch, isLoggedIn, address, currentMarket, isMargin, leverage } = this.props;
    if (!isLoggedIn) {
      try {
        await dispatch(loginRequest(address)); // Assuming loginRequest handles HydroWallet/SDKWallet
        await sleep(500); // Metamask window delay
      } catch (e) {
        alert(`Login failed: ${e.message || e}`);
        return;
      }
    }

    let collateralAssetSymbol = null;
    if (isMargin) {
        collateralAssetSymbol = side === 'buy' ? currentMarket.quoteToken : currentMarket.baseToken; // Example, adjust as per actual logic
        // Or more simply, collateral is usually quote token for longs, and base for shorts (if shorting involves borrowing base)
        // For this DEX, if borrowing quote to buy base (long), collateral is quote.
        // If borrowing base to sell base (short), collateral is quote. (This is a common model)
        collateralAssetSymbol = currentMarket.quoteToken;
    }

    try {
      // The `trade` action creator in `actions/trade.js` needs to be updated
      // to accept `isMargin`, `leverage`, and `collateralAssetSymbol`
      // and pass them to the backend `/orders/build` API.
      await dispatch(trade(
          side,
          price.toString(), // Ensure string for API
          amount.toString(), // Ensure string for API
          orderType,
          isMargin,
          leverage.toNumber(), // Ensure number for API
          collateralAssetSymbol
        ));
    } catch (e) {
      // Error handling in trade action will show alerts.
      // If not, uncomment: alert(`Trade submission failed: ${e.message || e}`);
    }
  }

  setRef = (ref) => {
    if (ref && !this.ps) {
      this.ps = new PerfectScrollbar(ref, {
        suppressScrollX: true,
        maxScrollbarLength: 20
      });
    } else if (!ref && this.ps) {
      this.ps.destroy();
      this.ps = null;
    }
  }

  render() {
    const {
        side, handleSubmit, currentMarket,
        total, gasFee, tradeFee, subtotal,
        dispatch, // Changed from `change` to `dispatch` for clarity with redux-form's `change`
        isMargin, borrowAssetInfo,
        estimatedLiquidationPrice, userCollateralCommitted, borrowedAmount, totalPositionValue
    } = this.props;

    if (!currentMarket) {
      return <div className="trade-panel-loader">Loading market...</div>;
    }

    const collateralDisplayAsset = borrowAssetInfo ? borrowAssetInfo.asset : currentMarket.quoteToken;


    return (
      <>
        <div className="title">
          <div>
            <div>{currentMarket.id}</div>
            <div className="text-secondary">Place {isMargin ? 'Margin' : 'Limit'} Order</div>
          </div>
        </div>
        <div className="trade flex-1 flex-column">
          <ul className="nav nav-tabs">
            <li className="nav-item flex-1 flex">
              <div
                className={`flex-1 tab-button text-secondary text-center${side === 'buy' ? ' active' : ''}`}
                onClick={() => dispatch(changeFieldValue(TRADE_FORM_ID, 'side', 'buy'))}>
                Buy
              </div>
            </li>
            <li className="nav-item flex-1 flex">
              <div
                className={`flex-1 tab-button text-secondary text-center${side === 'sell' ? ' active' : ''}`}
                onClick={() => dispatch(changeFieldValue(TRADE_FORM_ID, 'side', 'sell'))}>
                Sell
              </div>
            </li>
          </ul>
          <div className="flex flex-1 position-relative overflow-hidden" ref={this.setRef}>
            <form
              className="form flex-column text-secondary flex-1 justify-content-between"
              onSubmit={handleSubmit(() => this.submit())}>
              <div>
                <Field name="isMargin" component={this.renderCheckboxField} label="Enable Margin Trading"/>

                {isMargin && (
                  <Field name="leverage" component={this.renderLeverageButtons} label="Leverage" />
                )}

                <Field
                  name="price"
                  unit={currentMarket.quoteToken}
                  autoComplete="off"
                  component={this.renderField}
                  label="Price"
                  type="number"
                  step="any"
                />
                <Field
                  name="amount"
                  unit={currentMarket.baseToken}
                  autoComplete="off"
                  component={this.renderField}
                  label="Amount"
                  type="number"
                  step="any"
                />

                <div className="form-group">
                  <div className="form-title">Order Summary</div>
                  <div className="list">
                    {isMargin && borrowAssetInfo && (
                      <>
                        <div className="item flex justify-content-between">
                          <div className="name">Borrow Asset</div>
                          <div className="value">{borrowAssetInfo.asset} (~{(borrowAssetInfo.annualRate.times(100)).toFixed(2)}% APR)</div>
                        </div>
                         <div className="item flex justify-content-between">
                          <div className="name">Total Position</div>
                          <div className="value">{totalPositionValue.toFixed(currentMarket.priceDecimals)} {currentMarket.quoteToken}</div>
                        </div>
                        <div className="item flex justify-content-between">
                          <div className="name">Your Collateral</div>
                          <div className="value">{userCollateralCommitted.toFixed(currentMarket.priceDecimals)} {collateralDisplayAsset}</div>
                        </div>
                         <div className="item flex justify-content-between">
                          <div className="name">Borrowed Amount</div>
                          <div className="value">{borrowedAmount.toFixed(currentMarket.priceDecimals)} {collateralDisplayAsset}</div>
                        </div>
                        <div className="item flex justify-content-between">
                          <div className="name">Est. Liq. Price</div>
                          <div className="value">{estimatedLiquidationPrice.toFixed(currentMarket.priceDecimals)} {currentMarket.quoteToken}</div>
                        </div>
                      </>
                    )}
                    {!isMargin && (
                        <div className="item flex justify-content-between">
                        <div className="name">Order Value</div>
                        <div className="value">{subtotal.toFixed(currentMarket.priceDecimals)} {currentMarket.quoteToken}</div>
                        </div>
                    )}
                    <div className="item flex justify-content-between">
                      <div className="name">Fees (Trade + Gas)</div>
                      <div className="value">{gasFee.plus(tradeFee).toFixed(currentMarket.priceDecimals)} {currentMarket.quoteToken}</div>
                    </div>
                    <div className="item flex justify-content-between">
                      <div className="name">Total Cost</div>
                      <div className="value">{total.toFixed(currentMarket.priceDecimals)} {currentMarket.quoteToken}</div>
                    </div>
                  </div>
                </div>
              </div>
              <button type="submit" className={`form-control btn ${side === 'buy' ? 'btn-success' : 'btn-danger'}`}>
                {side === 'buy' ? 'Buy' : 'Sell'} {currentMarket.baseToken} {isMargin ? `with ${this.props.leverage}x Leverage` : ''}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }
}

const validate = (values, props) => {
  const { price, amount, isMargin, leverage, userCollateralCommitted } = values; // userCollateralCommitted is from form state now
  const { side, address, currentMarket, quoteTokenBalance, baseTokenBalance, marketLiquidationThreshold, estimatedLiquidationPrice } = props;

  let _price, _amount;
  const errors = {};

  if (!currentMarket) return errors; // No validation if market not loaded

  const bnPrice = new BigNumber(price || 0);
  const bnAmount = new BigNumber(amount || 0);
  const bnLeverage = new BigNumber(leverage || 1);
  const bnUserCollateralCommitted = new BigNumber(userCollateralCommitted || 0);

  if (!address) {
    // errors.price = "Please connect wallet"; // Or some general error
  } else {
      if (isMargin) {
        const collateralAsset = currentMarket.quoteToken; // Assuming quote token is collateral for now
        const collateralBalance = side === 'buy' ? quoteTokenBalance : baseTokenBalance; // Simplification, actual collateral asset matters
                                                                                // For long (buy base), collateral is quote. For short (sell base), collateral also quote typically.
        const collateralTokenDecimals = side === 'buy' ? currentMarket.quoteTokenDecimals : currentMarket.baseTokenDecimals;

        const availableCollateral = toUnitAmount(collateralBalance, collateralTokenDecimals);
        if (bnUserCollateralCommitted.gt(availableCollateral)) {
            errors.amount = `Insufficient ${collateralAsset} for collateral. Need ${bnUserCollateralCommitted.toFixed(5)}, have ${availableCollateral.toFixed(5)}`;
        }

      } else { // Spot trade checks
        if (side === 'buy') {
          const quoteTokenAmount = toUnitAmount(quoteTokenBalance, currentMarket.quoteTokenDecimals);
          if (values.total && new BigNumber(values.total).gt(quoteTokenAmount)) {
             errors.amount = `Insufficient ${currentMarket.quoteToken} balance. Need ${new BigNumber(values.total).toFixed(5)}, have ${quoteTokenAmount.toFixed(5)}`;
          }
        } else { // side === 'sell'
          const baseTokenAmount = toUnitAmount(baseTokenBalance, currentMarket.baseTokenDecimals);
          if (bnAmount.gt(baseTokenAmount)) {
            errors.amount = `Insufficient ${currentMarket.baseToken} balance. Trying to sell ${bnAmount.toFixed(5)}, have ${baseTokenAmount.toFixed(5)}`;
          }
        }
      }
  }


  if (!price || bnPrice.lte(0)) {
    errors.price = 'Price must be greater than 0';
  } else if (isNaN(Number(price))) {
    errors.price = 'Price must be a number';
  }

  if (!amount || bnAmount.lte(0)) {
    errors.amount = 'Amount must be greater than 0';
  } else if (isNaN(Number(amount))) {
    errors.amount = 'Amount must be a number';
  } else if (bnPrice.gt(0) && bnAmount.multipliedBy(bnPrice).lt(new BigNumber(currentMarket.minOrderSize || 0))) {
    errors.amount = `Order value too small (min: ${new BigNumber(currentMarket.minOrderSize || 0).toFixed(currentMarket.priceDecimals)} ${currentMarket.quoteToken})`;
  }

  if (isMargin) {
    if (bnLeverage.lt(1)) errors.leverage = "Leverage must be at least 1x";
    // Check if est. liquidation price is too close to market or entry price (complex check, can be basic for now)
    const bnEstimatedLiqPrice = new BigNumber(estimatedLiquidationPrice || 0);
    if (bnEstimatedLiqPrice.gt(0) && bnPrice.gt(0)) {
        if (side === 'buy' && bnEstimatedLiqPrice.gte(bnPrice.multipliedBy(0.98))) { // If liq is >= 98% of buy price
            // Potentially too aggressive, but depends on marketLiquidationThreshold
        } else if (side === 'sell' && bnEstimatedLiqPrice.lte(bnPrice.multipliedBy(1.02))) { // If liq is <= 102% of sell price
            // Potentially too aggressive
        }
    }
  }
  return errors;
};

const onSubmitFail = (errors, dispatch) => {
  // Optional: Focus on first field with error
  // const firstErrorField = Object.keys(errors)[0];
  // if (firstErrorField) {
  //   dispatch(focus(TRADE_FORM_ID, firstErrorField));
  // }
  setTimeout(() => {
    dispatch(stopSubmit(TRADE_FORM_ID)); // Clear submit error after a while
  }, 3000);
};

export default connect(mapStateToProps)(
  reduxForm({
    form: TRADE_FORM_ID,
    destroyOnUnmount: false,
    enableReinitialize: true, // Important for initialValues to update on market change
    keepDirtyOnReinitialize: true,
    onSubmitFail,
    validate,
    // shouldError: () => true, // Keep showing validation errors
  })(Trade)
);
