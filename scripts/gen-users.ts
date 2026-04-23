/**
 * Print a summary of the 8 keypairs in ../.keys/.
 * (Key generation is done via `solana-keygen` in /.keys/; this script just reports.)
 */
import * as fs from "fs";
import * as path from "path";
import { Keypair } from "@solana/web3.js";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(process.cwd(), "../.env") });

const names = ["facilitator", "issuer", "recipient", "user1", "user2", "user3", "user4", "user5"];
for (const n of names) {
  const p = path.resolve(process.cwd(), "..", ".keys", `${n}.json`);
  if (!fs.existsSync(p)) {
    console.log(`${n.padEnd(12)} MISSING: ${p}`);
    continue;
  }
  const arr = JSON.parse(fs.readFileSync(p, "utf-8")) as number[];
  const kp = Keypair.fromSecretKey(Uint8Array.from(arr));
  console.log(`${n.padEnd(12)} ${kp.publicKey.toBase58()}`);
}
