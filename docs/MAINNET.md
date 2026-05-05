# Mainnet deployment checklist

Cortex's `cortex_program` is currently deployed on **devnet** at
`DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV`. This doc captures every
gate the program needs to pass before we move the canonical deployment
to mainnet-beta.

Every box below should be checkable from a fresh checkout.

## 0. Pre-flight

- [ ] `anchor --version` matches `[toolchain]` in `Anchor.toml` (currently `0.31.1`)
- [ ] `solana --version` matches what `anchor build` emits in the SBF target metadata
- [ ] `programs/cortex_program/Cargo.toml` `version` is bumped (start at `1.0.0`)
- [ ] Tag the commit you intend to deploy, e.g. `git tag -s v1.0.0`
- [ ] `git status` is clean and CI is green on the tagged commit

## 1. Build deterministically

Use Solana's verifiable-build container so the on-chain bytes can be
audited. Anchor wraps it for us:

```bash
anchor build --verifiable
```

This builds inside the official Anchor docker image. The output `*.so`
in `target/verifiable/` is the artefact you upload — *not* a local
build. Local builds embed compiler/host paths and won't match what
auditors see when they reproduce the build.

After build:

- [ ] `sha256sum target/verifiable/cortex_program.so` and **commit the
      hash to the tag's release notes**. Reviewers will reproduce.

## 2. Pin the program ID and upgrade authority

The program ID is hard-coded via `declare_id!()` in
`programs/cortex_program/src/lib.rs`. It's the **same on devnet and
mainnet** — we keep program-id identity across clusters because the
SDK, IDL, and consumer code shouldn't fork.

- [ ] Verify `declare_id!("DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV")`
      in `lib.rs` matches the address you intend to deploy to.
- [ ] Pre-fund the **deploy authority** on mainnet with ≥ 5 SOL (each
      upgrade burns / locks ~2.3 SOL of buffer rent during the upload).
- [ ] Decide upgrade-authority custody:
  - **MVP path:** keep the deploy authority key on a hardware wallet
    held by the org. Rotate to a multisig before opening the program
    to public skill registrations.
  - **Production path:** transfer upgrade authority to a Squads multisig
    with N-of-M = 2-of-3 (engineering, product, finance). Any future
    upgrade flows through Squads execution.

```bash
# Inspect current authority on mainnet
solana program show DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV \
  --url https://api.mainnet-beta.solana.com

# Set authority to a Squads multisig PDA
solana program set-upgrade-authority \
  DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV \
  --new-upgrade-authority <SQUADS_PDA> \
  --url https://api.mainnet-beta.solana.com
```

## 3. Deploy

```bash
solana config set --url https://api.mainnet-beta.solana.com
anchor deploy --provider.cluster mainnet --program-name cortex_program
```

After deploy:

- [ ] `solana program show <PROGRAM_ID> --url mainnet-beta` shows the
      expected `ProgramData Address` and `Authority`
- [ ] Compare on-chain bytes to the verifiable build hash:
      `solana program dump <PROGRAM_ID> /tmp/onchain.so --url mainnet-beta && sha256sum /tmp/onchain.so`

## 4. Submit to anchor-verify

`anchor-verify` (now `solana-verify`) re-builds the program from your
public source repo and compares the resulting hash to the deployed
binary. It's the on-chain equivalent of npm's signed package
provenance.

```bash
solana-verify verify-from-repo \
  --remote https://github.com/<org>/cortex \
  --commit-hash <TAG_COMMIT_SHA> \
  <PROGRAM_ID>
```

When verified the program shows a green check on Solscan / Solana
Explorer. **Do not advertise the program on mainnet until it shows
verified.**

- [ ] `solana-verify` reports `Program is verified`
- [ ] Solscan page for the program ID shows the verified badge

## 5. Publish the canonical IDL on-chain

The Anchor IDL is what off-chain SDKs use to decode account data. Pin
it on-chain so any future SDK consumer can reconstruct the layout
without trusting our npm package:

```bash
anchor idl init <PROGRAM_ID> -f target/idl/cortex_program.json \
  --provider.cluster mainnet
```

For upgrades that change the IDL:

```bash
anchor idl upgrade <PROGRAM_ID> -f target/idl/cortex_program.json \
  --provider.cluster mainnet
```

- [ ] `anchor idl fetch <PROGRAM_ID> --provider.cluster mainnet`
      returns the same IDL committed in `sdk/idl/cortex_program.json`

## 6. Mint + seeded state

Mainnet uses **Circle USDC**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

There is **no equivalent of `npm run demo:seed`** on mainnet — agents
register their own AgentWallets, and authors register their own skills
via `cortex publish`. The CLI defaults the mint to Circle USDC when
`network = "mainnet-beta"` in `cortex.toml`.

- [ ] App env points at mainnet:
  - `NEXT_PUBLIC_CORTEX_RPC_URL=https://api.mainnet-beta.solana.com`
  - `NEXT_PUBLIC_CORTEX_CLUSTER=mainnet-beta`
- [ ] Devnet preview deployments stay separate (Vercel preview env =
      devnet, production env = mainnet)

## 7. Monitoring

Bare minimum to detect "is the program working?":

- [ ] **RPC healthcheck** — a periodic `solana program show` against
      a redundant RPC provider (Helius, Triton, QuickNode). Alert if
      `Last Deployed In Slot` jumps unexpectedly.
- [ ] **Tx observation** — subscribe to program logs via
      `connection.onLogs(programId)` and forward to a dashboard
      (Grafana / Datadog / a plain log file). Triage on:
  - Spike in `DailyLimitExceeded` errors → potential leaked agent key
    being abused (the on-chain cap is doing its job, but worth
    notifying the owner).
  - Spike in `MintMismatch` → someone calling with wrong mint.
  - Any error code we haven't seen before.
- [ ] **Skill revenue counter sanity** — for the top 10 skills,
      cross-check `Skill.total_revenue` against the author's ATA
      cumulative inflows once a day. They should match modulo any
      out-of-band transfers.

## 8. Security review (inline checklist)

This program has had no third-party audit yet. Before we open it to
unknown skill authors at scale, the following must be re-verified by
a second engineer:

- [ ] All `Account<'info, T>` constraints have explicit `seeds = …` /
      `has_one = …` checks (verified for current ix set; re-verify on
      every new ix)
- [ ] No `AccountInfo` is dereferenced without a check
- [ ] `pay_for_call` arithmetic uses `checked_*` (current code does)
- [ ] Slug validation rejects whitespace, control chars, uppercase,
      and is bounded by `MAX_SLUG_LEN`
- [ ] `close_*` ix can only be called by the rightful owner / author
      (`has_one` constraints + `close = <signer>`)
- [ ] No CPI calls into untrusted programs (we only CPI into SPL Token)
- [ ] Token mint matches across {`AgentWallet.mint`, vault, owner ATA,
      author ATA, skill mint}

## 9. Public announcement gates

Don't announce the mainnet deployment until **all** of the following
are checked:

- [ ] Verified build (§4)
- [ ] On-chain IDL published (§5)
- [ ] Upgrade authority is a multisig (§2)
- [ ] Monitoring receives test event from a real `pay_for_call` (§7)
- [ ] Rollback plan is written down (this doc + a TODO at the bottom
      of `programs/cortex_program/src/lib.rs` linking to it)

## 10. Rollback

If a critical bug is found after the announcement:

1. Pause new registrations off-chain — flip `CORTEX_PROGRAM_ID` in the
   marketplace UI to a deprecated-but-still-readable program ID, so
   agents using the SDK directly can still settle but the UI stops
   onboarding.
2. Through the Squads multisig, deploy a fixed bytecode
   (`anchor deploy --provider.cluster mainnet`).
3. Monitor for 24h. If the bug recurs, revoke upgrade authority
   (`solana program set-upgrade-authority --final`). At that point the
   program is immutable; a new deployment with a new program ID is
   needed for any further fixes.
