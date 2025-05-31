package sdkextension

import (
	"math/big"

	"github.com/HydroProtocol/hydro-sdk-backend/sdk"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// PriceOracleService handles interactions with price oracles.
// It will use the Hydro.getAssetOraclePrice function.
type PriceOracleService struct {
	EthClient         sdk.EthereumClient
	HydroContractAddr common.Address
	HydroContractABI  abi.ABI
	hydroContract     *sdk.Contract
}

// NewPriceOracleService creates a new service
func NewPriceOracleService(client sdk.EthereumClient, hydroContractAddressHex string, hydroContractABIString string) (*PriceOracleService, error) {
	contractABI, err := abi.JSON([]byte(hydroContractABIString))
	if err != nil {
		return nil, err
	}
	hydroAddr := common.HexToAddress(hydroContractAddressHex)
	hydroContract := sdk.GetContract(hydroAddr, hydroContractABIString, client)

	return &PriceOracleService{
		EthClient:         client,
		HydroContractAddr: hydroAddr,
		HydroContractABI:  contractABI,
		hydroContract:     hydroContract,
	}, nil
}

// GetUSDPrice calls `Hydro.getAssetOraclePrice(address assetAddress)`
func (s *PriceOracleService) GetUSDPrice(assetAddress common.Address) (*big.Int, error) {
	var out struct{ Price *big.Int }
	err := s.hydroContract.Call(&out, "getAssetOraclePrice", assetAddress)
	if err != nil {
		return nil, err
	}
	return out.Price, nil
}
