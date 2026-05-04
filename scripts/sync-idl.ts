/**
 * Copy the Anchor build artifacts (IDL JSON and TypeScript types) from
 * `target/` into `sdk/idl/` so the SDK / Next.js app / demo agent can
 * import them without depending on an artefact that's gitignored.
 *
 * Run after `anchor build`.
 */
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");
const targetIdl = resolve(root, "target/idl/cortex_program.json");
const targetTypes = resolve(root, "target/types/cortex_program.ts");
const sdkIdlDir = resolve(root, "sdk/idl");
const sdkIdl = resolve(sdkIdlDir, "cortex_program.json");
const sdkTypes = resolve(sdkIdlDir, "cortex_program.ts");

if (!existsSync(targetIdl) || !existsSync(targetTypes)) {
  console.error(
    `[sync-idl] missing ${targetIdl} or ${targetTypes}. Run \`anchor build\` first.`
  );
  process.exit(1);
}

mkdirSync(sdkIdlDir, { recursive: true });
copyFileSync(targetIdl, sdkIdl);
copyFileSync(targetTypes, sdkTypes);

console.log(`[sync-idl] synced IDL -> ${sdkIdl}`);
console.log(`[sync-idl] synced types -> ${sdkTypes}`);
