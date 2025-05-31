package sdkextension

import (
	"math/big"

	"github.com/HydroProtocol/hydro-sdk-backend/sdk"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	// "github.com/HydroProtocol/hydro-sdk-backend/transaction" // For sending tx
)

// GoSolidityAction mirrors BatchActions.Action: (actionType uint8, encodedParams bytes)
type GoSolidityAction struct {
	ActionType    uint8  `abi:"actionType"`// Enum from BatchActions.ActionType
	EncodedParams []byte `abi:"encodedParams"`// ABI encoded parameters for the specific action
}

// BatchActionsService handles preparing batch transactions
type BatchActionsService struct {
	EthClient         sdk.EthereumClient
	HydroContractAddr common.Address
	HydroContractABI  abi.ABI
	// txSender          *transaction.Manager // For actually sending the tx
}

// NewBatchActionsService creates a new service
func NewBatchActionsService(client sdk.EthereumClient, hydroContractAddressHex string, hydroContractABIString string /*txMgr *transaction.Manager*/) (*BatchActionsService, error) {
	contractABI, err := abi.JSON([]byte(hydroContractABIString))
	if err != nil {
		return nil, err
	}
	return &BatchActionsService{
		EthClient:         client,
		HydroContractAddr: common.HexToAddress(hydroContractAddressHex),
		HydroContractABI:  contractABI,
		// txSender:          txMgr,
	}, nil
}

// BuildBatchTransactionData prepares calldata for the main `Hydro.batch(BatchActions.Action[] memory actions, uint256 msgValue)` call.
func (s *BatchActionsService) BuildBatchTransactionData(actions []GoSolidityAction, msgValue *big.Int) ([]byte, error) {
	// The main 'batch' function in Hydro.sol takes (Action[] memory actions) as the first param.
	// It appears msgValue is handled by the payable keyword, not an explicit param in ABI for non-payable part.
	// The Hydro ABI shows: batch(tuple[] actions) payable.
	// The tuple[] actions corresponds to GoSolidityAction[]
	// So, we pack just the actions array.
	return s.HydroContractABI.Pack("batch", actions)
}

/*
// SendBatchTransaction signs and sends a batch transaction
func (s *BatchActionsService) SendBatchTransaction(actions []GoSolidityAction, msgValue *big.Int, privateKeyHex string) (common.Hash, error) {
	calldata, err := s.BuildBatchTransactionData(actions, msgValue)
	if err != nil {
		return common.Hash{}, err
	}

	tx, err := s.txSender.NewTransaction(privateKeyHex, s.HydroContractAddr.Hex(), msgValue, calldata)
	if err != nil {
		return common.Hash{}, err
	}

	err = s.txSender.SendTransaction(tx)
	if err != nil {
		return common.Hash{}, err
	}
	return tx.GetHash(), nil
}
*/
