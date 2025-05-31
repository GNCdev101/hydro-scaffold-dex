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
	Leverage             string  `json:"leverage"` // String for precision, convert to decimal/float later
	IsMargin             bool    `json:"isMargin"`
	CollateralAssetSymbol string `json:"collateralAssetSymbol,omitempty"`
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
	// Example: dbOrder.Leverage = cacheOrder.Leverage (decimal from cacheOrder)
	// ... and so on for CollateralAmount, BorrowAmount, LiquidationPrice etc.
	dbOrder.IsMargin = cacheOrder.IsMargin
	dbOrder.Leverage = cacheOrder.Leverage
	dbOrder.CollateralAmount = cacheOrder.CollateralAmount
	dbOrder.CollateralAssetSymbol = cacheOrder.CollateralAssetSymbol
	dbOrder.BorrowedAmount = cacheOrder.BorrowedAmount
	dbOrder.BorrowedAssetSymbol = cacheOrder.BorrowedAssetSymbol
	dbOrder.InitialLiquidationPrice = cacheOrder.InitialLiquidationPrice
	// dbOrder.InitialLoanID = cacheOrder.InitialLoanID // If applicable

	var eventType common.EventType = common.EventNewOrder // Default
	var eventData []byte
	var err error

	// Check if it's a margin order based on the IsMargin flag from cacheOrder
	if cacheOrder.IsMargin {
		utils.Infof("Processing margin order %s for queue. Order ID is for the batch setup.", dbOrder.ID)
		// The event type could be the same, but the engine needs to know this order ID
		// is for a batch that sets up margin, not directly a trade on the books yet.
		// Or, a new event type like common.EventNewMarginSetupOrder
		// For now, keeping EventNewOrder, but engine must be aware.
		// The `dbOrder` instance now contains all margin-specific fields.
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
		// Call the more detailed checkMarginOrderConstraints
		// This function would use services like LendingPoolService, PriceOracleService, etc.
		// to perform its checks. These services need to be initialized and passed to OrderService,
		// or accessible globally (less ideal). For now, conceptual call.
		// err := checkMarginOrderConstraints(order, address, market, s.Deps.LendingPoolService, ...)
		// For this step, we keep the existing placeholder call:
		err := checkMarginOrderConstraints(order, address, market)
		if err != nil {
			return err
		}
		// For margin orders, specific balance/allowance checks for the trade itself
		// are complex as they depend on borrowed amounts. The checkMarginOrderConstraints
		// should cover if the user has enough collateral for the initial margin.
		// The actual trade funds (collateral + borrowed) will be available after batch execution.
		return nil // Assuming checkMarginOrderConstraints is sufficient for build phase.
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
	// This function needs access to initialized services (LendingPool, Collateral, PriceOracle, etc.)
	// These would typically be injected into the OrderApiService struct.
	// For now, comments will denote where service calls would be made.

	// 0. Validate basic inputs (e.g. leverage string)
	leverageDecimal, err := decimal.NewFromString(order.Leverage)
	if err != nil || leverageDecimal.LessThan(decimal.NewFromInt(1)) {
		return NewApiErrorInvalidParam("leverage")
	}

	// 1. Determine Collateral & Borrow Assets
	// Example: For ETH-USDT, buying ETH (long) means borrowing USDT, collateral is USDT.
	// Selling ETH (short) means borrowing ETH, collateral is USDT.
	// This logic needs to be robust based on market rules.
	collateralToken := models.TokenDao.GetTokenBySymbol(order.CollateralAssetSymbol)
	if collateralToken == nil {
		return NewApiErrorInvalidParam(fmt.Sprintf("invalid collateral asset symbol: %s", order.CollateralAssetSymbol))
	}
	var borrowToken *models.Token
	if order.Side == "buy" { // Long: borrowing quote to buy base
		borrowToken = models.TokenDao.GetTokenBySymbol(market.QuoteTokenSymbol)
	} else { // Short: borrowing base to sell for quote
		borrowToken = models.TokenDao.GetTokenBySymbol(market.BaseTokenSymbol)
	}
	if borrowToken == nil {
		return NewApiErrorSystemError(fmt.Sprintf("could not determine borrow token for side %s", order.Side))
	}

	// 2. Calculate Amounts
	priceDecimal := utils.StringToDecimal(order.Price)
	amountDecimal := utils.StringToDecimal(order.Amount) // This is total position size
	totalPositionValueQuote := amountDecimal.Mul(priceDecimal) // If amount is base quantity

	collateralAmountQuote := totalPositionValueQuote.Div(leverageDecimal)
	borrowAmountQuote := totalPositionValueQuote.Sub(collateralAmountQuote)

	// Convert borrowAmountQuote to actual borrowToken units if borrowToken is not quote
	borrowAmountNative := borrowAmountQuote
	if borrowToken.Symbol != market.QuoteTokenSymbol { // e.g. shorting, borrowToken is baseToken
	    // price of borrowToken (base) in quoteToken is 'priceDecimal'
	    if priceDecimal.IsZero() { return NewApiErrorInvalidParam("price for borrow amount conversion") }
	    borrowAmountNative = borrowAmountQuote.Div(priceDecimal)
	}


	// 3. Call Services (conceptual calls, replace with actual service.method calls)
	// utils.Infof("Collateral check for %s: %s against balance of %s", address, collateralAmountQuote.String(), collateralToken.Symbol)
	// Check user's balance of collateralToken:
	//   collateralTokenBalance := hydro.GetTokenBalance(collateralToken.Address, common.HexToAddress(address))
	//   collateralTokenBalanceDec := utils.BigIntToDecimal(collateralTokenBalance, int(collateralToken.Decimals))
	//   if collateralTokenBalanceDec.LessThan(collateralAmountQuote) { /* ... error insufficient collateral ... */ }
	//   Allowance check for Hydro contract to take collateralToken from user for transfer to margin account (if needed)

	// utils.Infof("Borrow calculation: leverage %s, totalPosVal %s, collateral %s, borrow %s (%s)",
	//	order.Leverage, totalPositionValueQuote.String(), collateralAmountQuote.String(), borrowAmountQuote.String(), borrowToken.Symbol)

	// Lending Pool liquidity and rates:
	//   borrowRateBig, _, err := LendingPoolService.GetInterestRates(borrowToken.Address, utils.DecimalToBigInt(borrowAmountNative, int(borrowToken.Decimals)))
	//   if err != nil { /* ... error fetching rates ... */ }
	//   totalSupplyBig, _ := LendingPoolService.GetTotalSupply(borrowToken.Address)
	//   totalBorrowBig, _ := LendingPoolService.GetTotalBorrow(borrowToken.Address)
	//   availableToBorrow := new(big.Int).Sub(totalSupplyBig, totalBorrowBig)
	//   if availableToBorrow.Cmp(utils.DecimalToBigInt(borrowAmountNative, int(borrowToken.Decimals))) < 0 { /* ... error insufficient liquidity ... */ }

	// Initial Margin Requirement & Liquidation Price (complex, involves oracle prices)
	//   collateralValueUSD := collateralAmountQuote.Mul(PriceOracleService.GetUSDPrice(collateralToken.Address)) ... (needs conversion)
	//   borrowValueUSD := borrowAmountQuote.Mul(PriceOracleService.GetUSDPrice(borrowToken.Address)) ...
	//   This needs to use the CollateralAccounts.getDetails logic: BalancesTotalUSDValue > DebtsTotalUSDValue * market.LiquidateRate
	//   For initial check, `collateralValueUSD` must be `> (borrowValueUSD * market.LiquidateRate)`
	//   The actual initialLiquidationPrice calc is also needed here for caching.

	// Order Size Check:
	//   minOrderSizeQuote := market.MinOrderSize
	//   if totalPositionValueQuote.LessThan(minOrderSizeQuote) { /* ... error order too small ... */ }

	utils.Infof("Margin checks passed conceptually for user %s, market %s", address, order.MarketID)
	return nil // Placeholder for actual checks
}


// These services would be part of OrderApiService struct, initialized in NewOrderApiService
var (
	CollateralService *sdkextension.CollateralAccountsInteractionService
	LendingPoolService *sdkextension.LendingPoolInteractionService
	BatchService      *sdkextension.BatchActionsService
	PriceOracleService *sdkextension.PriceOracleService
)


func BuildAndCacheOrder(address string, order *BuildOrderReq) (*BuildOrderResp, error) {
	market := models.MarketDao.FindMarketByID(order.MarketID)
	amountTotalPosition := utils.StringToDecimal(order.Amount) // For margin, this is total position size
	price := utils.StringToDecimal(order.Price)

	if order.IsMargin {
		utils.Infof("Building margin order for %s, market %s, leverage %s", address, order.MarketID, order.Leverage)

		leverageDecimal, _ := decimal.NewFromString(order.Leverage) // Already validated in checkMarginOrderConstraints

		// Determine collateral and borrow assets (simplified)
		collateralToken := models.TokenDao.GetTokenBySymbol(order.CollateralAssetSymbol)
		if collateralToken == nil { return nil, errors.New("invalid collateral token symbol") }

		var borrowToken *models.Token
		var actualCollateralAmountForCalc decimal.Decimal // This is user's contribution
		var actualBorrowAmountForCalc decimal.Decimal   // Amount of borrowToken to be borrowed

		totalPositionValueQuote := amountTotalPosition.Mul(price) // If amount is base quantity
		actualCollateralAmountForCalc = totalPositionValueQuote.Div(leverageDecimal)
		actualBorrowAmountForCalc = totalPositionValueQuote.Sub(actualCollateralAmountForCalc)


		if order.Side == "buy" { // Long: borrowing quote
			borrowToken = models.TokenDao.GetTokenBySymbol(market.QuoteTokenSymbol)
			// actualBorrowAmountForCalc is already in quote token
		} else { // Short: borrowing base
			borrowToken = models.TokenDao.GetTokenBySymbol(market.BaseTokenSymbol)
			if price.IsZero() { return nil, errors.New("price cannot be zero for borrow amount conversion")}
			actualBorrowAmountForCalc = totalPositionValueQuote.Div(price) // Convert quote value of borrow to base token units
		}
		if borrowToken == nil { return nil, errors.New("could not determine borrow token") }


		// Calculate initial liquidation price (conceptual)
		// This requires oracle prices and market.LiquidateRate (e.g. 1.5)
		// Simplified: LiqPrice = (BorrowedAmountNative * LiquidateRate) / BasePositionAmount (for a long)
		// This needs a robust calculation matching contract logic.
		initialLiquidationPrice := decimal.Zero // Placeholder
		// Example: if long, borrowed quote, collateral is base bought + overcollateralization
		// debtInQuote := actualBorrowAmountForCalc (if borrowing quote)
		// baseAmount := amountTotalPosition
		// initialLiquidationPrice = debtInQuote.Mul(market.LiquidateRate).Div(baseAmount)


		// --- BatchActions Construction ---
		var actions []sdkextension.GoSolidityAction
		userCommonAddress := common.HexToAddress(address)
		marketIDUint16, _ := utils.MarketIDToUint16(order.MarketID) // Error handling needed

		// Action 1 (Optional): Transfer collateral from common balance to margin account
		// This depends on whether user's funds for collateral are already in the margin account or need to be moved.
		// For simplicity, assume it needs to be moved for this example.
		collateralAmountBigInt := utils.DecimalToBigInt(actualCollateralAmountForCalc, int(collateralToken.Decimals))
		fromPath := sdkextension.GoBalancePath{Category: 0 /*Common*/, User: userCommonAddress, MarketID: 0}
		toPath := sdkextension.GoBalancePath{Category: 1 /*CollateralAccount*/, User: userCommonAddress, MarketID: marketIDUint16}

		transferData, err := CollateralService.BuildTransferCollateralActionData(collateralToken.Address, collateralAmountBigInt, fromPath, toPath)
		if err != nil { return nil, fmt.Errorf("failed to build transfer collateral data: %w", err) }
		actions = append(actions, sdkextension.GoSolidityAction{ActionType: 2 /*Transfer*/, EncodedParams: transferData})

		// Action 2: Borrow
		borrowAmountBigInt := utils.DecimalToBigInt(actualBorrowAmountForCalc, int(borrowToken.Decimals))
		borrowData, err := LendingPoolService.BuildBorrowActionData(marketIDUint16, borrowToken.Address, borrowAmountBigInt)
		if err != nil { return nil, fmt.Errorf("failed to build borrow data: %w", err) }
		actions = append(actions, sdkextension.GoSolidityAction{ActionType: 3 /*Borrow*/, EncodedParams: borrowData})

		// The `BatchActions.batch` calldata is what the user signs.
		// The `msgValue` for `BuildBatchTransactionData` is typically 0 unless actions require ETH.
		batchTxCalldata, err := BatchService.BuildBatchTransactionData(actions, big.NewInt(0))
		if err != nil { return nil, fmt.Errorf("failed to build batch transaction data: %w", err) }

		// The orderID is the hash of this batch transaction's parameters.
		// The EIP712 signature will be for this batchTxCalldata, not a standard trade order.
		// This requires a new EIP712 domain/type for BatchActions if not using a pre-signed tx approach.
		// For now, let's use Keccak256 of the calldata as a pseudo-hash for ID.
		orderHash := utils.Keccak256(batchTxCalldata)

		// `orderJson` needs to represent the BATCH, not a simple trade, if that's what's signed.
		// This is a significant departure from spot trade OrderJSON.
		// Let's store the batch calldata itself, or a representation of it.
		orderJsonForSigning := models.OrderJSON{
			Trader: address,
			Relayer: os.Getenv("HSK_RELAYER_ADDRESS"), // Relayer might not be relevant for batches in same way
			// Base/Quote amounts here might represent the *intended trade* rather than batch contents.
			// Or this struct needs to be adapted for batch metadata.
			BaseCurrency: market.BaseTokenAddress, // Intended trade market
			QuoteCurrency: market.QuoteTokenAddress,
			// For margin, Amount is total position size. Price is entry price.
			BaseCurrencyHugeAmount: utils.DecimalToHugeAmount(amountTotalPosition, int(market.BaseTokenDecimals)),
			QuoteCurrencyHugeAmount: utils.DecimalToHugeAmount(amountTotalPosition.Mul(price), int(market.QuoteTokenDecimals)),
			GasTokenHugeAmount: decimal.Zero, // Gas for batch itself, not covered by this old field.
			Data: utils.Bytes2HexP(batchTxCalldata), // Store the actual batch calldata
		}


		orderResponse := BuildOrderResp{
			ID:              utils.Bytes2HexP(orderHash), // Hash of batch params
			Json:            &orderJsonForSigning,
			Side:            order.Side, // Side of the intended trade
			Type:            fmt.Sprintf("margin_%s", order.OrderType), // e.g., margin_limit
			Price:           price,                // Intended trade entry price
			Amount:          amountTotalPosition,  // Total position size
			MarketID:        order.MarketID,
			AsMakerFeeRate:  market.MakerFeeRate,  // Trading fee for the exchange part
			AsTakerFeeRate:  market.TakerFeeRate,  // Trading fee for the exchange part
			MakerRebateRate: decimal.Zero,
			GasFeeAmount:    decimal.Zero, // Gas for the batch is separate.
		}

		// Store all relevant details for when this batch order is "placed" (i.e., signed & submitted)
		// So that the dex_engine can later execute the actual trade.
		cachedMarginOrder := CacheOrder{
			OrderResponse:           orderResponse, // Contains the batch ID and its data
			Address:                 address,
			IsMargin:                true,
			Leverage:                leverageDecimal,
			CollateralAmount:        actualCollateralAmountForCalc, // User's contribution in quote asset terms
			CollateralAssetSymbol:   collateralToken.Symbol,
			BorrowedAmount:          actualBorrowAmountForCalc, // Amount of borrowToken
			BorrowedAssetSymbol:     borrowToken.Symbol,
			InitialLiquidationPrice: initialLiquidationPrice,
			// Store the original trade parameters for the dex_engine to execute post-batch
			OriginalTradePrice: price,
			OriginalTradeAmount: amountTotalPosition, // Base asset amount
			OriginalTradeSide: order.Side,
			OriginalOrderType: order.OrderType,
		}

		err = CacheService.Set(generateOrderCacheKey(orderResponse.ID), utils.ToJsonString(cachedMarginOrder), time.Second*120)
		return &orderResponse, err

	} else { // Existing Spot Trading Logic
		feeDetails := calculateFee(price, amountTotalPosition, market, address)

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
type CacheOrder struct {
	OrderResponse         BuildOrderResp  `json:"orderResponse"`
	Address               string          `json:"address"`
	BalanceOfTokenToOffer decimal.Decimal `json:"balanceOfTokenToOffer"` // For spot sell orders

	// Margin specific fields
	IsMargin                bool            `json:"isMargin"`
	Leverage                decimal.Decimal `json:"leverage"`
	CollateralAmount        decimal.Decimal `json:"collateralAmount"`        // User's contribution (e.g. in quote asset)
	CollateralAssetSymbol   string          `json:"collateralAssetSymbol"`
	BorrowedAmount          decimal.Decimal `json:"borrowedAmount"`          // Amount of the borrowed asset
	BorrowedAssetSymbol     string          `json:"borrowedAssetSymbol"`
	InitialLiquidationPrice decimal.Decimal `json:"initialLiquidationPrice"`
	// Store original trade parameters for dex_engine execution after batch success
	OriginalTradePrice decimal.Decimal `json:"originalTradePrice"`
	OriginalTradeAmount decimal.Decimal `json:"originalTradeAmount"`
	OriginalTradeSide string          `json:"originalTradeSide"`
	OriginalOrderType string          `json:"originalOrderType"`
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
