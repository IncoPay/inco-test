/**
 * Health check: facilitator + Kora + Solana RPC + account balances.
 */
import * as path from "path";
import { config as loadDotenv } from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";

loadDotenv({ path: path.resolve(process.cwd(), "../.env") });

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.log(`✗ ${name}: ${(e as Error).message}`);
  }
}

async function main() {
  const facilitatorUrl =
    process.env.FACILITATOR_URL || "http://localhost:4021";
  const koraUrl = process.env.KORA_RPC_URL || "http://localhost:8080/";
  const rpcUrl =
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

  await check(`facilitator /health`, async () => {
    const r = await fetch(`${facilitatorUrl}/health`);
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    console.log(`   → ${JSON.stringify(j)}`);
  });

  await check(`facilitator /supported`, async () => {
    const r = await fetch(`${facilitatorUrl}/supported`);
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    console.log(`   → ${j.kinds.length} kinds advertised`);
  });

  await check(`kora liveness`, async () => {
    const r = await fetch(koraUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "liveness" }),
    });
    if (!r.ok) throw new Error(`${r.status}`);
  });

  await check(`solana rpc`, async () => {
    const conn = new Connection(rpcUrl);
    const v = await conn.getVersion();
    console.log(`   → ${JSON.stringify(v)}`);
  });

  // balances
  const accounts: Array<[string, string | undefined]> = [
    ["facilitator", process.env.FACILITATOR_PUBKEY],
    ["issuer", process.env.ISSUER_PUBKEY],
    ["recipient", process.env.RECIPIENT_PUBKEY],
    ["user1", process.env.USER1_PUBKEY],
  ];
  const conn = new Connection(rpcUrl);
  console.log("\nSOL balances:");
  for (const [name, pub] of accounts) {
    if (!pub) continue;
    const lamports = await conn.getBalance(new PublicKey(pub));
    console.log(`  ${name.padEnd(12)} ${pub}  ${(lamports / 1e9).toFixed(4)} SOL`);
  }
}

main();
