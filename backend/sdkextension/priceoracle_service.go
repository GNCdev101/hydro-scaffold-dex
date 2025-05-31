package sdkextension

import (
	"fmt"
	"math/big"

	"github.com/HydroProtocol/hydro-sdk-backend/sdk" // For sdk.EthereumClient
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	// "golang.org/x/net/context" // For context.Context
	// "github.com/ethereum/go-ethereum" // For ethereum.CallMsg
)

// PriceOracleService provides methods to interact with Price Oracle smart contracts.
type PriceOracleService struct {
	EthClient            sdk.EthereumClient
	AssetToOracleAddress map[common.Address]common.Address // Maps asset address to its specific oracle contract address
	DefaultOracleAddress common.Address                  // A fallback oracle if specific one isn't mapped
	OracleABI            abi.ABI                           // Assuming a common IPriceOracle interface ABI
}

// PriceOracleServiceConfig holds configuration for the PriceOracleService.
// Addresses should be hex strings.
type PriceOracleServiceConfig struct {
	AssetToOracleAddressHex map[string]string `json:"assetToOracleAddressHex"`
	DefaultOracleAddressHex string            `json:"defaultOracleAddressHex"`
	OracleAbiJson           string            `json:"oracleAbiJson"` // ABI for IPriceOracle.getPrice()
}

// NewPriceOracleService creates a new instance of PriceOracleService.
func NewPriceOracleService(ethClient sdk.EthereumClient, config PriceOracleServiceConfig) (*PriceOracleService, error) {
	parsedABI, err := abi.JSON([]byte(config.OracleAbiJson))
	if err != nil {
		return nil, fmt.Errorf("failed to parse Price Oracle ABI: %w", err)
	}

	assetToOracle := make(map[common.Address]common.Address)
	for assetHex, oracleHex := range config.AssetToOracleAddressHex {
		assetAddr := common.HexToAddress(assetHex)
		oracleAddr := common.HexToAddress(oracleHex)
		assetToOracle[assetAddr] = oracleAddr
	}

	defaultOracleAddr := common.HexToAddress(config.DefaultOracleAddressHex)
	if defaultOracleAddr == (common.Address{}) && len(assetToOracle) == 0 {
		fmt.Println("Warning: PriceOracleService initialized without a default oracle or any specific asset oracles.")
	}

	return &PriceOracleService{
		EthClient:            ethClient,
		AssetToOracleAddress: assetToOracle,
		DefaultOracleAddress: defaultOracleAddr,
		OracleABI:            parsedABI,
	}, nil
}

// GetUSDPrice fetches the USD price of a given asset.
// It looks up the correct oracle address from its configuration or uses the default.
// Smart Contract Method Called: IPriceOracle.getPrice(address asset)
func (s *PriceOracleService) GetUSDPrice(assetAddress common.Address) (*big.Int, error) {
	oracleAddress, exists := s.AssetToOracleAddress[assetAddress]
	if !exists {
		if s.DefaultOracleAddress == (common.Address{}) {
			return nil, fmt.Errorf("no price oracle configured for asset %s and no default oracle set", assetAddress.Hex())
		}
		oracleAddress = s.DefaultOracleAddress
		fmt.Printf("Using default oracle %s for asset %s\n", oracleAddress.Hex(), assetAddress.Hex())
	} else {
		fmt.Printf("Using specific oracle %s for asset %s\n", oracleAddress.Hex(), assetAddress.Hex())
	}

	methodName := "getPrice" // Method name from IPriceOracle interface
	// The IPriceOracle.getPrice(address asset) might not actually take the asset address
	// if the oracle is specific to one asset (e.g. ETHUSDOracle.getPrice()).
	// Or, a multi-asset oracle might take it. Assuming here the common interface is `getPrice()`
	// and the oracle contract itself knows which asset it's for, or `getPrice(asset)` if it's a multi-asset oracle.
	// The example `IPriceOracle.getPrice(address asset)` implies the oracle itself can serve multiple assets.
	// Let's assume the ABI method `getPrice` is parameter-less for a single-asset oracle,
	// or takes the asset if it's a multi-asset oracle.
	// For this conceptualization, let's assume the oracle is for a specific asset and getPrice() has no params,
	// or the `assetAddress` is passed if the oracle supports multiple.
	// The provided signature `IPriceOracle.getPrice(address asset)` suggests the asset is an argument.

	var packedData []byte
	var err error

	// Check if the ABI method "getPrice" expects an argument.
	method, methodExists := s.OracleABI.Methods[methodName]
	if !methodExists {
		return nil, fmt.Errorf("method %s not found in Price Oracle ABI", methodName)
	}

	if len(method.Inputs) > 0 {
		// If getPrice expects arguments (e.g. the asset address itself)
		packedData, err = s.OracleABI.Pack(methodName, assetAddress)
	} else {
		// If getPrice expects no arguments (oracle dedicated to one asset)
		packedData, err = s.OracleABI.Pack(methodName)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to pack data for %s on oracle %s: %w", methodName, oracleAddress.Hex(), err)
	}

	// --- Conceptual Call to Contract ---
	// result, err := s.EthClient.CallContract(context.Background(), ethereum.CallMsg{
	// 	To:   &oracleAddress,
	// 	Data: packedData,
	// }, nil) // nil for block number means latest
	// if err != nil {
	// 	return nil, fmt.Errorf("contract call to oracle %s method %s failed: %w", oracleAddress.Hex(), methodName, err)
	// }
	//
	// price, ok := new(big.Int).SetString(common.Bytes2Hex(result), 16) // Simplified; proper unpacking needed
	// if !ok {
	//   var unpackedPrice *big.Int
	//	 errUnpack := s.OracleABI.UnpackIntoInterface(&unpackedPrice, methodName, result)
	//	 if errUnpack != nil {
	//	    return nil, fmt.Errorf("failed to unpack %s result from oracle %s: %w", methodName, oracleAddress.Hex(), errUnpack)
	//   }
	//   price = unpackedPrice
	// }
	// return price, nil

	fmt.Printf("Conceptual call: Oracle %s .getPrice(%s)\n", oracleAddress.Hex(), assetAddress.Hex())
	// Assuming price is returned with 18 decimals
	return new(big.Int).SetUint64(2000 * 1e18), nil // Placeholder e.g., $2000 with 18 decimals
}
