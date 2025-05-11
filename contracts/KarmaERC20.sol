// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC1363.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

abstract contract KarmaERC20 is ERC20, ERC20Permit, ERC1363 {
    mapping(address account => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _debts;
    mapping(address => uint256) private _cycleRewards;

    event CycleRewardChanged(address indexed owner, uint256 value);

    error KarmaInvalidCycle();
    error KarmaExpiredSignature(uint256 deadline);
    error KarmaInvalidSigner(address signer, address owner);

    bytes32 constant TRANSFER_TYPEHASH =
        keccak256(
            "Transfer(address from,address to,uint256 amount,uint256 fee,uint256 nonce,uint256 deadline)"
        );

    bytes32 constant SET_CYCLE_REWARD_TYPEHASH =
        keccak256(
            "SetCycleReward(address owner,uint256 amount,uint256 nonce,uint256 deadline)"
        );

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {}

    function totalSupply()
        public
        view
        virtual
        override(ERC20, IERC20)
        returns (uint256)
    {
        return 0; // totalSupply is meaningless
    }

    function balanceOf(
        address account
    ) public view virtual override(ERC20, IERC20) returns (uint256) {
        return _balances[account];
    }

    function debtOf(
        address debtor,
        address creditor
    ) public view virtual returns (uint256) {
        return _debts[debtor][creditor];
    }

    function mineCycle(
        address miner,
        address[] memory nodes
    ) public virtual returns (bool) {
        // store the last debt (end of cycle) as min
        uint256 min = _debts[nodes[nodes.length - 1]][nodes[0]];

        // checking debts in cycle from 0..n, and find the min value
        for (uint i = 0; i < nodes.length - 1; i++) {
            uint256 debt = _debts[nodes[i]][nodes[i + 1]];
            min = debt < min ? debt : min;
        }

        // if minimal debt is 0, then it is an invalid cycle
        if (min == 0) {
            revert KarmaInvalidCycle();
        }

        // decreasing the debts and balances and pay cyleReward
        for (uint i = 0; i < nodes.length - 1; i++) {
            address target = nodes[i];
            _debts[target][nodes[i + 1]] -= min;
            _balances[target] -= min;
            _transfer(target, miner, _cycleRewards[target]);
        }

        // ... last node
        address last_target = nodes[nodes.length - 1];
        _debts[last_target][nodes[0]] -= min;
        _balances[last_target] -= min;
        _transfer(last_target, msg.sender, _cycleRewards[last_target]);

        return true;
    }

    function cycleRewardOf(
        address account
    ) public view virtual returns (uint256) {
        return _cycleRewards[account];
    }

    function setCycleReward(uint256 amount) public virtual returns (bool) {
        _setCycleReward(msg.sender, amount);
        return true;
    }

    // --- meta transactions ---

    function metaSetCycleReward(
        address owner,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual {
        if (block.timestamp > deadline) {
            revert KarmaExpiredSignature(deadline);
        }

        bytes32 structHash = keccak256(
            abi.encode(
                SET_CYCLE_REWARD_TYPEHASH,
                owner,
                amount,
                _useNonce(owner),
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(hash, v, r, s);
        if (signer != owner) {
            revert KarmaInvalidSigner(signer, owner);
        }

        _setCycleReward(owner, amount);
    }

    function metaTransfer(
        address from,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual {
        if (block.timestamp > deadline) {
            revert KarmaExpiredSignature(deadline);
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
            revert KarmaInvalidSigner(signer, from);
        }

        _transfer(signer, to, amount);

        if (fee > 0) {
            _transfer(signer, _msgSender(), fee);
        }
    }

    function metaTransferBatch(
        address[] calldata from,
        address[] calldata to,
        uint256[] calldata amount,
        uint256[] calldata fee,
        uint256[] calldata deadline,
        bytes[] calldata signature
    ) public virtual {
        for (uint i = 0; i < from.length; i++) {
            if (block.timestamp > deadline[i]) {
                revert KarmaExpiredSignature(deadline[i]);
            }

            bytes32 structHash = keccak256(
                abi.encode(
                    TRANSFER_TYPEHASH,
                    from[i],
                    to[i],
                    amount[i],
                    fee[i],
                    _useNonce(from[i]),
                    deadline[i]
                )
            );

            bytes32 hash = _hashTypedDataV4(structHash);

            (address recoveredAddress, ECDSA.RecoverError err, ) = ECDSA
                .tryRecover(hash, signature[i]);

            if (
                err != ECDSA.RecoverError.NoError || recoveredAddress != from[i]
            ) {
                revert KarmaInvalidSigner(recoveredAddress, from[i]);
            }

            _transfer(recoveredAddress, to[i], amount[i]);

            if (fee[i] > 0) {
                _transfer(recoveredAddress, _msgSender(), fee[i]);
            }
        }
    }

    // --- internal methods ---

    function _setCycleReward(address owner, uint256 amount) internal virtual {
        _cycleRewards[owner] = amount;

        emit CycleRewardChanged(owner, amount);
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        _balances[from] += value;
        _debts[from][to] += value;

        emit Transfer(from, to, value);
    }
}
