// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./KarmaERC20.sol";

contract KarmaUSD is KarmaERC20 {
    constructor() KarmaERC20("KarmaUSD", "kUSD") {}
}
