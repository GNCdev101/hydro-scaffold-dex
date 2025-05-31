package sdkextension

import (
	"math/big"

	"github.com/HydroProtocol/hydro-sdk-backend/sdk"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// GoCollateralAccountDetails mirrors Solidity Types.CollateralAccountDetails
type GoCollateralAccountDetails struct {
	Liquidatable          bool
	Status                uint8 // 0 for Normal, 1 for Liquid
	DebtsTotalUSDValue    *big.Int
	BalancesTotalUSDValue *big.Int
}

// GoBalancePath mirrors Solidity Types.BalancePath
// Used for Transfer.transfer calls
type GoBalancePath struct {
	Category uint8 `abi:"category"` // 0 for Common, 1 for CollateralAccount
	MarketID uint16 `abi:"marketID"`
	User     common.Address `abi:"user"`
}

// CollateralAccountsInteractionService handles interactions with CollateralAccounts.sol logic
type CollateralAccountsInteractionService struct {
	EthClient         sdk.EthereumClient
	HydroContractAddr common.Address
	HydroContractABI  abi.ABI
	hydroContract     *sdk.Contract
}

// NewCollateralAccountsInteractionService creates a new service
func NewCollateralAccountsInteractionService(client sdk.EthereumClient, hydroContractAddressHex string, hydroContractABIString string) (*CollateralAccountsInteractionService, error) {
	contractABI, err := abi.JSON([]byte(hydroContractABIString))
	if err != nil {
		return nil, err
	}
	hydroAddr := common.HexToAddress(hydroContractAddressHex)
	hydroContract := sdk.GetContract(hydroAddr, hydroContractABIString, client)

	return &CollateralAccountsInteractionService{
		EthClient:         client,
		HydroContractAddr: hydroAddr,
		HydroContractABI:  contractABI,
		hydroContract:     hydroContract,
	}, nil
}

// GetCollateralAccountDetails calls `Hydro.getAccountDetails(address user, uint16 marketID)`
func (s *CollateralAccountsInteractionService) GetCollateralAccountDetails(userAddress common.Address, marketID uint16) (*GoCollateralAccountDetails, error) {
	var out GoCollateralAccountDetails // Must match the exact structure returned by the contract call
	err := s.hydroContract.Call(&out, "getAccountDetails", userAddress, marketID)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// GetTransferableAmount calls `Hydro.getMarketTransferableAmount(uint16 marketID, address asset, address user)`
func (s *CollateralAccountsInteractionService) GetTransferableAmount(userAddress common.Address, marketID uint16, assetAddress common.Address) (*big.Int, error) {
	var out struct{ Amount *big.Int }
	// Note: ABI shows `getMarketTransferableAmount(uint16 marketID, address asset, address user)`
	err := s.hydroContract.Call(&out, "getMarketTransferableAmount", marketID, assetAddress, userAddress)
	if err != nil {
		return nil, err
	}
	return out.Amount, nil
}

// BuildTransferCollateralActionData prepares ABI encoded calldata for Transfer.transfer
// This is for the `encodedParams` of a BatchActions.Action with ActionType 2 (Transfer).
// The `encodedParams` for ActionType 2 (Transfer) is `abi.encode(asset, fromPath, toPath, amount)`
func (s *CollateralAccountsInteractionService) BuildTransferCollateralActionData(
	assetAddress common.Address,
	amount *big.Int,
	fromPath GoBalancePath,
	toPath GoBalancePath) ([]byte, error) {

	// The arguments for abi.Pack need to exactly match the ones expected by the
	// BatchActions.Action.encodedParams for a "Transfer" type.
	// Based on BatchActions.sol: transfer(state, action) decodes (address, Types.BalancePath, Types.BalancePath, uint256)
	// from action.encodedParams.
	return s.HydroContractABI.Pack("", assetAddress, fromPath, toPath, amount) // Pack without method name
}
