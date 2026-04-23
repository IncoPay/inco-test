/**
 * End-to-end dry run:
 *  1. createSession(cap=5 pUSDC, user=USER1, recipient=RECIPIENT) — signs approve + auth msg
 *  2. Three settles of 1 pUSDC each against a mock resource server (we call /verify + /settle directly)
 *  3. Report final session state + recipient balance delta
 */
import * as path from "path";
import { config as loadDotenv } from "dotenv";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  createSession,
  ClientSvmSigner,
  type Network,
} from "inco-x402-sessions";

loadDotenv({ path: path.resolve(process.cwd(), "../.env") });

import * as fs from "fs";
const keyPath = (name: string) =>
  path.resolve(process.cwd(), "..", ".keys", `${name}.json`);
const loadKp = (name: string): Keypair =>
  Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keyPath(name), "utf-8")))
  );

function nodeSigner(kp: Keypair): ClientSvmSigner {
  return {
    publicKey: kp.publicKey.toBase58(),
    async signMessage(msg: Uint8Array): Promise<Uint8Array> {
      return nacl.sign.detached(msg, kp.secretKey);
    },
    async signTransaction(txB64: string): Promise<string> {
      const { Transaction } = await import("@solana/web3.js");
      const tx = Transaction.from(Buffer.from(txB64, "base64"));
      tx.partialSign(kp);
      return tx
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64");
    },
  };
}

async function main() {
  const facilitatorUrl =
    process.env.FACILITATOR_URL || "http://localhost:4021";
  const network = (process.env.NETWORK || "solana:devnet") as Network;
  const mint = process.env.TOKEN_MINT;
  if (!mint)
    throw new Error(
      "TOKEN_MINT not set in ../.env — run `npm run deploy` in inco-token-deploy first"
    );

  const userName = process.argv[2] || "user1";
  const user = loadKp(userName);
  const recipient = loadKp("recipient");
  const signer = nodeSigner(user);

  console.log(`user:      ${user.publicKey.toBase58()}`);
  console.log(`recipient: ${recipient.publicKey.toBase58()}`);
  console.log(`mint:      ${mint}`);
  console.log(`facilitator: ${facilitatorUrl}\n`);

  console.log("1. createSession(cap=5 pUSDC, ttl=1h) ...");
  const session = await createSession({
    facilitatorUrl,
    network,
    asset: mint,
    recipient: recipient.publicKey.toBase58(),
    cap: "5",
    expirationSeconds: 3600,
    signer,
    decimals: 6,
  });
  console.log(`   sessionId: ${session.sessionId}`);
  console.log(`   cap: ${session.cap} base units (= 5 pUSDC)`);
  console.log(`   spender: ${session.spender}`);

  // Three settles via direct /verify + /settle (simulating a merchant server)
  const accepted = {
    scheme: "session",
    network,
    asset: mint,
    amount: "1000000", // 1 pUSDC
    payTo: recipient.publicKey.toBase58(),
    maxTimeoutSeconds: 60,
  };
  for (let i = 1; i <= 3; i++) {
    console.log(`\n${i + 1}. settle #${i} — 1 pUSDC`);
    const paymentPayload = {
      x402Version: 2,
      accepted,
      payload: { sessionId: session.sessionId, amount: "1000000" },
    };
    const vr = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements: accepted,
      }),
    });
    const vj = await vr.json();
    console.log(`   verify: ${JSON.stringify(vj)}`);
    if (!vj.isValid) break;

    const sr = await fetch(`${facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements: accepted,
      }),
    });
    const sj = await sr.json();
    console.log(`   settle: success=${sj.success} tx=${sj.transaction?.slice(0, 16) || sj.errorMessage || ""}`);
    if (!sj.success) break;
  }

  console.log("\n5. final session state:");
  const finalR = await fetch(`${facilitatorUrl}/sessions/${session.sessionId}`);
  const final = await finalR.json();
  console.log(JSON.stringify(final, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
