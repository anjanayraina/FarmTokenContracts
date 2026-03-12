// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PortfolioYieldToken.sol";
import "../src/PrivateNFTVault.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

// A Mock ERC721 is deployed here so the Vault can be initialized during testnet test.
// Replace this with the actual NFT address on the testnet if it already exists.
contract MockTestnetNFT is ERC721 {
    uint256 public nextTokenId = 1;

    constructor() ERC721("TestnetFarmNFT", "TFNFT") {}

    function mintBatch(address to, uint256 count) external {
        for (uint256 i = 0; i < count; i++) {
            _mint(to, nextTokenId);
            nextTokenId++;
        }
    }
}

contract DeployTestnet is Script {
    function run() external {
        // Read the deployer private key and RPC URL from environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying contracts with the account:", deployer);

        // 1. Deploy the Mock NFT for the Testnet
        MockTestnetNFT nft = new MockTestnetNFT();
        console.log("MockTestnetNFT deployed at:", address(nft));

        // 2. Deploy the Reward Token (Yield Token)
        PortfolioYieldToken pyt = new PortfolioYieldToken();
        console.log("PortfolioYieldToken deployed at:", address(pyt));

        // 3. Deploy the Private NFT Vault targeting the NFT & the Reward Token
        PrivateNFTVault vault = new PrivateNFTVault(address(nft), address(pyt));
        console.log("PrivateNFTVault deployed at:", address(vault));

        // 3.5 Mint some Mock NFTs to the Deployer so they can test staking on the testnet
        nft.mintBatch(deployer, 5);
        console.log("Minted 5 Mock Testnet NFTs to deployer:", deployer);

        // 4. Fund the vault with PYT rewards
        uint256 vaultFunding = 1_000_000 * 10 ** 18;
        pyt.transfer(address(vault), vaultFunding);
        console.log(
            "Vault funded with PYT:",
            vaultFunding / 1 ether,
            "native tokens."
        );

        vm.stopBroadcast();

        // Write the deployment outputs to a file for easy access
        string memory output = string.concat(
            "TESTNET_NFT_ADDRESS=",
            vm.toString(address(nft)),
            "\n",
            "TESTNET_PYT_ADDRESS=",
            vm.toString(address(pyt)),
            "\n",
            "TESTNET_VAULT_ADDRESS=",
            vm.toString(address(vault)),
            "\n"
        );
        vm.writeFile("testnet_deploy_addresses.txt", output);

        console.log("Addresses saved to testnet_deploy_addresses.txt");
    }
}
