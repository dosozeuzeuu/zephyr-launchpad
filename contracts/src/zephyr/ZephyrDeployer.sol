// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * [Zephyr] One-time deployment helper. The admin (the wallet that deployed it) sends batches of
 * operations — CREATE, CREATE2 and calls — so the whole protocol can be deployed and wired in a
 * few signed transactions. It holds ownership of each contract only during setup; the last batch
 * hands every role to the admin's wallet, after which this contract has no further use.
 */
contract ZephyrDeployer {
    error NotAdmin();
    error DeployFailed(uint _index);
    error CallFailed(uint _index, bytes _reason);

    event Deployed(uint indexed _index, address _addr);

    uint8 internal constant CREATE = 0;
    uint8 internal constant CREATE2 = 1;
    uint8 internal constant CALL = 2;

    struct Op {
        uint8 kind;
        bytes32 salt;
        address target;
        bytes data;
    }

    address public immutable admin;

    constructor() {
        admin = msg.sender;
    }

    function run(
        Op[] calldata _ops
    ) external {
        if (msg.sender != admin) revert NotAdmin();

        for (uint i; i < _ops.length; ++i) {
            Op calldata op = _ops[i];
            bytes memory data = op.data;

            if (op.kind == CREATE || op.kind == CREATE2) {
                address addr;
                bytes32 salt = op.salt;
                if (op.kind == CREATE) {
                    assembly {
                        addr := create(0, add(data, 0x20), mload(data))
                    }
                } else {
                    assembly {
                        addr := create2(0, add(data, 0x20), mload(data), salt)
                    }
                }
                if (addr == address(0) || addr.code.length == 0) revert DeployFailed(i);
                emit Deployed(i, addr);
            } else {
                (bool ok, bytes memory reason) = op.target.call(data);
                if (!ok) revert CallFailed(i, reason);
            }
        }
    }
}
