// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import {Proof} from "vlayer-0.1.0/Proof.sol";
import {Prover} from "vlayer-0.1.0/Prover.sol";
import {Web, WebProof, WebProofLib, WebLib} from "vlayer-0.1.0/WebProof.sol";

contract KrakenProver is Prover {
    using WebProofLib for WebProof;
    using WebLib for Web;

    string public constant DISPUTES_DATA_URL = "https://api.stripe.com/v1/disputes";
    string public constant REVENUE_DATA_URL = "https://api.stripe.com/v1/payment_intents?limit=1";

    function main(WebProof calldata disputesWebProof, WebProof calldata revenueWebProof) public view returns (Proof memory, bool, bool) {
        Web memory disputesWeb = disputesWebProof.verify(DISPUTES_DATA_URL);
        bool zeroDisputes = disputesWeb.jsonGetBool("length(data) == `0`");

        Web memory revenueWeb = revenueWebProof.verify(REVENUE_DATA_URL);
        bool revenueExists = revenueWeb.jsonGetBool("length(data) != `0`");

        return (proof(), zeroDisputes, revenueExists);
    }
}
