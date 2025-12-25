const hre = require("hardhat");

async function main() {
  console.log("Deploying Upload contract to Sepolia...");

  const Upload = await hre.ethers.getContractFactory("Upload");
  const upload = await Upload.deploy();

  await upload.deployed();

  console.log("Upload contract deployed to:", upload.address);
  console.log("\nUpdate your client/.env file with:");
  console.log(`REACT_APP_CONTRACT_ADDRESS=${upload.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
