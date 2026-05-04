import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { CortexProgram } from "../target/types/cortex_program";
import { expect } from "chai";

const PROGRAM_NAME = "cortexProgram";

const enc = new TextEncoder();
const seed = (s: string) => enc.encode(s);

describe("cortex", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace[PROGRAM_NAME] as Program<CortexProgram>;

  const owner = Keypair.generate();
  const agent = Keypair.generate();
  const author = Keypair.generate();

  let mint: PublicKey;
  let agentWalletPda: PublicKey;
  let agentVault: PublicKey;
  let ownerAta: PublicKey;
  let authorAta: PublicKey;

  const PER_CALL = new BN(100_000); // 0.1 USDC if 6 decimals
  const DAILY = new BN(1_000_000); // 1 USDC

  before(async () => {
    // Fund the test keypairs.
    for (const kp of [owner, agent, author]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    // Use the validator's payer as mint authority.
    const payer = (provider.wallet as anchor.Wallet).payer;
    mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6
    );

    // Compute PDAs and ATAs.
    [agentWalletPda] = PublicKey.findProgramAddressSync(
      [seed("agent"), agent.publicKey.toBuffer()],
      program.programId
    );
    agentVault = getAssociatedTokenAddressSync(mint, agentWalletPda, true);

    const ownerAtaAcc = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      owner.publicKey
    );
    ownerAta = ownerAtaAcc.address;

    const authorAtaAcc = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      author.publicKey
    );
    authorAta = authorAtaAcc.address;

    // Mint 10 USDC to the owner so they can fund the agent vault.
    await mintTo(provider.connection, payer, mint, ownerAta, payer, 10_000_000);
  });

  it("creates an agent wallet and its vault", async () => {
    await program.methods
      .createAgentWallet(PER_CALL, DAILY)
      .accountsPartial({
        owner: owner.publicKey,
        agent: agent.publicKey,
        mint,
      })
      .signers([owner])
      .rpc();

    const wallet = await program.account.agentWallet.fetch(agentWalletPda);
    expect(wallet.owner.toBase58()).to.equal(owner.publicKey.toBase58());
    expect(wallet.agent.toBase58()).to.equal(agent.publicKey.toBase58());
    expect(wallet.perCallLimit.toString()).to.equal(PER_CALL.toString());
    expect(wallet.dailyLimit.toString()).to.equal(DAILY.toString());
    expect(wallet.totalCalls.toNumber()).to.equal(0);

    const vault = await getAccount(provider.connection, agentVault);
    expect(vault.amount.toString()).to.equal("0");
    expect(vault.mint.toBase58()).to.equal(mint.toBase58());
  });

  it("rejects daily limit smaller than per-call limit", async () => {
    const otherAgent = Keypair.generate();
    let threw = false;
    try {
      await program.methods
        .createAgentWallet(new BN(500_000), new BN(100_000))
        .accountsPartial({
          owner: owner.publicKey,
          agent: otherAgent.publicKey,
          mint,
        })
        .signers([owner])
        .rpc();
    } catch (err) {
      threw = true;
      const msg = (err as Error).toString();
      expect(msg).to.match(/DailyLimitBelowPerCall|2001/);
    }
    expect(threw, "expected create_agent_wallet to revert").to.equal(true);
  });

  it("registers a skill", async () => {
    const slug = "demo-weather";
    const [skillPda] = PublicKey.findProgramAddressSync(
      [seed("skill"), enc.encode(slug)],
      program.programId
    );

    await program.methods
      .registerSkill(
        slug,
        "Demo Weather",
        "Returns current weather for a city.",
        "https://example.com/skills/demo-weather.json",
        new BN(50_000) // 0.05 USDC
      )
      .accountsPartial({
        author: author.publicKey,
        mint,
      })
      .signers([author])
      .rpc();

    const skill = await program.account.skill.fetch(skillPda);
    expect(skill.author.toBase58()).to.equal(author.publicKey.toBase58());
    expect(skill.slug).to.equal(slug);
    expect(skill.pricePerCall.toString()).to.equal("50000");
    expect(skill.active).to.equal(true);
  });

  it("settles a paid call from the agent vault to the author's ATA", async () => {
    const slug = "demo-weather";
    const [skillPda] = PublicKey.findProgramAddressSync(
      [seed("skill"), enc.encode(slug)],
      program.programId
    );

    // Owner deposits 1 USDC into the agent vault by transferring SPL.
    const payer = (provider.wallet as anchor.Wallet).payer;
    const { transferChecked } = await import("@solana/spl-token");
    await transferChecked(
      provider.connection,
      payer,
      ownerAta,
      mint,
      agentVault,
      owner,
      1_000_000,
      6
    );

    const before = await getAccount(provider.connection, authorAta);

    await program.methods
      .payForCall()
      .accountsPartial({
        agent: agent.publicKey,
        agentVault,
        skill: skillPda,
        authorTokenAccount: authorAta,
      })
      .signers([agent])
      .rpc();

    const after = await getAccount(provider.connection, authorAta);
    expect(Number(after.amount) - Number(before.amount)).to.equal(50_000);

    const wallet = await program.account.agentWallet.fetch(agentWalletPda);
    expect(wallet.totalCalls.toNumber()).to.equal(1);
    expect(wallet.totalSpent.toString()).to.equal("50000");
    expect(wallet.dailySpent.toString()).to.equal("50000");

    const skill = await program.account.skill.fetch(skillPda);
    expect(skill.totalCalls.toNumber()).to.equal(1);
    expect(skill.totalRevenue.toString()).to.equal("50000");
  });

  it("rejects calls that would exceed the per-call limit", async () => {
    const slug = "demo-expensive";
    const [skillPda] = PublicKey.findProgramAddressSync(
      [seed("skill"), enc.encode(slug)],
      program.programId
    );

    await program.methods
      .registerSkill(
        slug,
        "Expensive Skill",
        "Costs more than the agent is allowed.",
        "https://example.com/skills/expensive.json",
        new BN(500_000) // 0.5 USDC > PER_CALL of 0.1
      )
      .accountsPartial({ author: author.publicKey, mint })
      .signers([author])
      .rpc();

    let threw = false;
    try {
      await program.methods
        .payForCall()
        .accountsPartial({
          agent: agent.publicKey,
          agentVault,
          skill: skillPda,
          authorTokenAccount: authorAta,
        })
        .signers([agent])
        .rpc();
    } catch (err) {
      threw = true;
      expect((err as Error).toString()).to.match(/PerCallLimitExceeded|2008/);
    }
    expect(threw, "call should revert when per-call limit exceeded").to.equal(
      true
    );
  });

  it("rejects calls signed by someone other than the registered agent", async () => {
    const slug = "demo-weather";
    const [skillPda] = PublicKey.findProgramAddressSync(
      [seed("skill"), enc.encode(slug)],
      program.programId
    );

    const impostor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      impostor.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    let threw = false;
    try {
      await program.methods
        .payForCall()
        .accountsPartial({
          agent: impostor.publicKey,
          agentVault,
          skill: skillPda,
          authorTokenAccount: authorAta,
        })
        .signers([impostor])
        .rpc();
    } catch {
      threw = true;
    }
    expect(threw, "call by impostor should revert").to.equal(true);
  });

  it("lets the owner withdraw remaining funds", async () => {
    const before = await getAccount(provider.connection, ownerAta);

    await program.methods
      .withdraw(new BN(100_000))
      .accountsPartial({
        owner: owner.publicKey,
        agentWallet: agentWalletPda,
        agentVault,
        ownerTokenAccount: ownerAta,
      })
      .signers([owner])
      .rpc();

    const after = await getAccount(provider.connection, ownerAta);
    expect(Number(after.amount) - Number(before.amount)).to.equal(100_000);
  });
});
