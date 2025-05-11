import { ethers } from "hardhat";
import { KarmaUSD, TrustedSpender } from "../typechain-types";
import { assert } from "chai";
import { SignTypedDataVersion, recoverTypedSignature } from "@metamask/eth-sig-util"

describe("Testing permit method and TrustedSpender contract", () => {

    let contract: KarmaUSD
    let spender: TrustedSpender

    let ALICE: any
    let BOB: any
    let MINER: any

    let karma_domain: any;
    let spender_domain: any;

    const EIP712Domain = {
        "EIP712Domain": [
            {
                "name": "name",
                "type": "string"
            },
            {
                "name": "version",
                "type": "string"
            },
            {
                "name": "chainId",
                "type": "uint256"
            },
            {
                "name": "verifyingContract",
                "type": "address"
            }
        ]
    }

    const PermitTypes = {
        "Permit": [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ]
    }

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

    before(async () => {
        const signers = await ethers.getSigners()
        ALICE = signers[1]
        BOB = signers[2]
        MINER = signers[3]

        const KarmaUSD = await ethers.getContractFactory("KarmaUSD");
        contract = await KarmaUSD.deploy();

        const TrustedSpender = await ethers.getContractFactory("TrustedSpender");
        spender = await TrustedSpender.deploy();
        await spender.setERC20Contract(contract.getAddress());
        await spender.setMiner(MINER.address);

        karma_domain = {
            name: "KarmaUSD",
            version: "1",
            chainId: 31337,
            verifyingContract: await contract.getAddress(),
        }

        spender_domain = {
            name: "TrustedSpender",
            version: "1",
            chainId: 31337,
            verifyingContract: await spender.getAddress(),
        }
    })

    it("Check signature MetaMask compatibility", async () => {
        const message = {
            owner: ALICE.address,
            spender: await spender.getAddress(),
            value: 50,
            nonce: 0,
            deadline: 0
        }
        const signature = await ALICE.signTypedData(karma_domain, PermitTypes, message);
        const recorveredAddress = recoverTypedSignature({
            data: {
                "types": {
                    ...EIP712Domain,
                    ...PermitTypes
                },
                "primaryType": "Permit",
                "domain": karma_domain,
                "message": message
            },
            signature: signature,
            version: SignTypedDataVersion.V4
        })
        assert.equal(recorveredAddress.toLowerCase(), ALICE.address.toLowerCase())
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

    it("Allow 50 kUSD transfer by permit", async () => {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const currentTimestamp = block.timestamp;

        const oneDay = 24 * 60 * 60; // seconds in a day
        const deadline = currentTimestamp + oneDay;

        const nonce = await spender.nonces(ALICE.address);

        const message = {
            owner: ALICE.address,
            spender: await spender.getAddress(),
            value: 50,
            nonce,
            deadline
        }

        const signature = await ALICE.signTypedData(karma_domain, PermitTypes, message);

        const { v, r, s } = splitSignature(signature);

        await contract.permit(ALICE.address, spender.getAddress(), 50, deadline, v, r, s);
    })

    it("Transfer 50 kUSD from ALICE to BOB by using TrustedSpender", async () => {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const currentTimestamp = block.timestamp;

        const oneDay = 24 * 60 * 60; // seconds in a day
        const deadline = currentTimestamp + oneDay;

        const nonce = await spender.nonces(ALICE.address);

        const message = {
            from: ALICE.address,
            to: BOB.address,
            amount: 40,
            fee: 0,
            nonce,
            deadline
        }

        const signature = await ALICE.signTypedData(spender_domain, TransferTypes, message);

        const { v, r, s } = splitSignature(signature);

        await spender.transfer(ALICE.address, BOB.address, 40, 0, deadline, v, r, s);

        assert.equal(await contract.balanceOf(ALICE.address), ethers.toBigInt(40))
        assert.equal(await contract.debtOf(ALICE.address, BOB.address), ethers.toBigInt(40))
    })

})