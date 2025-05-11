import { ethers } from "hardhat";
import { KarmaUSD } from "../typechain-types";
import { assert } from "chai";

describe("Testing metatransactions", () => {

    let contract: KarmaUSD

    let ALICE: any
    let BOB: any
    let EVE: any
    let MINER: any

    let karma_domain: any;

    const TransferTypes = {
        "Transfer": [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "fee", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ]
    }

    const SetCycleRewardTypes = {
        "SetCycleReward": [
            { name: "owner", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ]
    }

    before(async () => {
        const signers = await ethers.getSigners()
        ALICE = signers[4]
        BOB = signers[5]
        MINER = signers[6]
        EVE = signers[7]

        const KarmaUSD = await ethers.getContractFactory("KarmaUSD");
        contract = await KarmaUSD.deploy();


        karma_domain = {
            name: "KarmaUSD",
            version: "1",
            chainId: 31337,
            verifyingContract: await contract.getAddress(),
        }
    })

    function splitSignature(signature: string): { r: string; s: string; v: number } {
        if (signature.startsWith("0x")) signature = signature.slice(2);
        if (signature.length !== 130) throw new Error("Invalid signature length");

        const r = "0x" + signature.slice(0, 64);
        const s = "0x" + signature.slice(64, 128);
        let v = parseInt(signature.slice(128, 130), 16);

        // Normalize v (some sources use 0/1 instead of 27/28)
        if (v < 27) v += 27;

        return { r, s, v };
    }

    it("Transfer 50 kUSD from ALICE to BOB", async () => {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const currentTimestamp = block.timestamp;

        const oneDay = 24 * 60 * 60; // seconds in a day
        const deadline = currentTimestamp + oneDay;

        const nonce = await contract.nonces(ALICE.address);

        const message = {
            from: ALICE.address,
            to: BOB.address,
            amount: 50,
            fee: 1,
            nonce,
            deadline
        }

        const signature = await ALICE.signTypedData(karma_domain, TransferTypes, message);

        const { v, r, s } = splitSignature(signature);

        await contract.metaTransfer(ALICE.address, BOB.address, 50, 1, deadline, v, r, s, MINER.address);

        assert.equal(await contract.balanceOf(ALICE.address), ethers.toBigInt(51))
        assert.equal(await contract.debtOf(ALICE.address, BOB.address), ethers.toBigInt(50))
        assert.equal(await contract.debtOf(ALICE.address, MINER.address), ethers.toBigInt(1))
    })

    it("Set cycle reward to 1 kUSD", async () => {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const currentTimestamp = block.timestamp;

        const oneDay = 24 * 60 * 60; // seconds in a day
        const deadline = currentTimestamp + oneDay;

        const nonce = await contract.nonces(ALICE.address);

        const message = {
            owner: ALICE.address,
            amount: 1,
            nonce,
            deadline
        }

        const signature = await ALICE.signTypedData(karma_domain, SetCycleRewardTypes, message);

        const { v, r, s } = splitSignature(signature);

        await contract.metaSetCycleReward(ALICE.address, 1, deadline, v, r, s);

        assert.equal(await contract.cycleRewardOf(ALICE.address), ethers.toBigInt(1))
    })

    it("Batch transfer 50 and 40 kUSD from BOB and EVE to ALICE", async () => {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const currentTimestamp = block.timestamp;

        const oneDay = 24 * 60 * 60; // seconds in a day
        const deadline = currentTimestamp + oneDay;

        const nonce_bob = await contract.nonces(BOB.address);
        const signature_bob = await BOB.signTypedData(karma_domain, TransferTypes, {
            from: BOB.address,
            to: ALICE.address,
            amount: 50,
            fee: 1,
            nonce: nonce_bob,
            deadline
        });

        const nonce_eve = await contract.nonces(EVE.address);
        const signature_eve = await EVE.signTypedData(karma_domain, TransferTypes, {
            from: EVE.address,
            to: ALICE.address,
            amount: 40,
            fee: 1,
            nonce: nonce_eve,
            deadline
        });

        await contract.metaTransferBatch(
            [BOB.address, EVE.address],
            [ALICE.address, ALICE.address],
            [50, 40],
            [1, 1],
            [deadline, deadline],
            [signature_bob, signature_eve],
            MINER.address
        );
    })
})