// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";

contract TrustedSpender is EIP712, Nonces {
    address private _erc20Contract;
    address private _miner;

    bytes32 constant TRANSFER_TYPEHASH =
        keccak256(
            "Transfer(address from,address to,uint256 amount,uint256 fee,uint256 nonce,uint256 deadline)"
        );

    error ERC20ContractNotSet();
    error ExpiredSignature(uint256 deadline);
    error InvalidSigner(address signer, address owner);

    constructor() EIP712("TrustedSpender", "1") {}

    function setERC20Contract(address erc20Contract) public virtual {
        _erc20Contract = erc20Contract;
    }

    function setMiner(address miner) public virtual {
        _miner = miner;
    }

    function transfer(
        address from,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual {
        if (_erc20Contract == address(0)) {
            revert ERC20ContractNotSet();
        }

        if (block.timestamp > deadline) {
            revert ExpiredSignature(deadline);
        }

        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_TYPEHASH,
                from,
                to,
                amount,
                fee,
                _useNonce(from),
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(hash, v, r, s);
        if (signer != from) {
            revert InvalidSigner(signer, from);
        }

        IERC20(_erc20Contract).transferFrom(from, to, amount);

        if (fee > 0) {
            IERC20(_erc20Contract).transferFrom(from, _miner, fee);
        }
    }
}
