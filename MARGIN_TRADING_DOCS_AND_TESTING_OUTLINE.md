# Margin Trading: Documentation & Testing Outline

This document outlines key areas for user documentation and critical testing scenarios for the newly implemented margin trading features.

## I. User Documentation Outline

The user documentation should be clear, concise, and easily accessible. It should cover:

1.  **Introduction to Margin Trading on [DEX Name]:**
    *   What is margin trading?
    *   How does leverage work? (e.g., 2x, 5x leverage explained)
    *   Risks involved:
        *   Liquidation (explain what it is, how it's triggered, `market.liquidateRate`).
        *   Funding costs/Interest rates.
        *   Market volatility risks amplified by leverage.
    *   Benefits (potential for amplified gains).
    *   Prerequisites (e.g., account setup, collateral requirements).

2.  **Margin Trading Interface Guide:**
    *   **Trade Panel:**
        *   How to enable "Margin Trading" mode.
        *   How to select leverage.
        *   Understanding new display elements:
            *   Borrow asset & estimated Annual Percentage Rate (APR).
            *   User's collateral commitment.
            *   Borrowed amount.
            *   Total position value.
            *   Estimated Liquidation Price.
        *   Placing a margin order (buy/long and sell/short).
    *   **Margin Positions Tab:**
        *   Understanding the columns: Market, Side, Leverage, Size, Entry Price, Mark Price, Collateral, Borrowed, Est. Interest, Est. Liq. Price, Unrealized P&L.
        *   How P&L and Liquidation Price are estimated.
        *   Action Buttons:
            *   How to "Add Collateral" to a position (purpose, steps).
            *   How to "Repay Loan" for a position (purpose, partial/full repayment, steps).
            *   (Future) How to "Close Position."
    *   **Wallet - Margin Accounts Tab:**
        *   Understanding dedicated margin account balances per market.
        *   How to "Deposit" funds from the main spot wallet to a market's margin account.
        *   How to "Withdraw" funds from a market's margin account to the main spot wallet (and `getTransferableAmount` implications).

3.  **Key Concepts Explained:**
    *   **Collateral:** What assets can be used, how it's calculated.
    *   **Borrowed Assets:** Which assets are borrowed for long/short positions.
    *   **Interest Rates:** How they are determined (link to interest model if dynamic), how they accrue, and where to see them.
    *   **Liquidation:**
        *   Detailed explanation of the liquidation process (`liquidateRate`, `auctionRatioStart`, `auctionRatioPerBlock`).
        *   What happens to the user's position and collateral.
        *   How to avoid liquidation (monitoring position, adding collateral).
    *   **Fees:** Trading fees vs. funding (interest) fees. HOT token discounts on trading fees.

4.  **FAQ & Troubleshooting:**
    *   Common questions about margin trading.
    *   Troubleshooting common issues (e.g., insufficient collateral, order rejection).

## II. Critical Testing Scenarios Outline (for Developers/QA)

This is not exhaustive but covers critical E2E flows and conditions.

**A. Margin Order Placement:**
    1.  **Long Order (Buy with Leverage):**
        *   Enable margin, select leverage (e.g., 2x, 5x).
        *   Verify `tradeCalculator.js` correctly computes collateral, borrowed amount, est. liq. price.
        *   Verify UI displays these values correctly.
        *   Place order:
            *   Backend `/orders/build` receives correct margin params.
            *   Backend correctly prepares batch for (collateral transfer if needed + borrow).
            *   User signs the batch.
            *   Backend `/orders` submits batch.
            *   Dex engine processes borrow, then places trade.
            *   Verify `orders` table stores new margin fields correctly.
    2.  **Short Order (Sell with Leverage - assuming borrow base, collateral in quote):**
        *   Similar checks as long order, ensuring borrow logic for base asset is correct.
    3.  **Validation Checks:**
        *   Insufficient collateral for selected leverage/amount.
        *   Leverage below minimum (e.g., < 1x if 1x is spot).
        *   Order size below `minOrderSize`.
        *   Attempting margin trade on a non-margin-enabled market/asset.
        *   Insufficient liquidity in the lending pool for the borrow amount.
    4.  **Fee Calculation:** Verify trading fees and display of funding costs are correct.

**B. Margin Position Management (MarginPositionsTab):**
    1.  **Display:**
        *   Verify all open margin positions are displayed correctly with accurate data (market, side, leverage, entry, collateral, borrowed, liq. price, P&L).
        *   Verify P&L calculation is correct against mark prices.
        *   Verify est. liquidation price calculation aligns with contract logic.
    2.  **Add Collateral:**
        *   Open modal, display correct current collateral.
        *   Input amount, check max available from main wallet.
        *   Submit: Backend `/margin/add_collateral` called.
        *   Verify `Transfer.transfer` (via batch) occurs correctly.
        *   Verify position details (collateral, liq. price) update in UI and backend.
    3.  **Repay Loan:**
        *   Open modal, display correct borrowed amount and asset.
        *   Input amount, check max available from main wallet for repayment and not exceeding loan.
        *   Submit: Backend `/margin/repay_loan` called.
        *   Verify `LendingPool.repay` (via batch) occurs.
        *   Verify position details (borrowed amount, interest, liq. price) update.
    4.  **(Future) Close Position:**
        *   Verify it places an opposite trade for the position size.
        *   Verify loan repayment is part of the closing process (likely a batch: trade + repay).

**C. Wallet - Margin Account Transfers:**
    1.  **Display:** Verify `MarginAccounts.js` tab shows correct balances for assets within each market's margin account.
    2.  **Deposit to Margin Account:**
        *   Modal shows correct asset and max transferable from main wallet.
        *   Submit: Backend `/margin/transfer_collateral` (direction TO_MARGIN) called.
        *   Verify `Transfer.transfer` occurs.
        *   Verify both main wallet and margin account balances update.
    3.  **Withdraw from Margin Account:**
        *   Modal shows correct asset and max transferable from margin account (respecting `getTransferableAmount` from contracts).
        *   Submit: Backend `/margin/transfer_collateral` (direction FROM_MARGIN) called.
        *   Verify `Transfer.transfer` occurs.
        *   Verify balances update.

**D. Liquidation Scenarios (Testnet):**
    1.  Open a leveraged position.
    2.  Manually move oracle prices on testnet to trigger liquidation conditions.
    3.  Verify `CollateralAccounts.getDetails` shows `liquidatable: true`.
    4.  Verify `Auctions.liquidate` can be called (manually or by a bot).
    5.  Verify position is marked as liquidated and disappears from open positions.
    6.  Verify auction creation and filling (if implementing UI for auctions).

**E. Edge Cases & Error Handling:**
    1.  API errors during any operation (order placement, data fetching, collateral management).
    2.  Smart contract transaction failures (reverts due to insufficient funds, slippage if applicable, contract pauses).
    3.  User authentication issues.
    4.  Network connectivity problems.
    5.  Concurrent operations (e.g., trying to add collateral while an order is being placed).
    6.  Display with zero balances, zero positions.
    7.  Large and small number handling for amounts, prices, leverage.

**F. UI/UX:**
    1.  Responsiveness on different devices.
    2.  Clarity of information presented.
    3.  Ease of use for all margin operations.
    4.  Correctness of all calculations displayed to the user.
    5.  Loading states and error messages are user-friendly.

This outline should serve as a starting point for comprehensive documentation and testing efforts.
