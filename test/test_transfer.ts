import { ethers } from "hardhat";
import { KarmaUSD } from "../typechain-types";
import { assert } from "chai";

describe("Testing karma transfers", () => {

    let contract: KarmaUSD

    let MINER: any
    let ALICE: any
    let BOB: any
    let EVE: any

    let LOG = false

    async function showBalances() {
        if (LOG) {
            console.log(`balance of ALICE: ${await contract.balanceOf(ALICE.address)}`)
            console.log(`balance of BOB: ${await contract.balanceOf(BOB.address)}`)
            console.log(`balance of EVE: ${await contract.balanceOf(EVE.address)}`)
            console.log(`debt of ALICE -> BOB: ${await contract.debtOf(ALICE.address, BOB.address)}`)
            console.log(`debt of ALICE -> EVE: ${await contract.debtOf(ALICE.address, EVE.address)}`)
            console.log(`debt of BOB -> ALICE: ${await contract.debtOf(BOB.address, ALICE.address)}`)
            console.log(`debt of BOB -> EVE: ${await contract.debtOf(BOB.address, EVE.address)}`)
            console.log(`debt of EVE -> ALICE: ${await contract.debtOf(EVE.address, ALICE.address)}`)
            console.log(`debt of EVE -> BOB: ${await contract.debtOf(EVE.address, BOB.address)}`)
            console.log(`debt of ALICE -> MINER: ${await contract.debtOf(ALICE.address, MINER.address)}`)
            console.log(`debt of BOB -> MINER: ${await contract.debtOf(BOB.address, MINER.address)}`)
            console.log(`debt of EVE -> MINER: ${await contract.debtOf(EVE.address, MINER.address)}`)
        }
    }

    before(async () => {
        const signers = await ethers.getSigners()
        MINER = signers[0]
        ALICE = signers[1]
        BOB = signers[2]
        EVE = signers[3]

        const KarmaUSD = await ethers.getContractFactory("KarmaUSD");
        contract = await KarmaUSD.deploy();
    })

    it("Set cycle rewards", async () => {
        await contract.connect(ALICE).setCycleReward(ethers.toBigInt(1))
        await contract.connect(BOB).setCycleReward(ethers.toBigInt(1))
        await contract.connect(EVE).setCycleReward(ethers.toBigInt(1))
        assert.equal(await contract.cycleRewardOf(ALICE.address), ethers.toBigInt(1))
        assert.equal(await contract.cycleRewardOf(BOB.address), ethers.toBigInt(1))
        assert.equal(await contract.cycleRewardOf(EVE.address), ethers.toBigInt(1))
    })

    it("Transfer 50 kUSD from ALICE to BOB", async () => {
        await contract.connect(ALICE).transfer(BOB.address, 50)
        assert.equal(await contract.balanceOf(ALICE.address), ethers.toBigInt(50))
        await showBalances()
    })

    it("Transfer 40 kUSD from BOB to EVE", async () => {
        await contract.connect(BOB).transfer(EVE.address, 40)
        assert.equal(await contract.balanceOf(BOB.address), ethers.toBigInt(40))
        await showBalances()
    })

    it("Transfer 30 kUSD from EVE to ALICE", async () => {
        await contract.connect(EVE).transfer(ALICE.address, 30)
        assert.equal(await contract.balanceOf(EVE.address), ethers.toBigInt(30))
        await showBalances()
    })

    it("Mine the cycle", async () => {
        await contract.connect(MINER).mineCycle(MINER.address, [ALICE.address, BOB.address, EVE.address])
        await showBalances()
        assert.equal(await contract.balanceOf(ALICE.address), ethers.toBigInt(21))
        assert.equal(await contract.balanceOf(BOB.address), ethers.toBigInt(11))
        assert.equal(await contract.balanceOf(EVE.address), ethers.toBigInt(1))
    })

    it("Check overflow on transfer", async () => {
        const MAX_UINT256_MINUS_ONE = ethers.toBigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") - 1n;
        try {
            await contract.connect(ALICE).transfer(BOB.address, MAX_UINT256_MINUS_ONE);
            assert.fail("Expected arithmetic overflow, but no error was thrown");
        } catch (error: any) {
            assert.include(error.message, "reverted with panic code 0x11", "Error message does not contain 'arithmetic overflow'");
        }
    })
});