import { AnchorProvider, BN, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, TransactionSignature, Connection } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { cortexProgramIdl, CORTEX_PROGRAM_ID } from "./idl";
import type { CortexProgram } from "./idl";
import {
  AgentWalletState,
  SkillState,
  CreateAgentWalletParams,
  RegisterSkillParams,
  PayForCallParams,
  CortexClientOptions,
} from "./types";

const enc = new TextEncoder();

export const AGENT_SEED = enc.encode("agent");
export const SKILL_SEED = enc.encode("skill");

export class CortexClient {
  readonly program: Program<CortexProgram>;
  readonly programId: PublicKey;
  readonly provider: AnchorProvider;

  constructor(provider: AnchorProvider, opts: CortexClientOptions = {}) {
    this.programId = opts.programId ?? new PublicKey(CORTEX_PROGRAM_ID);
    this.provider = provider;
    this.program = new Program<CortexProgram>(
      cortexProgramIdl as unknown as Idl as unknown as CortexProgram,
      provider
    );
  }

  static fromConnection(
    connection: Connection,
    wallet: AnchorProvider["wallet"],
    opts?: CortexClientOptions
  ) {
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    return new CortexClient(provider, opts);
  }

  // ---------------------------------------------------------------------
  // PDA helpers
  // ---------------------------------------------------------------------

  agentWalletPda(agent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [AGENT_SEED, agent.toBuffer()],
      this.programId
    );
  }

  skillPda(slug: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SKILL_SEED, enc.encode(slug)],
      this.programId
    );
  }

  agentVault(agentWallet: PublicKey, mint: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(mint, agentWallet, true);
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async fetchAgentWallet(agent: PublicKey): Promise<AgentWalletState | null> {
    const [pda] = this.agentWalletPda(agent);
    return this.fetchAgentWalletByPda(pda);
  }

  async fetchAgentWalletByPda(
    pda: PublicKey
  ): Promise<AgentWalletState | null> {
    try {
      const w = await this.program.account.agentWallet.fetch(pda);
      return {
        publicKey: pda,
        bump: w.bump,
        owner: w.owner,
        agent: w.agent,
        mint: w.mint,
        perCallLimit: w.perCallLimit,
        dailyLimit: w.dailyLimit,
        dailySpent: w.dailySpent,
        dayStartTs: w.dayStartTs,
        totalCalls: w.totalCalls,
        totalSpent: w.totalSpent,
      };
    } catch {
      return null;
    }
  }

  async fetchSkill(slug: string): Promise<SkillState | null> {
    const [pda] = this.skillPda(slug);
    try {
      const s = await this.program.account.skill.fetch(pda);
      return {
        publicKey: pda,
        bump: s.bump,
        author: s.author,
        mint: s.mint,
        slug: s.slug,
        name: s.name,
        description: s.description,
        manifestUri: s.manifestUri,
        pricePerCall: s.pricePerCall,
        totalCalls: s.totalCalls,
        totalRevenue: s.totalRevenue,
        active: s.active,
      };
    } catch {
      return null;
    }
  }

  async listSkills(): Promise<SkillState[]> {
    const accounts = await this.program.account.skill.all();
    return accounts.map((a) => ({
      publicKey: a.publicKey,
      bump: a.account.bump,
      author: a.account.author,
      mint: a.account.mint,
      slug: a.account.slug,
      name: a.account.name,
      description: a.account.description,
      manifestUri: a.account.manifestUri,
      pricePerCall: a.account.pricePerCall,
      totalCalls: a.account.totalCalls,
      totalRevenue: a.account.totalRevenue,
      active: a.account.active,
    }));
  }

  async listAgentWallets(owner?: PublicKey): Promise<AgentWalletState[]> {
    const filters = owner
      ? [{ memcmp: { offset: 8 + 1, bytes: owner.toBase58() } }]
      : undefined;
    const accounts = await this.program.account.agentWallet.all(filters);
    return accounts.map((a) => ({
      publicKey: a.publicKey,
      bump: a.account.bump,
      owner: a.account.owner,
      agent: a.account.agent,
      mint: a.account.mint,
      perCallLimit: a.account.perCallLimit,
      dailyLimit: a.account.dailyLimit,
      dailySpent: a.account.dailySpent,
      dayStartTs: a.account.dayStartTs,
      totalCalls: a.account.totalCalls,
      totalSpent: a.account.totalSpent,
    }));
  }

  // ---------------------------------------------------------------------
  // Writes — return MethodsBuilder so callers control signing.
  // ---------------------------------------------------------------------

  createAgentWallet(params: CreateAgentWalletParams) {
    return this.program.methods
      .createAgentWallet(toBN(params.perCallLimit), toBN(params.dailyLimit))
      .accountsPartial({
        owner: params.ownerPubkey,
        agent: params.agentPubkey,
        mint: params.mint,
      });
  }

  updateAgentLimits(
    ownerPubkey: PublicKey,
    agentWallet: PublicKey,
    perCallLimit: BN | number,
    dailyLimit: BN | number
  ) {
    return this.program.methods
      .updateAgentLimits(toBN(perCallLimit), toBN(dailyLimit))
      .accountsPartial({ owner: ownerPubkey, agentWallet });
  }

  withdraw(
    ownerPubkey: PublicKey,
    agentWallet: PublicKey,
    agentVault: PublicKey,
    ownerTokenAccount: PublicKey,
    amount: BN | number
  ) {
    return this.program.methods.withdraw(toBN(amount)).accountsPartial({
      owner: ownerPubkey,
      agentWallet,
      agentVault,
      ownerTokenAccount,
    });
  }

  registerSkill(params: RegisterSkillParams) {
    return this.program.methods
      .registerSkill(
        params.slug,
        params.name,
        params.description,
        params.manifestUri,
        toBN(params.pricePerCall)
      )
      .accountsPartial({
        author: params.authorPubkey,
        mint: params.mint,
      });
  }

  updateSkill(
    authorPubkey: PublicKey,
    slug: string,
    options: { newPrice?: BN | number; active?: boolean }
  ) {
    const [skill] = this.skillPda(slug);
    return this.program.methods
      .updateSkill(
        options.newPrice !== undefined ? toBN(options.newPrice) : null,
        options.active ?? null
      )
      .accountsPartial({ author: authorPubkey, skill });
  }

  payForCall(params: PayForCallParams) {
    return this.program.methods.payForCall().accountsPartial({
      agent: params.agentPubkey,
      agentVault: params.agentVault,
      skill: params.skill,
      authorTokenAccount: params.authorTokenAccount,
    });
  }

  // ---------------------------------------------------------------------
  // Convenience: pay-for-call given a slug and an agent wallet.
  // ---------------------------------------------------------------------

  async payForCallBySlug(opts: {
    slug: string;
    agentPubkey: PublicKey;
  }): Promise<{
    signature: TransactionSignature;
    skill: SkillState;
    pricePaid: BN;
  }> {
    const skill = await this.fetchSkill(opts.slug);
    if (!skill) throw new Error(`Skill not found: ${opts.slug}`);

    const [agentWallet] = this.agentWalletPda(opts.agentPubkey);
    const wallet = await this.fetchAgentWalletByPda(agentWallet);
    if (!wallet)
      throw new Error(
        `No agent wallet for ${opts.agentPubkey.toBase58()} (registered yet?)`
      );

    const agentVault = this.agentVault(agentWallet, wallet.mint);
    const authorTokenAccount = getAssociatedTokenAddressSync(
      skill.mint,
      skill.author
    );

    const signature = await this.payForCall({
      agentPubkey: opts.agentPubkey,
      agentVault,
      skill: skill.publicKey,
      authorTokenAccount,
    }).rpc();

    return {
      signature,
      skill,
      pricePaid: skill.pricePerCall,
    };
  }
}

function toBN(v: BN | number): BN {
  return v instanceof BN ? v : new BN(v);
}
