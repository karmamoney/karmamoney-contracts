import { ethers } from "hardhat";

async function main() {
    const signers = await ethers.getSigners()
    const KarmaUSD = await ethers.getContractFactory("KarmaUSD");
    const contract = await KarmaUSD.deploy({ from: signers[0].address });
    console.log(`KarmaUSD address: ${await contract.getAddress()}`)
}  

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});