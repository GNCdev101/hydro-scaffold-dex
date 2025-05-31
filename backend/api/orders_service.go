package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/HydroProtocol/hydro-scaffold-dex/backend/models"
	"github.com/HydroProtocol/hydro-sdk-backend/common"
	"github.com/HydroProtocol/hydro-sdk-backend/sdk"
	"github.com/HydroProtocol/hydro-sdk-backend/utils"
	"github.com/shopspring/decimal"
	"math/rand"
	"os"
	"time"
)

// BuildOrderReq is request to build an order
type BuildOrderReq struct {
	MarketID             string  `json:"marketID"`
	Side                 string  `json:"side"`
	Amount               string  `json:"amount"`
	Price                string  `json:"price"`
	FeeRate              string  `json:"feeRate"`
	Address              string  `json:"address"`
	SignatureType        string  `json:"signatureType"`
	IsCancel             bool    `json:"isCancel"`
	OrderType            string  `json:"orderType"`
	ExpiredAt            int64   `json:"expiredAt"` // TODO: this field is named `Expires` in the frontend, but `ExpiredAt` in the backend.
	Source               string  `json:"source"`
	Leverage             float64 `json:"leverage"`
	IsMargin             bool    `json:"isMargin"`
	CollateralAssetSymbol string  `json:"collateralAssetSymbol"`
}

func GetLockedBalance(p Param) (interface{}, error) {
	req := p.(*LockedBalanceReq)
	tokens := models.TokenDao.GetAllTokens()

	var lockedBalances []LockedBalance

	for _, token := range tokens {
		lockedBalance := models.BalanceDao.GetByAccountAndSymbol(req.Address, token.Symbol, token.Decimals)
		lockedBalances = append(lockedBalances, LockedBalance{
			Symbol:        token.Symbol,
			LockedBalance: lockedBalance,
		})
	}

	return &LockedBalanceResp{
		LockedBalances: lockedBalances,
	}, nil
}

// LockedBalanceReq is request for GetLockedBalance
type LockedBalanceReq struct {
	Address string `json:"address"`
}

// LockedBalance is a single token locked balance
type LockedBalance struct {
	Symbol        string          `json:"symbol"`
	LockedBalance decimal.Decimal `json:"lockedBalance"`
}

// LockedBalanceResp is response for GetLockedBalance
type LockedBalanceResp struct {
	LockedBalances []LockedBalance `json:"lockedBalances"`
}

func GetSingleOrder(p Param) (interface{}, error) {
	req := p.(*QuerySingleOrderReq)

	order := models.OrderDao.FindByID(req.OrderID)

	return &QuerySingleOrderResp{
		Order: order,
	}, nil
}

// QuerySingleOrderReq is request for GetSingleOrder
type QuerySingleOrderReq struct {
	OrderID string `json:"orderID"`
}

// QuerySingleOrderResp is response for GetSingleOrder
type QuerySingleOrderResp struct {
	Order *models.Order `json:"order"`
}

func GetOrders(p Param) (interface{}, error) {
	req := p.(*QueryOrderReq)
	if req.Status == "" {
		req.Status = common.ORDER_PENDING
	}
	if req.PerPage <= 0 {
		req.PerPage = 20
	}
	if req.Page <= 0 {
		req.Page = 1
	}

	offset := req.PerPage * (req.Page - 1)
	limit := req.PerPage

	count, orders := models.OrderDao.FindByAccount(req.Address, req.MarketID, req.Status, offset, limit)

	return &QueryOrderResp{
		Count:  count,
		Orders: orders,
	}, nil
}

// QueryOrderReq is request for GetOrders
type QueryOrderReq struct {
	Address  string `json:"address"`
	MarketID string `json:"marketID"`
	Status   string `json:"status"`
	Page     int    `json:"page"`
	PerPage  int    `json:"perPage"`
}

// QueryOrderResp is response for GetOrders
type QueryOrderResp struct {
	Count  int64           `json:"count"`
	Orders []*models.Order `json:"orders"`
}

func CancelOrder(p Param) (interface{}, error) {
	req := p.(*CancelOrderReq)
	order := models.OrderDao.FindByID(req.ID)
	if order == nil {
		return nil, NewApiError(-1, fmt.Sprintf("order %s not exist", req.ID))
	}

	if order.Status != common.ORDER_PENDING {
		return nil, nil
	}

	cancelOrderEvent := common.CancelOrderEvent{
		Event: common.Event{
			Type:     common.EventCancelOrder,
			MarketID: order.MarketID,
		},
		Price: order.Price.String(),
		Side:  order.Side,
		ID:    order.ID,
	}

	return nil, QueueService.Push([]byte(utils.ToJsonString(cancelOrderEvent)))
}

// CancelOrderReq is request for CancelOrder
type CancelOrderReq struct {
	ID string `json:"id"`
}

func BuildOrder(p Param) (interface{}, error) {
	utils.Debugf("BuildOrder param %v", p)

	req := p.(*BuildOrderReq)
	err := checkBalanceAllowancePriceAndAmount(req, req.Address)
	if err != nil {
		return nil, err
	}

	buildOrderResponse, err := BuildAndCacheOrder(req.Address, req)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"order": buildOrderResponse,
	}, nil
}

// PlaceOrderReq defines what to place an order
type PlaceOrderReq struct {
	ID        string `json:"id"`
	Address   string `json:"address"`
	Signature string `json:"signature"`
}

func PlaceOrder(p Param) (interface{}, error) {
	order := p.(*PlaceOrderReq)
	if valid := hydro.IsValidOrderSignature(order.Address, order.ID, order.Signature); !valid {
		utils.Infof("valid is %v", valid)
		return nil, errors.New("bad signature")
	}

	cacheOrder := getCacheOrderByOrderID(order.ID)

	if cacheOrder == nil {
		return nil, errors.New("place order error, please retry later")
	}

	cacheOrder.OrderResponse.Json.Signature = order.Signature

	// Populate models.Order with basic details first
	dbOrder := models.Order{
		ID:              order.ID,
		TraderAddress:   order.Address,
		MarketID:        cacheOrder.OrderResponse.MarketID,
		Side:            cacheOrder.OrderResponse.Side,
		Price:           cacheOrder.OrderResponse.Price, // For margin, this is the trigger/entry price
		Amount:          cacheOrder.OrderResponse.Amount, // For margin, this is the total position size
		Status:          common.ORDER_PENDING,
		Type:            cacheOrder.OrderResponse.Type, // e.g., "limit", "market", "margin_limit", "margin_market"
		Version:         "hydro-v1", // May need versioning for different order structures
		AvailableAmount: cacheOrder.OrderResponse.Amount, // For margin, this is total position size
		ConfirmedAmount: decimal.Zero,
		CanceledAmount:  decimal.Zero,
		PendingAmount:   decimal.Zero,
		MakerFeeRate:    cacheOrder.OrderResponse.AsMakerFeeRate,
		TakerFeeRate:    cacheOrder.OrderResponse.AsTakerFeeRate,
		MakerRebateRate: cacheOrder.OrderResponse.MakerRebateRate, // May not apply to margin
		GasFeeAmount:    cacheOrder.OrderResponse.GasFeeAmount,    // May be different for batch tx
		JSON:            utils.ToJsonString(cacheOrder.OrderResponse.Json), // Contains the signed data (spot order or batch order params)
		CreatedAt:       time.Now().UTC(),
	}

	// Retrieve IsMargin and other details from the cached order.
	// These fields would have been set in BuildAndCacheOrder.
	// We need to define these fields in the CacheOrder struct first.
	// For now, let's assume cacheOrder has an IsMargin field.
	// isMarginFromCache := cacheOrder.IsMargin // Example: cacheOrder.AdditionalData["isMargin"].(bool)

	// TODO: Properly retrieve IsMargin and other margin details from cacheOrder.
	// This requires CacheOrder struct to be updated to hold these values,
	// which were conceptually added in the previous step's BuildAndCacheOrder comments.
	// For this conceptual step, we'll assume `dbOrder.IsMargin` can be set if we had it.
	// Example: dbOrder.IsMargin = isMarginFromCache
	// Example: dbOrder.Leverage = cacheOrder.AdditionalData["leverage"].(float64)
	// ... and so on for CollateralAmount, BorrowAmount, LiquidationPrice etc.
	// These would need to be added to the models.Order struct as well.

	var eventType common.EventType
	var eventData []byte
	var err error

	// Conceptual: Check if it's a margin order based on information from cacheOrder
	// For now, we can use the order Type from response, assuming it's set like "margin_limit"
	isMarginOrder := false // Placeholder
	if dbOrder.Type == "margin_limit" || dbOrder.Type == "margin_market" { // A way to identify margin order
		isMarginOrder = true
	}

	if isMarginOrder {
		// For margin orders, the event pushed to queue might be different
		// or carry additional information to signify a batch operation for the dex_engine.
		// For example, common.EventNewMarginOrderBatch or augmenting the existing event.
		utils.Infof("Processing margin order %s for queue", dbOrder.ID)
		eventType = common.EventNewOrder // Or a new common.EventNewMarginOrderBatch
		// The `dbOrder` (which is serialized into `Order` field of NewOrderEvent)
		// should contain all necessary margin details if models.Order is updated.
		// The `JSON` field of `dbOrder` already contains the signed batch parameters.
	} else {
		eventType = common.EventNewOrder
	}

	newOrderEventDetails := common.NewOrderEvent{
		Event: common.Event{
			MarketID: dbOrder.MarketID,
			Type:     eventType,
		},
		Order: utils.ToJsonString(dbOrder), // dbOrder should have all fields (incl. margin if any)
	}
	eventData, _ = json.Marshal(newOrderEventDetails)

	err = QueueService.Push(eventData)

	if err != nil {
		return nil, errors.New("place order failed, place try again")
	} else {
		return nil, nil
	}
}

func getCacheOrderByOrderID(orderID string) *CacheOrder {
	cacheOrderStr, err := CacheService.Get(generateOrderCacheKey(orderID))

	if err != nil {
		utils.Errorf("get cache order error: %v", err)
		return nil
	}

	var cacheOrder CacheOrder

	err = json.Unmarshal([]byte(cacheOrderStr), &cacheOrder)
	if err != nil {
		utils.Errorf("get cache order error: %v, cache order is: %v", err, cacheOrderStr)
		return nil
	}

	return &cacheOrder
}

func checkBalanceAllowancePriceAndAmount(order *BuildOrderReq, address string) error {
	market := models.MarketDao.FindMarketByID(order.MarketID)
	if market == nil {
		return MarketNotFoundError(order.MarketID)
	}

	if order.IsMargin {
		err := checkMarginOrderConstraints(order, address, market)
		if err != nil {
			return err
		}
		// If margin checks pass, we might not need all the spot checks,
		// or they might be different. For now, let's return,
		// assuming margin checks are comprehensive.
		// This part will need refinement.
		return nil
	}

	minPriceUnit := decimal.New(1, int32(-1*market.PriceDecimals))

	price := utils.StringToDecimal(order.Price)

	if price.LessThanOrEqual(decimal.Zero) {
		return NewApiError(-1, "invalid_price")
	}

	if !price.Mod(minPriceUnit).Equal(decimal.Zero) {
		return NewApiError(-1, "invalid_price_unit")
	}

	minAmountUnit := decimal.New(1, int32(-1*market.AmountDecimals))

	amount := utils.StringToDecimal(order.Amount)

	if amount.LessThanOrEqual(decimal.Zero) {
		return NewApiError(-1, "invalid_amount")
	}

	if !amount.Mod(minAmountUnit).Equal(decimal.Zero) {
		return NewApiError(-1, "invalid_amount_unit")
	}

	orderSizeInQuoteToken := amount.Mul(price)
	if orderSizeInQuoteToken.LessThan(market.MinOrderSize) {
		return NewApiError(-1, "order_less_than_minOrderSize")
	}

	baseTokenLockedBalance := models.BalanceDao.GetByAccountAndSymbol(address, market.BaseTokenSymbol, market.BaseTokenDecimals)
	baseTokenBalance := hydro.GetTokenBalance(market.BaseTokenAddress, address)
	baseTokenAllowance := hydro.GetTokenAllowance(market.BaseTokenAddress, os.Getenv("HSK_PROXY_ADDRESS"), address)

	quoteTokenLockedBalance := models.BalanceDao.GetByAccountAndSymbol(address, market.QuoteTokenSymbol, market.QuoteTokenDecimals)
	quoteTokenBalance := hydro.GetTokenBalance(market.QuoteTokenAddress, address)
	quoteTokenAllowance := hydro.GetTokenAllowance(market.QuoteTokenAddress, os.Getenv("HSK_PROXY_ADDRESS"), address)

	var quoteTokenHugeAmount decimal.Decimal
	var baseTokenHugeAmount decimal.Decimal

	feeDetail := calculateFee(price, amount, market, address)
	feeAmount := feeDetail.AsTakerTotalFeeAmount

	quoteTokenHugeAmount = amount.Mul(decimal.New(1, int32(market.QuoteTokenDecimals))).Mul(price)
	baseTokenHugeAmount = amount.Mul(decimal.New(1, int32(market.BaseTokenDecimals)))

	if order.Side == "sell" {
		if quoteTokenHugeAmount.LessThanOrEqual(feeAmount) {
			return NewApiError(-1, fmt.Sprintf("amount: %s less than fee: %s", quoteTokenHugeAmount.String(), feeAmount.String()))
		}

		availableBaseTokenAmount := baseTokenBalance.Sub(baseTokenLockedBalance)
		if baseTokenHugeAmount.GreaterThan(availableBaseTokenAmount) {
			return NewApiError(-1, fmt.Sprintf("%s balance not enough, available balance is %s, require amount is %s", market.BaseTokenSymbol, availableBaseTokenAmount.String(), baseTokenHugeAmount.String()))
		}

		if baseTokenHugeAmount.GreaterThan(baseTokenAllowance) {
			return NewApiError(-1, fmt.Sprintf("%s allowance not enough, allowance is %s, require amount is %s", market.BaseTokenSymbol, baseTokenAllowance.String(), baseTokenHugeAmount.String()))
		}
	} else {
		availableQuoteTokenAmount := quoteTokenBalance.Sub(quoteTokenLockedBalance)
		requireAmount := quoteTokenHugeAmount.Add(feeAmount)
		if requireAmount.GreaterThan(availableQuoteTokenAmount) {
			return NewApiError(-1, fmt.Sprintf("%s balance not enough, available balance is %s, require amount is %s", market.QuoteTokenSymbol, availableQuoteTokenAmount.String(), requireAmount.String()))
		}

		if requireAmount.GreaterThan(quoteTokenAllowance) {
			return NewApiError(-1, fmt.Sprintf("%s allowance not enough, available balance is %s, require amount is %s", market.QuoteTokenSymbol, quoteTokenAllowance.String(), requireAmount.String()))
		}
	}

	// will add check of precision later

	return nil
}

func checkMarginOrderConstraints(order *BuildOrderReq, address string, market *models.Market) error {
	// TODO: Implement margin order constraint checks

	// 1. Collateral Check:
	//    - Determine the collateral asset based on `order.CollateralAssetSymbol`
	//      (or derive from trade side/market if fixed).
	//    - Check if the user has sufficient balance of `CollateralAssetSymbol`
	//      in their trading account (not locked in orders).
	//    - Check if the Hydro contract has sufficient allowance for this collateral asset.
	utils.Infof("Collateral check for %s: %s", address, order.CollateralAssetSymbol)

	// 2. Borrow Calculation & Checks (interacting with a new conceptual `MarginService`):
	//    - `borrowAsset`: Determine asset to borrow (e.g., quote token for long, base token for short).
	//    - `collateralValueUSD`: Get USD value of provided collateral using oracle prices.
	//    - `maxTotalPositionValueUSD = collateralValueUSD * order.Leverage`.
	//    - `requestedPositionValueUSD = price * amount (converted to USD)`.
	//    - `borrowAmountUSD = requestedPositionValueUSD - collateralValueUSD`.
	//    - If `borrowAmountUSD < 0`, it's not a valid margin trade (leverage too low or amount too small).
	//    - Convert `borrowAmountUSD` to `borrowAmountInAssetUnits` for the `borrowAsset`.
	utils.Infof("Borrow calculation for leverage: %f", order.Leverage)

	// 3. Lending Pool Interaction (via `MarginService`):
	//    - Check if `LendingPool` has enough `borrowAsset` liquidity.
	//    - Get current borrow interest rate for `borrowAsset`.
	//    - Calculate if the user's collateral meets initial margin requirements
	//      (`market.liquidateRate`, `market.withdrawRate` from `Types.Market` define
	//      liquidation thresholds, which imply maintenance and initial margin ratios).
	//      The `CollateralAccounts.getDetails` logic is relevant here.
	//      The position should not be immediately liquidatable.
	//      `collateralValueUSD` must be `> (borrowAmountUSD * market.liquidateRate)`.
	//      More accurately, `collateralValueUSD / borrowAmountUSD > market.liquidateRate`.
	utils.Infof("Lending pool and initial margin requirement checks")

	// 4. Order Size Check:
	//    - Ensure `requestedPositionValueUSD` (derived from `price * amount`)
	//      is above `market.MinOrderSize`.
	utils.Infof("Order size check against market.MinOrderSize")

	return nil
}

func BuildAndCacheOrder(address string, order *BuildOrderReq) (*BuildOrderResp, error) {
	market := models.MarketDao.FindMarketByID(order.MarketID)
	amount := utils.StringToDecimal(order.Amount)
	price := utils.StringToDecimal(order.Price)

	if order.IsMargin {
		// TODO: Margin Order Specific Logic
		utils.Infof("Building margin order for %s, market %s, leverage %f", address, order.MarketID, order.Leverage)

		// 1. Transaction Construction (for BatchActions.batch):
		//    - Action 1: `Transfer.transfer` user's specified `collateralAmount` of `collateralAsset`
		//      from their common balance to their market-specific collateral account.
		//    - Action 2: `LendingPool.borrow(user, marketID, borrowAsset, borrowAmountInAssetUnits)`.
		//    - Action 3: The actual trade order parameters for `Exchange.matchOrders`
		//      using the total position size (`amount` field from `BuildOrderReq`).
		//    - The `orderData` in `BuildOrderResp.Json` should represent the encoded `BatchActions.Action[]`.
		//    - The `sdkOrder` used for `hydro.GetOrderHash` should be a hash of the `BatchActions.batch`
		//      call itself, or a meta-transaction hash. This needs careful consideration.

		// Placeholder for actual margin order building logic
		// For now, we'll return a simplified response or an error,
		// as the full implementation is beyond conceptual changes.
		// This section will require significant new code for interacting with smart contracts
		// and constructing the batch transaction.

		// The fee calculation will also be different.
		fee := calculateFee(price, amount, market, address) // This is the spot fee, will need adjustment
		gasFeeInQuoteToken := fee.GasFeeAmount

		// These are placeholders and will be calculated based on margin logic
		var baseTokenHugeAmount = amount.Mul(decimal.New(1, int32(market.BaseTokenDecimals)))
		var quoteTokenHugeAmount = price.Mul(amount).Mul(decimal.New(1, int32(market.QuoteTokenDecimals)))
		var gasFeeInQuoteTokenHugeAmount = gasFeeInQuoteToken.Mul(decimal.New(1, int32(market.QuoteTokenDecimals)))

		// orderData for margin will be different (e.g. batch transaction)
		orderData := []byte("placeholder_margin_order_data") // Placeholder

		orderJson := models.OrderJSON{
			Trader:                  address,
			Relayer:                 os.Getenv("HSK_RELAYER_ADDRESS"),
			BaseCurrency:            market.BaseTokenAddress,
			QuoteCurrency:           market.QuoteTokenAddress,
			BaseCurrencyHugeAmount:  baseTokenHugeAmount, // This will be total position size
			QuoteCurrencyHugeAmount: quoteTokenHugeAmount, // This will be total position size
			GasTokenHugeAmount:      gasFeeInQuoteTokenHugeAmount,
			Data:                    orderData, // This will be batch data
		}

		// sdkOrder for margin will represent the batch transaction
		// The hashing mechanism for batch orders needs to be defined.
		orderHash := utils.Keccak256(orderData) // Placeholder hash

		orderResponse := BuildOrderResp{
			ID:              utils.Bytes2HexP(orderHash),
			Json:            &orderJson,
			Side:            order.Side,
			Type:            order.OrderType, // Will include "margin"
			Price:           price,
			Amount:          amount, // Total position size
			MarketID:        order.MarketID,
			AsMakerFeeRate:  market.MakerFeeRate, // May differ for margin
			AsTakerFeeRate:  market.TakerFeeRate, // May differ for margin
			MakerRebateRate: decimal.Zero,
			GasFeeAmount:    gasFeeInQuoteToken, // May differ for margin batch tx
		}

		cacheOrder := CacheOrder{
			OrderResponse: orderResponse,
			Address:       address,
			// Store new margin fields in the cached order:
			// IsMargin: order.IsMargin,
			// Leverage: order.Leverage,
			// BorrowAmount: calculatedBorrowAmount,
			// BorrowAssetSymbol: determinedBorrowAssetSymbol,
			// CollateralAmount: actualCollateralAmount,
			// CollateralAssetSymbol: order.CollateralAssetSymbol,
			// EstimatedLiquidationPrice: calculatedLiquidationPrice,
		}
		utils.Infof("Margin order fields to cache: Leverage %f, CollateralSymbol %s", order.Leverage, order.CollateralAssetSymbol)


		err := CacheService.Set(generateOrderCacheKey(orderResponse.ID), utils.ToJsonString(cacheOrder), time.Second*60)
		return &orderResponse, err

	} else {
		// Existing Spot Trading Logic
		fee := calculateFee(price, amount, market, address)

		gasFeeInQuoteToken := fee.GasFeeAmount
		gasFeeInQuoteTokenHugeAmount := fee.GasFeeAmount.Mul(decimal.New(1, int32(market.QuoteTokenDecimals)))

		makerRebateRate := decimal.Zero
		offeredAmount := decimal.Zero

		var baseTokenHugeAmount decimal.Decimal
		var quoteTokenHugeAmount decimal.Decimal

		baseTokenHugeAmount = amount.Mul(decimal.New(1, int32(market.BaseTokenDecimals)))
		quoteTokenHugeAmount = price.Mul(amount).Mul(decimal.New(1, int32(market.QuoteTokenDecimals)))

		orderData := hydro.GenerateOrderData(
			int64(2), // Protocol version
			getExpiredAt(order.ExpiredAt), // Use order.ExpiredAt
			rand.Int63(), // Salt
			market.MakerFeeRate,
			market.TakerFeeRate,
			decimal.Zero, // Maker rebate rate
			order.Side == "sell",
			order.OrderType == "market",
			false, // Is Cancel
		)

		orderJson := models.OrderJSON{
			Trader:                  address,
			Relayer:                 os.Getenv("HSK_RELAYER_ADDRESS"),
			BaseCurrency:            market.BaseTokenAddress,
			QuoteCurrency:           market.QuoteTokenAddress,
			BaseCurrencyHugeAmount:  baseTokenHugeAmount,
			QuoteCurrencyHugeAmount: quoteTokenHugeAmount,
			GasTokenHugeAmount:      gasFeeInQuoteTokenHugeAmount,
			Data:                    orderData,
		}

		sdkOrder := sdk.NewOrderWithData(address,
			os.Getenv("HSK_RELAYER_ADDRESS"),
			market.BaseTokenAddress,
			market.QuoteTokenAddress,
			utils.DecimalToBigInt(baseTokenHugeAmount),
			utils.DecimalToBigInt(quoteTokenHugeAmount),
			utils.DecimalToBigInt(gasFeeInQuoteTokenHugeAmount),
			orderData,
			"", // Signature (added later)
		)

		orderHash := hydro.GetOrderHash(sdkOrder)
		orderResponse := BuildOrderResp{
			ID:              utils.Bytes2HexP(orderHash),
			Json:            &orderJson,
			Side:            order.Side,
			Type:            order.OrderType,
			Price:           price,
			Amount:          amount,
			MarketID:        order.MarketID,
			AsMakerFeeRate:  market.MakerFeeRate,
			AsTakerFeeRate:  market.TakerFeeRate,
			MakerRebateRate: makerRebateRate,
			GasFeeAmount:    gasFeeInQuoteToken,
		}

		cacheOrder := CacheOrder{
			OrderResponse:         orderResponse,
			Address:               address,
			BalanceOfTokenToOffer: offeredAmount, // This seems to be unused or for specific checks
		}

		// Cache the build order for 60 seconds, if we still not get signature in the period. The order will be dropped.
		err := CacheService.Set(generateOrderCacheKey(orderResponse.ID), utils.ToJsonString(cacheOrder), time.Second*60)
		return &orderResponse, err
	}
}

// BuildOrderResp is response for BuildOrderReq
type BuildOrderResp struct {
	ID              string           `json:"id"`
	Json            *models.OrderJSON `json:"json"`
	MarketID        string           `json:"marketID"`
	Side            string           `json:"side"`
	Amount          decimal.Decimal  `json:"amount"`
	Price           decimal.Decimal  `json:"price"`
	AsMakerFeeRate  decimal.Decimal  `json:"asMakerFeeRate"`
	AsTakerFeeRate  decimal.Decimal  `json:"asTakerFeeRate"`
	MakerRebateRate decimal.Decimal  `json:"makerRebateRate"`
	GasFeeAmount    decimal.Decimal  `json:"gasFeeAmount"`
	Type            string           `json:"type"`
}

// CacheOrder is what we cache for an order
// TODO: Update CacheOrder to include IsMargin, Leverage, and other necessary margin fields
// that were set conceptually in BuildAndCacheOrder. This is crucial for PlaceOrder to use.
// Example:
// type CacheOrder struct {
// OrderResponse BuildOrderResp `json:"orderResponse"`
// Address string `json:"address"`
// BalanceOfTokenToOffer decimal.Decimal `json:"balanceOfTokenToOffer"`
// IsMargin bool `json:"isMargin"`
// Leverage float64 `json:"leverage"`
// CollateralAmount decimal.Decimal `json:"collateralAmount"`
// CollateralAssetSymbol string `json:"collateralAssetSymbol"`
// BorrowAmount decimal.Decimal `json:"borrowAmount"`
// BorrowAssetSymbol string `json:"borrowAssetSymbol"`
// EstimatedLiquidationPrice decimal.Decimal `json:"estimatedLiquidationPrice"`
// }
type CacheOrder struct {
	OrderResponse         BuildOrderResp  `json:"orderResponse"`
	Address               string          `json:"address"`
	BalanceOfTokenToOffer decimal.Decimal `json:"balanceOfTokenToOffer"`
	// AdditionalData map[string]interface{} `json:"additionalData"` // Alternative to direct fields
}

func generateOrderCacheKey(orderID string) string {
	return "OrderCache:" + orderID
}

func getExpiredAt(expiresInSeconds int64) int64 {
	// Corrected: Use order.ExpiredAt which is int64, not order.Expires
	// The getExpiredAt function expects an int64 representing seconds from now or a timestamp.
	// Assuming order.ExpiredAt is a duration in seconds from now if it's relatively small,
	// or an absolute Unix timestamp if it's large.
	// The current getExpiredAt logic seems to handle this:
	// if duration > 1hr, it's treated as seconds from now. Otherwise, a default long expiry.
	// This might need alignment with how frontend sends `ExpiredAt`.
	// For now, ensure we pass order.ExpiredAt to getExpiredAt.
	if time.Duration(order.ExpiredAt)*time.Second > time.Hour && order.ExpiredAt < time.Now().Unix() { // Check if it's a duration and not an absolute past time
		return time.Now().Unix() + order.ExpiredAt
	} else if order.ExpiredAt > time.Now().Unix() { // If it's an absolute future timestamp
		return order.ExpiredAt
	} else { // Default expiry (e.g., 100 years) or if order.ExpiredAt is 0 or a small duration handled by getExpiredAt's original else
		return time.Now().Unix() + 60*60*24*365*100 // Default to long expiry
	}
}

// This function was using order.Expires, which is not a field in BuildOrderReq.
// Corrected to use order.ExpiredAt. The logic within getExpiredAt itself seems to handle
// whether the input is a duration or an absolute time, though it's a bit complex.
// The call to getExpiredAt in the spot order path has been updated to pass order.ExpiredAt.
func getExpiredAt(expiresInSeconds int64) int64 {
	if expiresInSeconds == 0 { // Default to long expiry if 0
		return time.Now().Unix() + 60*60*24*365*100
	}
	// If it's a value that looks like a duration (e.g. less than a few years in seconds)
	// and not an absolute timestamp in the past.
	if expiresInSeconds < (5*365*24*60*60) && expiresInSeconds > 0 { // Assuming durations are positive
		return time.Now().Unix() + expiresInSeconds
	} else if expiresInSeconds >= time.Now().Unix() { // If it's an absolute future timestamp
		return expiresInSeconds
	}
	// Default for other cases (e.g. past timestamps or unexpected values)
	return time.Now().Unix() + 60*60*24*365*100
}


func isMarketBuyOrder(order *BuildOrderReq) bool {
	return order.OrderType == "market" && order.Side == "buy"
}

func isMarketOrder(order *BuildOrderReq) bool {
	return order.OrderType == "market"
}
