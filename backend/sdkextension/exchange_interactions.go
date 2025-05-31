package sdkextension

import (
	"math/big"

	// "github.com/HydroProtocol/hydro-sdk-backend/sdk"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// GoEIP712Signature mirrors Solidity Types.Signature
type GoEIP712Signature struct {
	Config [32]byte `abi:"config"`
	R      [32]byte `abi:"r"`
	S      [32]byte `abi:"s"`
}

// GoOrderParam mirrors Solidity Types.OrderParam
type GoOrderParam struct {
	Trader          common.Address    `abi:"trader"`
	BaseAssetAmount *big.Int          `abi:"baseAssetAmount"`
	QuoteAssetAmount *big.Int          `abi:"quoteAssetAmount"`
	GasTokenAmount  *big.Int          `abi:"gasTokenAmount"`
	Data            [32]byte          `abi:"data"`
	Signature       GoEIP712Signature `abi:"signature"`
}

// GoOrderAddressSet mirrors Solidity Types.OrderAddressSet
type GoOrderAddressSet struct {
	BaseAsset  common.Address `abi:"baseAsset"`
	QuoteAsset common.Address `abi:"quoteAsset"`
	Relayer    common.Address `abi:"relayer"`
}

// GoMatchParams mirrors Solidity Types.MatchParams
type GoMatchParams struct {
	TakerOrderParam         GoOrderParam        `abi:"takerOrderParam"`
	MakerOrderParams        []GoOrderParam      `abi:"makerOrderParams"`
	BaseAssetFilledAmounts  []*big.Int          `abi:"baseAssetFilledAmounts"`
	OrderAddressSet         GoOrderAddressSet   `abi:"orderAddressSet"`
}

// ExchangeInteractionService handles interactions with Exchange.sol logic
type ExchangeInteractionService struct {
	// EthClient         sdk.EthereumClient // Not needed for just building calldata
	HydroContractAddr common.Address
	HydroContractABI  abi.ABI
}

// NewExchangeInteractionService creates a new service
func NewExchangeInteractionService(hydroContractAddressHex string, hydroContractABIString string) (*ExchangeInteractionService, error) {
	contractABI, err := abi.JSON([]byte(hydroContractABIString))
	if err != nil {
		return nil, err
	}
	return &ExchangeInteractionService{
		HydroContractAddr: common.HexToAddress(hydroContractAddressHex),
		HydroContractABI:  contractABI,
	}, nil
}

// BuildMatchOrdersActionData prepares ABI encoded calldata for `Hydro.matchOrders(Types.MatchParams memory params)`
// This is for a SEPARATE transaction, not for BatchActions.ActionType.
func (s *ExchangeInteractionService) BuildMatchOrdersActionData(params GoMatchParams) ([]byte, error) {
	return s.HydroContractABI.Pack("matchOrders", params)
}
