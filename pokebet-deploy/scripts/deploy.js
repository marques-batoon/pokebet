const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  const Arena = await ethers.getContractFactory("PokeBetArena");
  const arena = await Arena.deploy(deployer.address);
  await arena.waitForDeployment();

  console.log("PokeBetArena deployed to:", await arena.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });