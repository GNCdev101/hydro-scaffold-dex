package sdkextension

import (
	"math/big"

	"github.com/HydroProtocol/hydro-sdk-backend/sdk"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	// Assuming utils for type conversion, e.g., StringToAddress, DecimalToBigInt
	// "github.com/HydroProtocol/hydro-scaffold-dex/backend/utils"
)

// LendingPoolInteractionService handles interactions with LendingPool.sol
type LendingPoolInteractionService struct {
	EthClient         sdk.EthereumClient
	ContractAddress   common.Address
	ContractABI       abi.ABI
	hydroContract     *sdk.Contract // For read-only calls via main Hydro contract
}

// NewLendingPoolInteractionService creates a new service for LendingPool interactions
func NewLendingPoolInteractionService(client sdk.EthereumClient, hydroContractAddressHex string, hydroContractABIString string) (*LendingPoolInteractionService, error) {
	contractABI, err := abi.JSON([]byte(hydroContractABIString))
	if err != nil {
		return nil, err
	}

	hydroAddr := common.HexToAddress(hydroContractAddressHex)
	hydroContract := sdk.GetContract(hydroAddr, hydroContractABIString, client)


	return &LendingPoolInteractionService{
		EthClient:         client,
		ContractAddress:   hydroAddr, // This is the main Hydro contract address
		ContractABI:       contractABI,
		hydroContract:     hydroContract,
	}, nil
}

// GetAmountBorrowed calls LendingPool.getAmountBorrowed(address asset, address user, uint16 marketID)
func (s *LendingPoolInteractionService) GetAmountBorrowed(userAddress common.Address, marketID uint16, assetAddress common.Address) (*big.Int, error) {
	var out struct{ Amount *big.Int }
	err := s.hydroContract.Call(&out, "getAmountBorrowed", assetAddress, userAddress, marketID)
	if err != nil {
		return nil, err
	}
	return out.Amount, nil
}

// GetInterestRates calls LendingPool.getInterestRates(address asset, uint256 extraBorrowAmount)
func (s *LendingPoolInteractionService) GetInterestRates(assetAddress common.Address, extraBorrowAmount *big.Int) (borrowRate *big.Int, supplyRate *big.Int, error) {
	var out struct {
		BorrowInterestRate *big.Int
		SupplyInterestRate *big.Int
	}
	err := s.hydroContract.Call(&out, "getInterestRates", assetAddress, extraBorrowAmount)
	if err != nil {
		return nil, nil, err
	}
	return out.BorrowInterestRate, out.SupplyInterestRate, nil
}

// GetTotalSupply calls LendingPool.getTotalSupply(address asset)
func (s *LendingPoolInteractionService) GetTotalSupply(assetAddress common.Address) (*big.Int, error) {
	var out struct{ Amount *big.Int }
	err := s.hydroContract.Call(&out, "getTotalSupply", assetAddress)
	if err != nil {
		return nil, err
	}
	return out.Amount, nil
}

// GetTotalBorrow calls LendingPool.getTotalBorrow(address asset)
func (s *LendingPoolInteractionService) GetTotalBorrow(assetAddress common.Address) (*big.Int, error) {
	var out struct{ Amount *big.Int }
	err := s.hydroContract.Call(&out, "getTotalBorrow", assetAddress)
	if err != nil {
		return nil, err
	}
	return out.Amount, nil
}

// BuildBorrowActionData prepares ABI encoded calldata for LendingPool.borrow
// This assumes LendingPool.borrow is called internally by the main Hydro contract logic
// when processing a BatchActions.Action with a specific ActionType for "borrow".
// The 'encodedParams' for such an action would be abi.Pack("borrow", marketID, assetAddress, amount)
// if 'borrow' is a distinct function. Or, if it's part of a library call:
// The actual function signature within BatchActions.Action's encodedParams will be:
// (uint16 marketID, address asset, uint256 amount) for the BatchActions.borrow internal call.
func (s *LendingPoolInteractionService) BuildBorrowActionData(marketID uint16, assetAddress common.Address, amount *big.Int) ([]byte, error) {
	// Method name for BatchActions internal `borrow` is simply "borrow" if it's a direct function.
	// However, BatchActions.Action struct has `actionType` and `encodedParams`.
	// The `encodedParams` are for the *specific* action (like `LendingPool.borrow`).
	// The `BatchActions.ActionType` enum in Solidity for borrow is 3.
	// The `encodedParams` for ActionType 3 (Borrow) is `abi.encode(marketID, asset, amount)`
	return s.ContractABI.Pack("", marketID, assetAddress, amount) // Pack without method name for encodedParams
}

// BuildRepayActionData prepares ABI encoded calldata for LendingPool.repay
// Similar to BuildBorrowActionData, this is for the `encodedParams` of a BatchActions.Action.
// The `BatchActions.ActionType` enum in Solidity for repay is 4.
// The `encodedParams` for ActionType 4 (Repay) is `abi.encode(marketID, asset, amount)`
func (s *LendingPoolInteractionService) BuildRepayActionData(marketID uint16, assetAddress common.Address, amount *big.Int) ([]byte, error) {
	return s.ContractABI.Pack("", marketID, assetAddress, amount) // Pack without method name
}
