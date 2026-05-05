//! Cortex — Solana-native infrastructure for AI agents.
//!
//! Two primitives in one program:
//!
//! 1. **AgentWallet** — a programmable, PDA-owned token vault for an AI
//!    agent. The human owner sets per-call and per-day spending limits,
//!    funds it with an SPL token (e.g. a stable like USDC), and the
//!    agent itself holds a separate signing key it uses to authorise
//!    individual `pay_for_call` instructions on-chain.
//!
//! 2. **Skill** — a registry entry created by a service author who wants
//!    to be paid every time an agent calls their endpoint. The Skill PDA
//!    stores the price-per-call, a manifest URI and counters. Agents
//!    settle payment by calling `pay_for_call`.
//!
//! The two primitives compose: the wallet is the rail, the marketplace
//! is the use-case.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV");

const SECONDS_PER_DAY: i64 = 86_400;
pub const MAX_SLUG_LEN: usize = 32;
pub const MAX_NAME_LEN: usize = 64;
pub const MAX_DESC_LEN: usize = 256;
pub const MAX_MANIFEST_LEN: usize = 200;

#[program]
pub mod cortex_program {
    use super::*;

    /// Create an AgentWallet PDA owned by `owner` and addressable by the
    /// given `agent` pubkey. Also creates the wallet's ATA for `mint`.
    pub fn create_agent_wallet(
        ctx: Context<CreateAgentWallet>,
        per_call_limit: u64,
        daily_limit: u64,
    ) -> Result<()> {
        require!(per_call_limit > 0, CortexError::InvalidLimit);
        require!(
            daily_limit >= per_call_limit,
            CortexError::DailyLimitBelowPerCall
        );

        let wallet = &mut ctx.accounts.agent_wallet;
        wallet.bump = ctx.bumps.agent_wallet;
        wallet.owner = ctx.accounts.owner.key();
        wallet.agent = ctx.accounts.agent.key();
        wallet.mint = ctx.accounts.mint.key();
        wallet.per_call_limit = per_call_limit;
        wallet.daily_limit = daily_limit;
        wallet.daily_spent = 0;
        wallet.day_start_ts = Clock::get()?.unix_timestamp;
        wallet.total_calls = 0;
        wallet.total_spent = 0;

        emit!(AgentWalletCreated {
            agent_wallet: wallet.key(),
            owner: wallet.owner,
            agent: wallet.agent,
            mint: wallet.mint,
            per_call_limit,
            daily_limit,
        });

        Ok(())
    }

    /// Owner-only: change the spending policy on an existing wallet.
    pub fn update_agent_limits(
        ctx: Context<UpdateAgentLimits>,
        per_call_limit: u64,
        daily_limit: u64,
    ) -> Result<()> {
        require!(per_call_limit > 0, CortexError::InvalidLimit);
        require!(
            daily_limit >= per_call_limit,
            CortexError::DailyLimitBelowPerCall
        );

        let wallet = &mut ctx.accounts.agent_wallet;
        wallet.per_call_limit = per_call_limit;
        wallet.daily_limit = daily_limit;

        emit!(AgentLimitsUpdated {
            agent_wallet: wallet.key(),
            per_call_limit,
            daily_limit,
        });

        Ok(())
    }

    /// Owner-only: pull `amount` of the wallet's mint back to the
    /// owner's ATA. Skipping deposit ix because that's just an SPL
    /// transfer into the PDA's vault — no signature needed.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, CortexError::AmountIsZero);

        let agent_key = ctx.accounts.agent_wallet.agent;
        let bump = ctx.accounts.agent_wallet.bump;
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"agent", agent_key.as_ref(), &[bump]]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.agent_vault.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.agent_wallet.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        emit!(Withdrawn {
            agent_wallet: ctx.accounts.agent_wallet.key(),
            owner: ctx.accounts.owner.key(),
            mint: ctx.accounts.agent_wallet.mint,
            amount,
        });

        Ok(())
    }

    /// Owner-only: drain the vault, close the vault token account, and
    /// close the AgentWallet PDA. Rent and any remaining tokens flow
    /// back to the owner. Idempotent end-of-life for an agent.
    pub fn close_agent_wallet(ctx: Context<CloseAgentWallet>) -> Result<()> {
        let remaining = ctx.accounts.agent_vault.amount;
        let agent_key = ctx.accounts.agent_wallet.agent;
        let bump = ctx.accounts.agent_wallet.bump;
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"agent", agent_key.as_ref(), &[bump]]];

        // Drain whatever's left in the vault back to owner.
        if remaining > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.agent_vault.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.agent_wallet.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            );
            token::transfer(cpi_ctx, remaining)?;
        }

        // Close the vault token account; lamports refunded to owner.
        let cpi_close = CloseAccount {
            account: ctx.accounts.agent_vault.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority: ctx.accounts.agent_wallet.to_account_info(),
        };
        let cpi_close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_close,
            signer_seeds,
        );
        token::close_account(cpi_close_ctx)?;

        emit!(AgentWalletClosed {
            agent_wallet: ctx.accounts.agent_wallet.key(),
            owner: ctx.accounts.owner.key(),
            drained: remaining,
        });

        Ok(())
    }

    /// Author-only: close a skill PDA and refund rent.
    pub fn close_skill(ctx: Context<CloseSkill>) -> Result<()> {
        emit!(SkillClosed {
            skill: ctx.accounts.skill.key(),
            author: ctx.accounts.skill.author,
            slug: ctx.accounts.skill.slug.clone(),
        });
        Ok(())
    }

    /// Register a paid skill. PDA seeded by `slug` so slugs are unique
    /// globally.
    pub fn register_skill(
        ctx: Context<RegisterSkill>,
        slug: String,
        name: String,
        description: String,
        manifest_uri: String,
        price_per_call: u64,
    ) -> Result<()> {
        require!(
            !slug.is_empty() && slug.as_bytes().len() <= MAX_SLUG_LEN,
            CortexError::InvalidSlug
        );
        require!(name.len() <= MAX_NAME_LEN, CortexError::FieldTooLong);
        require!(
            description.len() <= MAX_DESC_LEN,
            CortexError::FieldTooLong
        );
        require!(
            manifest_uri.len() <= MAX_MANIFEST_LEN,
            CortexError::FieldTooLong
        );
        require!(price_per_call > 0, CortexError::InvalidPrice);

        // Slug must be lowercase ASCII letters / digits / `-` / `_`.
        // Lowercasing is enforced (not auto-applied) so callers and
        // off-chain indexers always agree on the canonical PDA seed.
        for b in slug.as_bytes() {
            let c = *b;
            let ok =
                c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_';
            require!(ok, CortexError::InvalidSlug);
        }

        let skill = &mut ctx.accounts.skill;
        skill.bump = ctx.bumps.skill;
        skill.author = ctx.accounts.author.key();
        skill.mint = ctx.accounts.mint.key();
        skill.slug = slug.clone();
        skill.name = name;
        skill.description = description;
        skill.manifest_uri = manifest_uri;
        skill.price_per_call = price_per_call;
        skill.total_calls = 0;
        skill.total_revenue = 0;
        skill.active = true;

        emit!(SkillRegistered {
            skill: skill.key(),
            author: skill.author,
            slug,
            price_per_call,
        });

        Ok(())
    }

    /// Author-only: change price or active flag.
    pub fn update_skill(
        ctx: Context<UpdateSkill>,
        new_price: Option<u64>,
        active: Option<bool>,
    ) -> Result<()> {
        let skill = &mut ctx.accounts.skill;

        if let Some(price) = new_price {
            require!(price > 0, CortexError::InvalidPrice);
            skill.price_per_call = price;
        }
        if let Some(active_flag) = active {
            skill.active = active_flag;
        }

        emit!(SkillUpdated {
            skill: skill.key(),
            price_per_call: skill.price_per_call,
            active: skill.active,
        });

        Ok(())
    }

    /// Agent-signed payment for a single skill invocation. Settles
    /// `skill.price_per_call` from the agent's vault to the author's ATA
    /// and updates per-day accounting.
    pub fn pay_for_call(ctx: Context<PayForCall>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let price = ctx.accounts.skill.price_per_call;

        require!(ctx.accounts.skill.active, CortexError::SkillInactive);
        require!(
            ctx.accounts.skill.mint == ctx.accounts.agent_wallet.mint,
            CortexError::MintMismatch
        );
        require!(
            price <= ctx.accounts.agent_wallet.per_call_limit,
            CortexError::PerCallLimitExceeded
        );

        // Roll the daily window forward if we crossed a 24h boundary.
        let wallet = &mut ctx.accounts.agent_wallet;
        if now.saturating_sub(wallet.day_start_ts) >= SECONDS_PER_DAY {
            wallet.day_start_ts = now;
            wallet.daily_spent = 0;
        }

        let new_spent = wallet
            .daily_spent
            .checked_add(price)
            .ok_or(CortexError::Overflow)?;
        require!(
            new_spent <= wallet.daily_limit,
            CortexError::DailyLimitExceeded
        );

        // Signed CPI from the AgentWallet PDA to settle the SPL transfer.
        let agent_key = wallet.agent;
        let bump = wallet.bump;
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"agent", agent_key.as_ref(), &[bump]]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.agent_vault.to_account_info(),
            to: ctx.accounts.author_token_account.to_account_info(),
            authority: wallet.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, price)?;

        wallet.daily_spent = new_spent;
        wallet.total_calls = wallet
            .total_calls
            .checked_add(1)
            .ok_or(CortexError::Overflow)?;
        wallet.total_spent = wallet
            .total_spent
            .checked_add(price)
            .ok_or(CortexError::Overflow)?;

        let skill = &mut ctx.accounts.skill;
        skill.total_calls = skill
            .total_calls
            .checked_add(1)
            .ok_or(CortexError::Overflow)?;
        skill.total_revenue = skill
            .total_revenue
            .checked_add(price)
            .ok_or(CortexError::Overflow)?;

        emit!(SkillCalled {
            skill: skill.key(),
            agent_wallet: wallet.key(),
            agent: agent_key,
            author: skill.author,
            price,
            timestamp: now,
        });

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct CreateAgentWallet<'info> {
    /// Human owner / payer.
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: only used as a seed and for record-keeping.
    pub agent: AccountInfo<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = owner,
        space = 8 + AgentWallet::INIT_SPACE,
        seeds = [b"agent", agent.key().as_ref()],
        bump
    )]
    pub agent_wallet: Account<'info, AgentWallet>,
    #[account(
        init,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = agent_wallet,
    )]
    pub agent_vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateAgentLimits<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = owner @ CortexError::Unauthorized,
        seeds = [b"agent", agent_wallet.agent.as_ref()],
        bump = agent_wallet.bump,
    )]
    pub agent_wallet: Account<'info, AgentWallet>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = owner @ CortexError::Unauthorized,
        seeds = [b"agent", agent_wallet.agent.as_ref()],
        bump = agent_wallet.bump,
    )]
    pub agent_wallet: Account<'info, AgentWallet>,
    #[account(
        mut,
        constraint = agent_vault.mint == agent_wallet.mint @ CortexError::MintMismatch,
        constraint = agent_vault.owner == agent_wallet.key() @ CortexError::Unauthorized,
    )]
    pub agent_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = owner_token_account.mint == agent_wallet.mint @ CortexError::MintMismatch,
        constraint = owner_token_account.owner == owner.key() @ CortexError::Unauthorized,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(slug: String)]
pub struct RegisterSkill<'info> {
    #[account(mut)]
    pub author: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = author,
        space = 8 + Skill::INIT_SPACE,
        seeds = [b"skill", slug.as_bytes()],
        bump
    )]
    pub skill: Account<'info, Skill>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseAgentWallet<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        has_one = owner @ CortexError::Unauthorized,
        seeds = [b"agent", agent_wallet.agent.as_ref()],
        bump = agent_wallet.bump,
    )]
    pub agent_wallet: Account<'info, AgentWallet>,
    #[account(
        mut,
        constraint = agent_vault.mint == agent_wallet.mint @ CortexError::MintMismatch,
        constraint = agent_vault.owner == agent_wallet.key() @ CortexError::Unauthorized,
    )]
    pub agent_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = owner_token_account.mint == agent_wallet.mint @ CortexError::MintMismatch,
        constraint = owner_token_account.owner == owner.key() @ CortexError::Unauthorized,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseSkill<'info> {
    #[account(mut)]
    pub author: Signer<'info>,
    #[account(
        mut,
        close = author,
        has_one = author @ CortexError::Unauthorized,
        seeds = [b"skill", skill.slug.as_bytes()],
        bump = skill.bump,
    )]
    pub skill: Account<'info, Skill>,
}

#[derive(Accounts)]
pub struct UpdateSkill<'info> {
    pub author: Signer<'info>,
    #[account(
        mut,
        has_one = author @ CortexError::Unauthorized,
        seeds = [b"skill", skill.slug.as_bytes()],
        bump = skill.bump,
    )]
    pub skill: Account<'info, Skill>,
}

#[derive(Accounts)]
pub struct PayForCall<'info> {
    /// The agent's signing key — typically held inside the agent
    /// runtime, never the human's wallet.
    pub agent: Signer<'info>,
    #[account(
        mut,
        seeds = [b"agent", agent.key().as_ref()],
        bump = agent_wallet.bump,
        constraint = agent_wallet.agent == agent.key() @ CortexError::Unauthorized,
    )]
    pub agent_wallet: Account<'info, AgentWallet>,
    #[account(
        mut,
        constraint = agent_vault.mint == agent_wallet.mint @ CortexError::MintMismatch,
        constraint = agent_vault.owner == agent_wallet.key() @ CortexError::Unauthorized,
    )]
    pub agent_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"skill", skill.slug.as_bytes()],
        bump = skill.bump,
    )]
    pub skill: Account<'info, Skill>,
    #[account(
        mut,
        constraint = author_token_account.mint == skill.mint @ CortexError::MintMismatch,
        constraint = author_token_account.owner == skill.author @ CortexError::Unauthorized,
    )]
    pub author_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct AgentWallet {
    pub bump: u8,
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub mint: Pubkey,
    pub per_call_limit: u64,
    pub daily_limit: u64,
    pub daily_spent: u64,
    pub day_start_ts: i64,
    pub total_calls: u64,
    pub total_spent: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Skill {
    pub bump: u8,
    pub author: Pubkey,
    pub mint: Pubkey,
    #[max_len(MAX_SLUG_LEN)]
    pub slug: String,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    #[max_len(MAX_DESC_LEN)]
    pub description: String,
    #[max_len(MAX_MANIFEST_LEN)]
    pub manifest_uri: String,
    pub price_per_call: u64,
    pub total_calls: u64,
    pub total_revenue: u64,
    pub active: bool,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct AgentWalletCreated {
    pub agent_wallet: Pubkey,
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub mint: Pubkey,
    pub per_call_limit: u64,
    pub daily_limit: u64,
}

#[event]
pub struct AgentLimitsUpdated {
    pub agent_wallet: Pubkey,
    pub per_call_limit: u64,
    pub daily_limit: u64,
}

#[event]
pub struct SkillRegistered {
    pub skill: Pubkey,
    pub author: Pubkey,
    pub slug: String,
    pub price_per_call: u64,
}

#[event]
pub struct SkillUpdated {
    pub skill: Pubkey,
    pub price_per_call: u64,
    pub active: bool,
}

#[event]
pub struct SkillCalled {
    pub skill: Pubkey,
    pub agent_wallet: Pubkey,
    pub agent: Pubkey,
    pub author: Pubkey,
    pub price: u64,
    pub timestamp: i64,
}

#[event]
pub struct Withdrawn {
    pub agent_wallet: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AgentWalletClosed {
    pub agent_wallet: Pubkey,
    pub owner: Pubkey,
    pub drained: u64,
}

#[event]
pub struct SkillClosed {
    pub skill: Pubkey,
    pub author: Pubkey,
    pub slug: String,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum CortexError {
    #[msg("Per-call limit must be greater than zero.")]
    InvalidLimit,
    #[msg("Daily limit must be at least the per-call limit.")]
    DailyLimitBelowPerCall,
    #[msg("Amount must be greater than zero.")]
    AmountIsZero,
    #[msg("Slug is invalid (empty, too long, or contains forbidden bytes).")]
    InvalidSlug,
    #[msg("Field exceeds the on-chain length limit.")]
    FieldTooLong,
    #[msg("Price must be greater than zero.")]
    InvalidPrice,
    #[msg("Skill is currently disabled by its author.")]
    SkillInactive,
    #[msg("Token mint does not match between accounts.")]
    MintMismatch,
    #[msg("Skill price exceeds this agent's per-call limit.")]
    PerCallLimitExceeded,
    #[msg("Skill price would exceed this agent's daily limit.")]
    DailyLimitExceeded,
    #[msg("Numerical overflow.")]
    Overflow,
    #[msg("Caller is not authorised for this action.")]
    Unauthorized,
}
