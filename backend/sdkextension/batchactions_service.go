package sdkextension

import (
	"fmt"
	"math/big"

	// "github.com/HydroProtocol/hydro-sdk-backend/sdk" // For potential Ethereum client or contract interaction utilities
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// GoAction mirrors the structure needed to represent an action for BatchActions.batch.
// The ActionType must correspond to the enum defined in BatchActions.sol (e.g., HydroLib.ActionType).
// EncodedParams is the already ABI-encoded calldata for the specific sub-action
// (e.g., for LendingPool.borrow, Transfer.transfer).
type GoAction struct {
	ActionType    uint8  // Corresponds to BatchActions.ActionType or HydroLib.ActionType enum
	To            common.Address // The target contract for this specific action (e.g., LendingPool address, or Hydro contract for Transfer)
	Value         *big.Int // ETH value for this specific action (usually 0 for token ops)
	EncodedParams []byte // Pre-encoded parameters for the action's target function
}


// BatchActionsService provides methods to interact with BatchActions logic,
// typically via the main Hydro Protocol contract.
type BatchActionsService struct {
	HydroContractAddress common.Address // Address of the main Hydro contract that has the `batch` method
	HydroContractABI     abi.ABI        // ABI of the main Hydro contract, specifically needing the `batch` method signature
}

// NewBatchActionsService creates a new instance of BatchActionsService.
func NewBatchActionsService(hydroContractAddressHex string, hydroAbiJson string) (*BatchActionsService, error) {
	address := common.HexToAddress(hydroContractAddressHex)
	parsedABI, err := abi.JSON([]byte(hydroAbiJson)) // ABI for the main Hydro contract
	if err != nil {
		return nil, fmt.Errorf("failed to parse Hydro contract ABI for BatchActionsService: %w", err)
	}

	return &BatchActionsService{
		HydroContractAddress: address,
		HydroContractABI:     parsedABI,
	}, nil
}

// BuildBatchTransactionData encodes the calldata for the BatchActions.batch operation.
// Smart Contract Method Targeted: BatchActions.batch(Store.State storage state, Action[] memory actions, uint256 msgValue)
// This is typically exposed via a method like `batch(Action[] memory actions)` on the main Hydro contract.
// The `actions` parameter in Go is `[]GoAction`. We need to ensure `GoAction` can be packed correctly.
// The Solidity `Action` struct is likely `struct Action { ActionType actionType; address to; uint256 value; bytes data; }`
// We need to make sure GoAction maps to this correctly for ABI packing.
// Let's redefine GoAction to match the typical Solidity struct for such batch actions more closely.
type GoSolidityAction struct {
    ActionType uint8          `abi:"actionType"`
    To         common.Address `abi:"to"`
    Value      *big.Int       `abi:"value"`
    Data       []byte         `abi:"data"`
}


// BuildBatchTransactionData prepares the calldata for the main `batch` call on the Hydro contract.
// `actions` is a slice of GoSolidityAction, where each `Data` field is already ABI-encoded
// for its respective low-level function (e.g., LendingPool.borrow, Transfer.transfer).
// `msgValue` is the total ETH value to be sent with the batch transaction itself.
func (s *BatchActionsService) BuildBatchTransactionData(actions []GoSolidityAction, msgValue *big.Int) ([]byte, error) {
	methodName := "batch" // This must match the ABI definition in the main Hydro contract for the BatchActions.batch call

	// Ensure msgValue is not nil
	if msgValue == nil {
		msgValue = big.NewInt(0)
	}

	// The `batch` method in Solidity likely takes (Action[] memory actions, uint256 msgValue)
	// if `state` is handled internally. Or just (Action[] memory actions) if msgValue is also implicit.
	// Let's assume the Hydro contract's `batch` method is: `batch(Action[] memory _actions)` and it uses `msg.value`.
	// Or `batch(Action[] memory _actions, uint256 _msgValue)` if explicit.
	// For this example, let's assume: `batch(Action[] _actions)` and msg.value is used by the contract.
	// If the contract is `payable batch(Action[] memory actions)`, then we only pack `actions`.
	// If it's `batch(Action[] memory actions, uint256 valueParam)`, we pack both.
	// Based on `BatchActions.batch(Store.State storage state, Action[] memory actions, uint256 msgValue)`,
	// the exposed method on Hydro contract is likely `batch(Action[] memory actions)` (payable) or
	// `batch(Action[] memory actions, uint256 value)`
	// Let's assume the exposed method is `batch(Action[] memory actions)` and it's payable.

	packedBatchData, err := s.HydroContractABI.Pack(methodName, actions)
	if err != nil {
		// Fallback: try packing with msgValue if the first attempt fails,
		// maybe the ABI has `batch(Action[] memory actions, uint256 msgValue)`
		packedBatchData, err = s.HydroContractABI.Pack(methodName, actions, msgValue)
		if err != nil {
			return nil, fmt.Errorf("failed to pack data for %s (tried with and without explicit msgValue): %w", methodName, err)
		}
	}

	// The returned `packedBatchData` is the complete calldata for the `HydroContract.batch(...)` transaction.
	// The transaction to the Ethereum network would be:
	// To: s.HydroContractAddress
	// Value: msgValue (this is the ETH sent with the transaction itself)
	// Data: packedBatchData

	fmt.Printf("Conceptual ABI pack: HydroContract.batch(actions: %d, msgValue for tx: %s)\n", len(actions), msgValue.String())
	return packedBatchData, nil
}
