import BigNumber from 'bignumber.js';
import { hotDiscountRules } from '../actions/fee'; // Assuming this path is correct

// a pure function to calculate all trade details
export const calculateTrade = ({
  orderType,
  side,
  price, // Price of base asset in quote asset
  amount, // Amount of base asset (for limit orders) or amount of quote asset (for market buy)
  hotTokenAmount,
  gasFeeAmount, // In quote asset
  asMakerFeeRate,
  asTakerFeeRate,
  amountDecimals, // Decimals for base asset
  priceDecimals,  // Decimals for quote asset (and for price display)
  // New Margin Params
  isMargin = false,
  leverage = 1, // Numeric value, e.g., 2 for 2x
  // collateralAssetPriceUSD, // Not directly used in this basic calculator; liquidation involves oracle prices from contract/backend
  // borrowAssetInterestRate, // For display/info, not directly part of this synchronous calculation
  marketLiquidationThreshold = 1.15, // Example: 115% or 1.15. If debt/collateral > 1/1.15, then liquidate. Or, collateral must be > debt * 1.15
                                     // This should come from market.liquidateRate (e.g. 1.15 means collateral must be 115% of debt)
  // currentMarketQuoteToken, // Symbol of quote token
  // currentMarketBaseToken,  // Symbol of base token
  baseTokenDecimals, // For precision with base asset amount
  quoteTokenDecimals // For precision with quote asset amount
}) => {
  let tradeFee, subtotal, totalBaseTokens;
  let estimatedPrice = new BigNumber(0);
  let userCollateralCommittedInQuote = new BigNumber(0);
  let borrowedAmountInQuote = new BigNumber(0);
  let estimatedLiquidationPrice = new BigNumber(0);

  const bnPrice = new BigNumber(price);
  const bnAmount = new BigNumber(amount);
  const bnLeverage = new BigNumber(leverage);
  const bnMarketLiquidationThreshold = new BigNumber(marketLiquidationThreshold); // e.g., 1.15 (collateral must be 115% of debt)

  const isMakerFee = orderType === 'limit';
  const hotDiscount = getHotDiscountRate(hotTokenAmount);
  const feeRate = orderType === 'market' ? asTakerFeeRate : asMakerFeeRate;

  if (orderType === 'market' && side === 'buy') {
    // For market buy, 'amount' is total quote currency to spend.
    // 'price' is the estimated or worst price for calculation.
    subtotal = bnAmount.dp(priceDecimals, BigNumber.ROUND_DOWN); // Total value in quote currency
    if (bnPrice.gt(0)) {
      totalBaseTokens = bnAmount.div(bnPrice).dp(amountDecimals, BigNumber.ROUND_DOWN);
    } else {
      totalBaseTokens = new BigNumber(0);
    }
    estimatedPrice = bnPrice;
  } else {
    // For limit orders (buy/sell) and market sell, 'amount' is base currency amount.
    subtotal = bnAmount.multipliedBy(bnPrice).dp(priceDecimals, BigNumber.ROUND_DOWN); // Total value in quote
    totalBaseTokens = bnAmount;
    if (orderType === 'market' && side === 'sell') {
      estimatedPrice = bnPrice; // For market sell, price is estimated execution price
    }
  }

  tradeFee = subtotal.multipliedBy(feeRate);
  const tradeFeeAfterDiscount = tradeFee.multipliedBy(hotDiscount);
  const feeRateAfterDiscount = feeRate.multipliedBy(hotDiscount);

  let totalQuoteTokens; // This is what the user pays (buy) or receives (sell) from their own funds for the trade part

  if (isMargin && bnLeverage.gt(1)) {
    userCollateralCommittedInQuote = subtotal.dividedBy(bnLeverage).dp(priceDecimals, BigNumber.ROUND_UP);
    borrowedAmountInQuote = subtotal.minus(userCollateralCommittedInQuote).dp(priceDecimals, BigNumber.ROUND_DOWN);

    if (side === 'buy') {
      // User pays their collateral part + fees
      totalQuoteTokens = userCollateralCommittedInQuote
        .plus(tradeFeeAfterDiscount)
        .plus(gasFeeAmount)
        .dp(priceDecimals, BigNumber.ROUND_UP);

      // Liquidation price for a long position (bought base asset, borrowed quote asset)
      // LiqPrice = (BorrowedQuote * LiquidationThreshold) / AmountBase
      // Or, if initial collateral C_q for buying A_b at price P, borrowed B_q = A_b*P - C_q
      // Liquidation when A_b * P_liq = B_q * Threshold_contract (where Threshold_contract is like 1.15)
      // P_liq = (B_q * Threshold_contract) / A_b
      if (totalBaseTokens.gt(0) && bnMarketLiquidationThreshold.gt(0)) {
        estimatedLiquidationPrice = borrowedAmountInQuote
          .multipliedBy(bnMarketLiquidationThreshold)
          .dividedBy(totalBaseTokens)
          .dp(priceDecimals, BigNumber.ROUND_UP); // Liq price in quote asset per base asset
      }
    } else { // side === 'sell'
      // User receives proceeds from sale, less their collateral part (which is returned to them from position value), less fees.
      // Or, more simply, the collateral is committed, and the P&L determines final balance.
      // For this calculation, totalQuoteTokens is the net change to user's quote balance from this action if fees are paid in quote.
      totalQuoteTokens = userCollateralCommittedInQuote // Or subtotal - borrowedAmount
        .minus(tradeFeeAfterDiscount)
        .minus(gasFeeAmount)
        .dp(priceDecimals, BigNumber.ROUND_DOWN); // This represents the quote value locked as collateral + fees

      // Liquidation price for a short position (sold base asset, borrowed base asset, collateral in quote)
      // Collateral C_q. Borrowed A_b base. Sold at P_entry. Position value = C_q + (A_b * P_entry - A_b * P_current)
      // Debt value in quote = A_b * P_current. Collateral value in quote = C_q.
      // Liquidation when C_q < (A_b * P_liq) * (Threshold_contract - 1) (if threshold is total collateral / debt)
      // Or, if Threshold_contract (e.g. 1.15) means Collateral_USD > Debt_USD * Threshold_contract
      // Here, collateral is in Quote. Debt is Base. Debt_USD = AmountBase_borrowed * Price_Liq_USD
      // Collateral_Quote_value_fixed / (AmountBase_borrowed * Price_Liq_Quote_per_base) > Threshold_contract
      // Price_Liq_Quote_per_base < Collateral_Quote_value_fixed / (AmountBase_borrowed * Threshold_contract)
      const borrowedAmountInBase = totalBaseTokens; // Assuming for a short, 'amount' is base qty borrowed & sold
      if (borrowedAmountInBase.gt(0) && bnMarketLiquidationThreshold.gt(0) && bnLeverage.gt(0)) {
         // Collateral is in quote: subtotal / leverage
         // Debt is in base: totalBaseTokens
         // Liquidation when: (CollateralInQuote / TotalBaseTokens) / LiqPrice < (1 / MaintenanceMarginRatio)
         // MaintenanceMarginRatio = 1 - (1 / bnMarketLiquidationThreshold) if bnMarketLiquidationThreshold is like Collateral/Debt
         // If bnMarketLiquidationThreshold (e.g. 1.15) is CollateralRequiredFactor * DebtValue
         // For short: CollateralInQuote / (BorrowedBaseAmount * LiqPrice) = bnMarketLiquidationThreshold
         // LiqPrice = CollateralInQuote / (BorrowedBaseAmount * bnMarketLiquidationThreshold)
        estimatedLiquidationPrice = userCollateralCommittedInQuote // This is the collateral in quote
            .dividedBy(borrowedAmountInBase.multipliedBy(bnMarketLiquidationThreshold))
            .dp(priceDecimals, BigNumber.ROUND_DOWN);
      }
    }
  } else { // Not margin or leverage = 1
    userCollateralCommittedInQuote = subtotal; // Full value is collateral
    borrowedAmountInQuote = new BigNumber(0);
    if (side === 'buy') {
      totalQuoteTokens = subtotal
        .plus(tradeFeeAfterDiscount)
        .plus(gasFeeAmount)
        .dp(priceDecimals, BigNumber.ROUND_UP);
    } else { // side === 'sell'
      totalQuoteTokens = subtotal
        .minus(tradeFeeAfterDiscount)
        .minus(gasFeeAmount)
        .dp(priceDecimals, BigNumber.ROUND_DOWN);
    }
  }
  totalQuoteTokens = BigNumber.max(totalQuoteTokens, new BigNumber('0'));


  return {
    estimatedPrice, // For market orders
    gasFeeAmount: new BigNumber(gasFeeAmount), // Ensure it's BigNumber
    hotDiscount,
    totalBaseTokens, // Amount of base token involved in the trade
    tradeFeeAfterDiscount,
    feeRateAfterDiscount,
    tradeFee, // Original trade fee before discount
    feeRate,  // Original fee rate before discount
    isMakerFee,
    subtotal, // Price * Amount (base amount for limit, quote amount for market buy) in quote currency
    totalQuoteTokens, // Net quote currency user pays/receives from their own funds for this specific trade action

    // Margin specific return values
    isMargin,
    leverage: bnLeverage,
    userCollateralCommitted: userCollateralCommittedInQuote, // Collateral part from user in quote currency
    borrowedAmount: borrowedAmountInQuote,                 // Borrowed part in quote currency
    estimatedLiquidationPrice,                             // In quote currency per base currency
  };
};

const getHotDiscountRate = hotTokenAmount => {
  if (!hotTokenAmount || !hotDiscountRules || hotDiscountRules.length === 0) {
    return new BigNumber(1);
  }
  const hotAmount = new BigNumber(hotTokenAmount).div(10 ** 18);
  for (let rule of hotDiscountRules) {
    const limit = new BigNumber(rule[0]);
    const discountRate = new BigNumber(rule[1]); // This is the rate to PAY (e.g., 0.7 for 30% discount)

    if (limit.eq(-1)) { // Should be last rule
      return discountRate;
    } else if (hotAmount.lte(limit)) {
      return discountRate;
    }
  }
  return new BigNumber(1); // Default: no discount
};
