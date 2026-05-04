import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

export type AgentWalletState = {
  publicKey: PublicKey;
  bump: number;
  owner: PublicKey;
  agent: PublicKey;
  mint: PublicKey;
  perCallLimit: BN;
  dailyLimit: BN;
  dailySpent: BN;
  dayStartTs: BN;
  totalCalls: BN;
  totalSpent: BN;
};

export type SkillState = {
  publicKey: PublicKey;
  bump: number;
  author: PublicKey;
  mint: PublicKey;
  slug: string;
  name: string;
  description: string;
  manifestUri: string;
  pricePerCall: BN;
  totalCalls: BN;
  totalRevenue: BN;
  active: boolean;
};

export type CreateAgentWalletParams = {
  ownerPubkey: PublicKey;
  agentPubkey: PublicKey;
  mint: PublicKey;
  perCallLimit: BN | number;
  dailyLimit: BN | number;
};

export type RegisterSkillParams = {
  authorPubkey: PublicKey;
  mint: PublicKey;
  slug: string;
  name: string;
  description: string;
  manifestUri: string;
  pricePerCall: BN | number;
};

export type PayForCallParams = {
  agentPubkey: PublicKey;
  agentVault: PublicKey;
  skill: PublicKey;
  authorTokenAccount: PublicKey;
};

export type CortexClientOptions = {
  programId?: PublicKey;
};
