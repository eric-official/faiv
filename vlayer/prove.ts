/// <reference types="bun" />

import { createVlayerClient } from "@vlayer/sdk";
import proverSpec from "../out/KrakenProver.sol/KrakenProver";
import verifierSpec from "../out/KrakenVerifier.sol/KrakenVerifier";
import {
  getConfig,
  createContext,
  deployVlayerContracts,
  writeEnvVariables,
} from "@vlayer/sdk/config";

const DISPUTES_URL_TO_PROVE = "https://api.stripe.com/v1/disputes";
const REVENUE_URL_TO_PROVE = "https://api.stripe.com/v1/payment_intents?limit=1";

const config = getConfig();
const { chain, ethClient, account, proverUrl, confirmations, notaryUrl } =
  createContext(config);

if (!account) {
  throw new Error(
    "No account found make sure EXAMPLES_TEST_PRIVATE_KEY is set in your environment variables",
  );
}

const vlayer = createVlayerClient({
  url: proverUrl,
  token: config.token,
});

async function generateDisputesWebProof() {
  console.log("⏳ Generating disputes web proof...");
  const result =
    await Bun.$`vlayer web-proof-fetch --notary ${notaryUrl} --url ${DISPUTES_URL_TO_PROVE} -H "Authorization: Bearer ${import.meta.env.STRIPE_KEY}"`;
  return result.stdout.toString();
}

async function generateRevenueWebProof() {
  console.log("⏳ Generating revenue web proof...");
  console.log(`vlayer web-proof-fetch --notary ${notaryUrl} --url ${REVENUE_URL_TO_PROVE} -H "Authorization: Bearer ${import.meta.env.STRIPE_KEY}"`)
  const result =
    await Bun.$`vlayer web-proof-fetch --notary ${notaryUrl} --url ${REVENUE_URL_TO_PROVE} -H "Authorization: Bearer ${import.meta.env.STRIPE_KEY}"`;
  return result.stdout.toString();
}

console.log("⏳ Deploying contracts...");

const { prover, verifier } = await deployVlayerContracts({
  proverSpec,
  verifierSpec,
  proverArgs: [],
  verifierArgs: [],
});

await writeEnvVariables(".env", {
  VITE_PROVER_ADDRESS: prover,
  VITE_VERIFIER_ADDRESS: verifier,
});

console.log("✅ Contracts deployed", { prover, verifier });

const revenueWebProof = await generateRevenueWebProof();
const disputesWebProof = await generateDisputesWebProof();

console.log("⏳ Proving...");
const hash = await vlayer.prove({
  address: prover,
  functionName: "main",
  proverAbi: proverSpec.abi,
  args: [
    {
      webProofJson: disputesWebProof.toString(),
    },
    {
      webProofJson: revenueWebProof.toString(),
    },
  ],
  chainId: chain.id,
  gasLimit: config.gasLimit,
});
const result = await vlayer.waitForProvingResult({ hash });
const [proof, avgPrice, revExists] = result;
console.log("✅ Proof generated");

console.log("⏳ Verifying...");

// Workaround for viem estimating gas with `latest` block causing future block assumptions to fail on slower chains like mainnet/sepolia
const gas = await ethClient.estimateContractGas({
  address: verifier,
  abi: verifierSpec.abi,
  functionName: "verify",
  args: [proof, avgPrice, revExists],
  account,
  blockTag: "pending",
});

const txHash = await ethClient.writeContract({
  address: verifier,
  abi: verifierSpec.abi,
  functionName: "verify",
  args: [proof, avgPrice, revExists],
  chain,
  account,
  gas,
});

await ethClient.waitForTransactionReceipt({
  hash: txHash,
  confirmations,
  retryCount: 60,
  retryDelay: 1000,
});

console.log("✅ Verified!");
