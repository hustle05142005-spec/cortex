/**
 * High-level Cortex SDK entry point. Wraps the lower-level
 * `CortexClient` (Anchor methods builder) with a friendlier API:
 *
 *   const cortex = new Cortex({ rpcUrl, agent: agentKeypair });
 *   const skills = await cortex.discoverSkills();
 *   const { signature, response } = await cortex.payForCall("demo-summarize", { text });
 *
 * For owner / author flows, pass `owner` / `author` keypairs:
 *
 *   const cortex = new Cortex({ rpcUrl, agent, owner });
 *   await cortex.createWallet({ perCallLimit: 300_000n, dailyLimit: 2_000_000n, mint });
 *   await cortex.depositUsdc(5_000_000n);
 */
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionSignature,
  VersionedTransaction,
  sendAndConfirmTransaction,
  type Commitment,
} from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  getAccount,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { CortexClient } from "./cortex-client";
import { CORTEX_PROGRAM_ID } from "./idl";
import type { AgentWalletState, SkillState } from "./types";

export type AmountLike = number | bigint | BN;

export type CortexInit = {
  /** Solana RPC URL. Required. */
  rpcUrl: string;
  /** Agent signing keypair — used to sign `pay_for_call` ix. */
  agent: Keypair;
  /** Owner keypair — required for create/deposit/withdraw/updateLimits. */
  owner?: Keypair;
  /** Author keypair — required for register/update skill. */
  author?: Keypair;
  /** Override the program ID. Defaults to the deployed devnet ID. */
  programId?: string | PublicKey;
  /** RPC commitment. Defaults to "confirmed". */
  commitment?: Commitment;
};

export type SkillFilter = {
  /** Restrict to these slugs. */
  slugs?: string[];
  /** Restrict to skills authored by this pubkey. */
  author?: PublicKey;
  /** Only return `active = true` skills. Defaults to true. */
  onlyActive?: boolean;
};

export type PayForCallOptions = {
  /** Free-form input passed to the skill HTTP endpoint as JSON. */
  input?: unknown;
  /** If false, only settle on-chain and skip the HTTP call. Default: true. */
  fetchEndpoint?: boolean;
  /** Timeout for the HTTP call in ms. Default: 30_000. */
  timeoutMs?: number;
};

export type CallResult = {
  signature: TransactionSignature;
  skill: SkillState;
  pricePaid: BN;
  /** Parsed JSON response from `skill.manifestUri`, if reachable. */
  response?: unknown;
  /** True if the skill endpoint was called and returned 2xx. */
  endpointReached: boolean;
  /** HTTP status if the endpoint was called. */
  endpointStatus?: number;
};

export class Cortex {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly agent: Keypair;
  readonly owner?: Keypair;
  readonly author?: Keypair;

  private readonly _agentClient: CortexClient;
  private readonly _ownerClient?: CortexClient;
  private readonly _authorClient?: CortexClient;

  constructor(init: CortexInit) {
    this.connection = new Connection(
      init.rpcUrl,
      init.commitment ?? "confirmed"
    );
    this.programId =
      typeof init.programId === "string"
        ? new PublicKey(init.programId)
        : (init.programId ?? new PublicKey(CORTEX_PROGRAM_ID));
    this.agent = init.agent;
    this.owner = init.owner;
    this.author = init.author;

    this._agentClient = this.makeClient(init.agent);
    if (init.owner) this._ownerClient = this.makeClient(init.owner);
    if (init.author) this._authorClient = this.makeClient(init.author);
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  /** Fetch the agent's wallet state. Returns null if not yet created. */
  async getWalletState(): Promise<AgentWalletState | null> {
    return this._agentClient.fetchAgentWallet(this.agent.publicKey);
  }

  /** Fetch a single skill by slug. Returns null if not registered. */
  async getSkill(slug: string): Promise<SkillState | null> {
    return this._agentClient.fetchSkill(slug);
  }

  /** Discover skills matching the filter. */
  async discoverSkills(filter: SkillFilter = {}): Promise<SkillState[]> {
    const all = await this._agentClient.listSkills();
    return all.filter((s) => {
      if (filter.slugs && !filter.slugs.includes(s.slug)) return false;
      if (filter.author && !s.author.equals(filter.author)) return false;
      if ((filter.onlyActive ?? true) && !s.active) return false;
      return true;
    });
  }

  /** Aggregate revenue across all skills authored by `pubkey`. */
  async getAuthorRevenue(pubkey: PublicKey): Promise<{
    skillCount: number;
    totalCalls: BN;
    totalRevenue: BN;
    skills: SkillState[];
  }> {
    const skills = await this.discoverSkills({
      author: pubkey,
      onlyActive: false,
    });
    const totalCalls = skills.reduce(
      (acc, s) => acc.add(s.totalCalls),
      new BN(0)
    );
    const totalRevenue = skills.reduce(
      (acc, s) => acc.add(s.totalRevenue),
      new BN(0)
    );
    return {
      skillCount: skills.length,
      totalCalls,
      totalRevenue,
      skills,
    };
  }

  /** Live balance of the agent vault, in token base units. */
  async getVaultBalance(): Promise<bigint> {
    const wallet = await this.getWalletState();
    if (!wallet) return 0n;
    const vault = this._agentClient.agentVault(wallet.publicKey, wallet.mint);
    try {
      const acc = await getAccount(this.connection, vault);
      return acc.amount;
    } catch {
      return 0n;
    }
  }

  // ---------------------------------------------------------------------
  // Agent ops
  // ---------------------------------------------------------------------

  /**
   * Atomically pay for a skill call.
   *
   * 1. Settle `skill.pricePerCall` from agent vault to author ATA on-chain.
   * 2. Optionally POST to `skill.manifestUri` with `X-Cortex-Payment`
   *    header equal to the settle signature, and `input` as JSON body.
   * 3. Return both the on-chain proof and the endpoint response.
   */
  async payForCall(
    slug: string,
    opts: PayForCallOptions = {}
  ): Promise<CallResult> {
    const result = await this._agentClient.payForCallBySlug({
      slug,
      agentPubkey: this.agent.publicKey,
    });

    let response: unknown;
    let endpointReached = false;
    let endpointStatus: number | undefined;

    if (opts.fetchEndpoint !== false && result.skill.manifestUri) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        opts.timeoutMs ?? 30_000
      );
      try {
        const res = await fetch(result.skill.manifestUri, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-cortex-payment": result.signature,
            "x-cortex-skill": slug,
            "x-cortex-agent": this.agent.publicKey.toBase58(),
          },
          body: JSON.stringify(opts.input ?? {}),
          signal: controller.signal,
        });
        endpointStatus = res.status;
        endpointReached = res.ok;
        if (res.ok) {
          const text = await res.text();
          try {
            response = JSON.parse(text);
          } catch {
            response = text;
          }
        }
      } catch {
        // Endpoint unreachable — caller still gets settle proof.
      } finally {
        clearTimeout(timeout);
      }
    }

    return {
      signature: result.signature,
      skill: result.skill,
      pricePaid: result.pricePaid,
      response,
      endpointReached,
      endpointStatus,
    };
  }

  // ---------------------------------------------------------------------
  // Owner ops
  // ---------------------------------------------------------------------

  /** Create the agent wallet PDA + vault ATA. Owner-signed. */
  async createWallet(opts: {
    mint: PublicKey;
    perCallLimit: AmountLike;
    dailyLimit: AmountLike;
  }): Promise<TransactionSignature> {
    const owner = this.requireOwner();
    return this._ownerClient!.createAgentWallet({
      ownerPubkey: owner.publicKey,
      agentPubkey: this.agent.publicKey,
      mint: opts.mint,
      perCallLimit: toBN(opts.perCallLimit),
      dailyLimit: toBN(opts.dailyLimit),
    }).rpc();
  }

  /** Update per-call / daily limits on the agent wallet. */
  async updateLimits(opts: {
    perCallLimit: AmountLike;
    dailyLimit: AmountLike;
  }): Promise<TransactionSignature> {
    const owner = this.requireOwner();
    const [agentWallet] = this._ownerClient!.agentWalletPda(
      this.agent.publicKey
    );
    return this._ownerClient!.updateAgentLimits(
      owner.publicKey,
      agentWallet,
      toBN(opts.perCallLimit),
      toBN(opts.dailyLimit)
    ).rpc();
  }

  /** Withdraw `amount` from the vault back to the owner's ATA. */
  async withdraw(amount: AmountLike): Promise<TransactionSignature> {
    const owner = this.requireOwner();
    const wallet = await this.getWalletState();
    if (!wallet) throw new Error("Agent wallet does not exist yet.");
    const vault = this._ownerClient!.agentVault(wallet.publicKey, wallet.mint);
    const ownerAta = getAssociatedTokenAddressSync(
      wallet.mint,
      owner.publicKey
    );
    return this._ownerClient!.withdraw(
      owner.publicKey,
      wallet.publicKey,
      vault,
      ownerAta,
      toBN(amount)
    ).rpc();
  }

  /**
   * Drain the vault, close the vault token account, and close the
   * AgentWallet PDA. Rent + remaining tokens flow back to the owner.
   * Idempotent end-of-life for an agent.
   */
  async closeAgentWallet(): Promise<TransactionSignature> {
    const owner = this.requireOwner();
    const wallet = await this.getWalletState();
    if (!wallet) throw new Error("Agent wallet does not exist yet.");
    const vault = this._ownerClient!.agentVault(wallet.publicKey, wallet.mint);
    const ownerAta = getAssociatedTokenAddressSync(
      wallet.mint,
      owner.publicKey
    );
    return this._ownerClient!.closeAgentWallet(
      owner.publicKey,
      wallet.publicKey,
      vault,
      ownerAta
    ).rpc();
  }

  /**
   * Top up the agent vault by `amount` from the owner's ATA. This is a
   * plain SPL transfer (the program doesn't need to sign incoming
   * deposits) so we build it ourselves.
   */
  async depositUsdc(amount: AmountLike): Promise<TransactionSignature> {
    const owner = this.requireOwner();
    const wallet = await this.getWalletState();
    if (!wallet) throw new Error("Agent wallet does not exist yet.");
    const amountBn = toBN(amount);
    const vault = this._agentClient.agentVault(wallet.publicKey, wallet.mint);

    const ownerAta = await getOrCreateAssociatedTokenAccount(
      this.connection,
      owner,
      wallet.mint,
      owner.publicKey
    );

    const tx = new Transaction().add(
      createTransferCheckedInstruction(
        ownerAta.address,
        wallet.mint,
        vault,
        owner.publicKey,
        BigInt(amountBn.toString()),
        6
      )
    );
    return sendAndConfirmTransaction(this.connection, tx, [owner]);
  }

  // ---------------------------------------------------------------------
  // Author ops
  // ---------------------------------------------------------------------

  /** Register a new skill. Author-signed. */
  async registerSkill(opts: {
    slug: string;
    name: string;
    description: string;
    manifestUri: string;
    pricePerCall: AmountLike;
    mint: PublicKey;
  }): Promise<TransactionSignature> {
    const author = this.requireAuthor();
    return this._authorClient!.registerSkill({
      authorPubkey: author.publicKey,
      mint: opts.mint,
      slug: opts.slug,
      name: opts.name,
      description: opts.description,
      manifestUri: opts.manifestUri,
      pricePerCall: toBN(opts.pricePerCall),
    }).rpc();
  }

  /** Update price or active flag on an existing skill. */
  async updateSkill(
    slug: string,
    opts: { newPrice?: AmountLike; active?: boolean }
  ): Promise<TransactionSignature> {
    const author = this.requireAuthor();
    return this._authorClient!.updateSkill(author.publicKey, slug, {
      newPrice: opts.newPrice !== undefined ? toBN(opts.newPrice) : undefined,
      active: opts.active,
    }).rpc();
  }

  /** Close a skill PDA and refund rent to the author. */
  async closeSkill(slug: string): Promise<TransactionSignature> {
    const author = this.requireAuthor();
    return this._authorClient!.closeSkill(author.publicKey, slug).rpc();
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private makeClient(signer: Keypair): CortexClient {
    // Hand-rolled wallet shape so this file works in both the Node SDK
    // path and the Next.js browser bundle (Anchor's `Wallet` type is
    // Node-only and not exported from its browser entrypoint).
    const wallet = {
      payer: signer,
      publicKey: signer.publicKey,
      async signTransaction<T extends Transaction | VersionedTransaction>(
        tx: T
      ): Promise<T> {
        if ("version" in tx) {
          (tx as VersionedTransaction).sign([signer]);
        } else {
          (tx as Transaction).partialSign(signer);
        }
        return tx;
      },
      async signAllTransactions<T extends Transaction | VersionedTransaction>(
        txs: T[]
      ): Promise<T[]> {
        for (const tx of txs) {
          if ("version" in tx) {
            (tx as VersionedTransaction).sign([signer]);
          } else {
            (tx as Transaction).partialSign(signer);
          }
        }
        return txs;
      },
    };
    const provider = new AnchorProvider(this.connection, wallet, {
      commitment: "confirmed",
    });
    return new CortexClient(provider, { programId: this.programId });
  }

  private requireOwner(): Keypair {
    if (!this.owner)
      throw new Error("Cortex: owner keypair required for this operation.");
    return this.owner;
  }

  private requireAuthor(): Keypair {
    if (!this.author)
      throw new Error("Cortex: author keypair required for this operation.");
    return this.author;
  }
}

function toBN(v: AmountLike): BN {
  if (v instanceof BN) return v;
  if (typeof v === "bigint") return new BN(v.toString());
  return new BN(v);
}
