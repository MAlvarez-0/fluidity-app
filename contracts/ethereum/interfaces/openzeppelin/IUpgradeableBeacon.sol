// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import "@openzeppelin/contracts/proxy/beacon/IBeacon.sol";

interface IUpgradeableBeacon is IBeacon {
    function implementation() external view returns (address);
    function upgradeTo(address) external;
    function changeAdmin(address) external;
}
