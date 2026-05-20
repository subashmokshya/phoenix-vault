use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("PhxVau1t1111111111111111111111111111111111");

pub const VAULT_SEED: &[u8] = b"vault";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";
pub const VAULT_USDC_SEED: &[u8] = b"vault_usdc";
pub const DEPOSITOR_SEED: &[u8] = b"depositor";
pub const WITHDRAW_SEED: &[u8] = b"withdraw";
pub const PLATFORM_FEE_BPS: u16 = 2000; // 20% of perf fee to platform
pub const WITHDRAW_COOLDOWN_SLOTS: u64 = 150; // ~1 min on devnet
pub const BPS_DENOMINATOR: u64 = 10_000;
pub const SHARE_PRECISION: u64 = 1_000_000; // 6 decimals for shares

#[program]
pub mod phoenix_vault {
    use super::*;

    pub fn init_vault(
        ctx: Context<InitVault>,
        vault_index: u64,
        name: [u8; 32],
        strategy_tag: u8,
        perf_fee_bps: u16,
        mgmt_fee_bps: u16,
        deposit_cap: u64,
    ) -> Result<()> {
        require!(perf_fee_bps <= 5000, VaultError::FeeTooHigh);
        require!(mgmt_fee_bps <= 1000, VaultError::FeeTooHigh);

        let vault = &mut ctx.accounts.vault;
        vault.manager = ctx.accounts.manager.key();
        vault.authority = ctx.accounts.vault_authority.key();
        vault.usdc_vault = ctx.accounts.vault_usdc.key();
        vault.name = name;
        vault.strategy_tag = strategy_tag;
        vault.perf_fee_bps = perf_fee_bps;
        vault.mgmt_fee_bps = mgmt_fee_bps;
        vault.platform_fee_bps = PLATFORM_FEE_BPS;
        vault.deposit_cap = deposit_cap;
        vault.total_shares = 0;
        vault.nav_lamports = 0;
        vault.high_water_mark = 0;
        vault.total_deposited = 0;
        vault.total_withdrawn = 0;
        vault.paused = false;
        vault.has_open_positions = false;
        vault.phoenix_registered = false;
        vault.portfolio_index = 0;
        vault.bump = ctx.bumps.vault;
        vault.authority_bump = ctx.bumps.vault_authority;
        vault.created_at = Clock::get()?.unix_timestamp;

        emit!(VaultCreated {
            vault: vault.key(),
            manager: vault.manager,
            strategy_tag,
        });

        Ok(())
    }

    pub fn register_phoenix_account(
        ctx: Context<RegisterPhoenix>,
        portfolio_index: u8,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.manager.key(),
            ctx.accounts.vault.manager,
            VaultError::Unauthorized
        );

        let vault = &mut ctx.accounts.vault;
        vault.phoenix_registered = true;
        vault.portfolio_index = portfolio_index;

        emit!(PhoenixRegistered {
            vault: vault.key(),
            portfolio_index: vault.portfolio_index,
        });

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        let vault = &ctx.accounts.vault;
        require!(!vault.paused, VaultError::VaultPaused);
        require!(!vault.has_open_positions, VaultError::PositionsOpen);
        require!(
            vault.total_deposited + amount <= vault.deposit_cap || vault.deposit_cap == 0,
            VaultError::DepositCapExceeded
        );

        let shares_to_mint = if vault.total_shares == 0 {
            amount
                .checked_mul(SHARE_PRECISION)
                .ok_or(VaultError::MathOverflow)?
        } else {
            require!(vault.nav_lamports > 0, VaultError::NavNotSet);
            amount
                .checked_mul(vault.total_shares)
                .ok_or(VaultError::MathOverflow)?
                .checked_div(vault.nav_lamports)
                .ok_or(VaultError::MathOverflow)?
        };

        // Transfer USDC from depositor to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_usdc.to_account_info(),
                    to: ctx.accounts.vault_usdc.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        let position = &mut ctx.accounts.depositor_position;

        if position.shares == 0 {
            position.depositor = ctx.accounts.depositor.key();
            position.vault = vault.key();
            position.first_deposit_at = Clock::get()?.unix_timestamp;
            position.bump = ctx.bumps.depositor_position;
        }

        position.shares = position
            .shares
            .checked_add(shares_to_mint)
            .ok_or(VaultError::MathOverflow)?;
        position.cost_basis = position
            .cost_basis
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;

        vault.total_shares = vault
            .total_shares
            .checked_add(shares_to_mint)
            .ok_or(VaultError::MathOverflow)?;
        vault.total_deposited = vault
            .total_deposited
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;
        vault.nav_lamports = vault
            .nav_lamports
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;

        emit!(Deposited {
            vault: vault.key(),
            depositor: ctx.accounts.depositor.key(),
            amount,
            shares: shares_to_mint,
        });

        Ok(())
    }

    pub fn request_withdraw(ctx: Context<RequestWithdraw>, shares: u64) -> Result<()> {
        require!(shares > 0, VaultError::ZeroAmount);
        let vault = &ctx.accounts.vault;
        require!(!vault.has_open_positions, VaultError::PositionsOpen);

        let position = &ctx.accounts.depositor_position;
        require!(position.shares >= shares, VaultError::InsufficientShares);

        let request = &mut ctx.accounts.withdraw_request;
        request.depositor = ctx.accounts.depositor.key();
        request.vault = vault.key();
        request.shares = shares;
        request.requested_at = Clock::get()?.unix_timestamp;
        request.process_after_slot = Clock::get()?
            .slot
            .checked_add(WITHDRAW_COOLDOWN_SLOTS)
            .ok_or(VaultError::MathOverflow)?;
        request.processed = false;
        request.bump = ctx.bumps.withdraw_request;

        emit!(WithdrawRequested {
            vault: vault.key(),
            depositor: ctx.accounts.depositor.key(),
            shares,
        });

        Ok(())
    }

    pub fn process_withdraw(ctx: Context<ProcessWithdraw>) -> Result<()> {
        let request = &ctx.accounts.withdraw_request;
        require!(!request.processed, VaultError::AlreadyProcessed);
        require!(
            Clock::get()?.slot >= request.process_after_slot,
            VaultError::CooldownNotMet
        );

        let vault = &ctx.accounts.vault;
        require!(!vault.has_open_positions, VaultError::PositionsOpen);
        require!(vault.nav_lamports > 0, VaultError::NavNotSet);

        let usdc_amount = request
            .shares
            .checked_mul(vault.nav_lamports)
            .ok_or(VaultError::MathOverflow)?
            .checked_div(vault.total_shares)
            .ok_or(VaultError::MathOverflow)?;

        let vault_key = vault.key();
        let authority_bump = vault.authority_bump;
        let seeds = &[
            VAULT_AUTHORITY_SEED,
            vault_key.as_ref(),
            &[authority_bump],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_usdc.to_account_info(),
                    to: ctx.accounts.depositor_usdc.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer,
            ),
            usdc_amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        let position = &mut ctx.accounts.depositor_position;
        let request = &mut ctx.accounts.withdraw_request;

        position.shares = position
            .shares
            .checked_sub(request.shares)
            .ok_or(VaultError::MathOverflow)?;
        position.cost_basis = position
            .cost_basis
            .saturating_sub(usdc_amount);

        vault.total_shares = vault
            .total_shares
            .checked_sub(request.shares)
            .ok_or(VaultError::MathOverflow)?;
        vault.nav_lamports = vault
            .nav_lamports
            .checked_sub(usdc_amount)
            .ok_or(VaultError::MathOverflow)?;
        vault.total_withdrawn = vault
            .total_withdrawn
            .checked_add(usdc_amount)
            .ok_or(VaultError::MathOverflow)?;

        request.processed = true;

        emit!(WithdrawProcessed {
            vault: vault.key(),
            depositor: request.depositor,
            shares: request.shares,
            usdc_amount,
        });

        Ok(())
    }

    pub fn update_nav(ctx: Context<UpdateNav>, nav_lamports: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.nav_lamports = nav_lamports;
        if nav_lamports > vault.high_water_mark {
            vault.high_water_mark = nav_lamports;
        }
        vault.last_nav_update = Clock::get()?.unix_timestamp;

        emit!(NavUpdated {
            vault: vault.key(),
            nav_lamports,
        });

        Ok(())
    }

    pub fn set_positions_open(ctx: Context<SetPositionsOpen>, has_open: bool) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.manager.key(),
            ctx.accounts.vault.manager,
            VaultError::Unauthorized
        );
        ctx.accounts.vault.has_open_positions = has_open;
        Ok(())
    }

    pub fn harvest_fees(ctx: Context<HarvestFees>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        require!(vault.nav_lamports > vault.high_water_mark, VaultError::NoFeesToHarvest);

        let profit = vault
            .nav_lamports
            .checked_sub(vault.high_water_mark)
            .ok_or(VaultError::MathOverflow)?;

        let total_perf_fee = profit
            .checked_mul(vault.perf_fee_bps as u64)
            .ok_or(VaultError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(VaultError::MathOverflow)?;

        let platform_fee = total_perf_fee
            .checked_mul(vault.platform_fee_bps as u64)
            .ok_or(VaultError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(VaultError::MathOverflow)?;

        let manager_fee = total_perf_fee
            .checked_sub(platform_fee)
            .ok_or(VaultError::MathOverflow)?;

        let vault_key = vault.key();
        let authority_bump = vault.authority_bump;
        let seeds = &[
            VAULT_AUTHORITY_SEED,
            vault_key.as_ref(),
            &[authority_bump],
        ];
        let signer = &[&seeds[..]];

        if platform_fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault_usdc.to_account_info(),
                        to: ctx.accounts.platform_treasury.to_account_info(),
                        authority: ctx.accounts.vault_authority.to_account_info(),
                    },
                    signer,
                ),
                platform_fee,
            )?;
        }

        if manager_fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault_usdc.to_account_info(),
                        to: ctx.accounts.manager_usdc.to_account_info(),
                        authority: ctx.accounts.vault_authority.to_account_info(),
                    },
                    signer,
                ),
                manager_fee,
            )?;
        }

        let vault = &mut ctx.accounts.vault;
        vault.high_water_mark = vault.nav_lamports;
        vault.nav_lamports = vault
            .nav_lamports
            .checked_sub(total_perf_fee)
            .ok_or(VaultError::MathOverflow)?;

        emit!(FeesHarvested {
            vault: vault.key(),
            platform_fee,
            manager_fee,
        });

        Ok(())
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.manager.key(),
            ctx.accounts.vault.manager,
            VaultError::Unauthorized
        );
        ctx.accounts.vault.paused = paused;
        emit!(VaultPaused {
            vault: ctx.accounts.vault.key(),
            paused,
        });
        Ok(())
    }

    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        require!(vault.paused, VaultError::VaultNotPaused);

        let position = &ctx.accounts.depositor_position;
        require!(position.shares > 0, VaultError::InsufficientShares);
        require!(vault.total_shares > 0, VaultError::MathOverflow);

        let usdc_amount = position
            .shares
            .checked_mul(vault.nav_lamports)
            .ok_or(VaultError::MathOverflow)?
            .checked_div(vault.total_shares)
            .ok_or(VaultError::MathOverflow)?;

        let vault_key = vault.key();
        let authority_bump = vault.authority_bump;
        let seeds = &[
            VAULT_AUTHORITY_SEED,
            vault_key.as_ref(),
            &[authority_bump],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_usdc.to_account_info(),
                    to: ctx.accounts.depositor_usdc.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer,
            ),
            usdc_amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        let position = &mut ctx.accounts.depositor_position;
        let shares_burned = position.shares;

        vault.total_shares = vault
            .total_shares
            .checked_sub(shares_burned)
            .ok_or(VaultError::MathOverflow)?;
        vault.nav_lamports = vault.nav_lamports.saturating_sub(usdc_amount);
        position.shares = 0;
        position.cost_basis = 0;

        emit!(EmergencyWithdraw {
            vault: vault.key(),
            depositor: ctx.accounts.depositor.key(),
            usdc_amount,
        });

        Ok(())
    }
}

// ─── Accounts ───────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub manager: Pubkey,
    pub authority: Pubkey,
    pub usdc_vault: Pubkey,
    pub name: [u8; 32],
    pub strategy_tag: u8,
    pub perf_fee_bps: u16,
    pub mgmt_fee_bps: u16,
    pub platform_fee_bps: u16,
    pub deposit_cap: u64,
    pub total_shares: u64,
    pub nav_lamports: u64,
    pub high_water_mark: u64,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub paused: bool,
    pub has_open_positions: bool,
    pub phoenix_registered: bool,
    pub portfolio_index: u8,
    pub bump: u8,
    pub authority_bump: u8,
    pub created_at: i64,
    pub last_nav_update: i64,
}

#[account]
#[derive(InitSpace)]
pub struct DepositorPosition {
    pub depositor: Pubkey,
    pub vault: Pubkey,
    pub shares: u64,
    pub cost_basis: u64,
    pub first_deposit_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct WithdrawRequest {
    pub depositor: Pubkey,
    pub vault: Pubkey,
    pub shares: u64,
    pub requested_at: i64,
    pub process_after_slot: u64,
    pub processed: bool,
    pub bump: u8,
}

// ─── Contexts ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(vault_index: u64)]
pub struct InitVault<'info> {
    #[account(mut)]
    pub manager: Signer<'info>,

    #[account(
        init,
        payer = manager,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, manager.key().as_ref(), &vault_index.to_le_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: PDA authority for vault operations
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = manager,
        token::mint = usdc_mint,
        token::authority = vault_authority,
        seeds = [VAULT_USDC_SEED, vault.key().as_ref()],
        bump
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RegisterPhoenix<'info> {
    pub manager: Signer<'info>,
    #[account(mut, has_one = manager)]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [VAULT_USDC_SEED, vault.key().as_ref()],
        bump,
        constraint = vault_usdc.key() == vault.usdc_vault
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = 8 + DepositorPosition::INIT_SPACE,
        seeds = [DEPOSITOR_SEED, vault.key().as_ref(), depositor.key().as_ref()],
        bump
    )]
    pub depositor_position: Account<'info, DepositorPosition>,

    #[account(mut, constraint = depositor_usdc.owner == depositor.key())]
    pub depositor_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
    pub depositor: Signer<'info>,

    #[account(
        seeds = [DEPOSITOR_SEED, vault.key().as_ref(), depositor.key().as_ref()],
        bump = depositor_position.bump,
        has_one = depositor,
        has_one = vault
    )]
    pub depositor_position: Account<'info, DepositorPosition>,

    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = depositor,
        space = 8 + WithdrawRequest::INIT_SPACE,
        seeds = [WITHDRAW_SEED, vault.key().as_ref(), depositor.key().as_ref(), &depositor_position.shares.to_le_bytes()],
        bump
    )]
    pub withdraw_request: Account<'info, WithdrawRequest>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProcessWithdraw<'info> {
    pub payer: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, Vault>,

    /// CHECK: vault authority PDA
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut, constraint = vault_usdc.key() == vault.usdc_vault)]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [DEPOSITOR_SEED, vault.key().as_ref(), withdraw_request.depositor.as_ref()],
        bump = depositor_position.bump
    )]
    pub depositor_position: Account<'info, DepositorPosition>,

    #[account(mut, has_one = vault)]
    pub withdraw_request: Account<'info, WithdrawRequest>,

    #[account(mut, constraint = depositor_usdc.owner == withdraw_request.depositor)]
    pub depositor_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateNav<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    pub crank: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetPositionsOpen<'info> {
    pub manager: Signer<'info>,
    #[account(mut, has_one = manager)]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct HarvestFees<'info> {
    pub manager: Signer<'info>,

    #[account(mut, has_one = manager)]
    pub vault: Account<'info, Vault>,

    /// CHECK: vault authority PDA
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut, constraint = vault_usdc.key() == vault.usdc_vault)]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(mut)]
    pub platform_treasury: Account<'info, TokenAccount>,

    #[account(mut, constraint = manager_usdc.owner == manager.key())]
    pub manager_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub manager: Signer<'info>,
    #[account(mut, has_one = manager)]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, Vault>,

    /// CHECK: vault authority PDA
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut, constraint = vault_usdc.key() == vault.usdc_vault)]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [DEPOSITOR_SEED, vault.key().as_ref(), depositor.key().as_ref()],
        bump = depositor_position.bump,
        has_one = depositor
    )]
    pub depositor_position: Account<'info, DepositorPosition>,

    #[account(mut, constraint = depositor_usdc.owner == depositor.key())]
    pub depositor_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─── Events ─────────────────────────────────────────────────────────────────

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub manager: Pubkey,
    pub strategy_tag: u8,
}

#[event]
pub struct PhoenixRegistered {
    pub vault: Pubkey,
    pub portfolio_index: u8,
}

#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub shares: u64,
}

#[event]
pub struct WithdrawRequested {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub shares: u64,
}

#[event]
pub struct WithdrawProcessed {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub shares: u64,
    pub usdc_amount: u64,
}

#[event]
pub struct NavUpdated {
    pub vault: Pubkey,
    pub nav_lamports: u64,
}

#[event]
pub struct FeesHarvested {
    pub vault: Pubkey,
    pub platform_fee: u64,
    pub manager_fee: u64,
}

#[event]
pub struct VaultPaused {
    pub vault: Pubkey,
    pub paused: bool,
}

#[event]
pub struct EmergencyWithdraw {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub usdc_amount: u64,
}

// ─── Errors ─────────────────────────────────────────────────────────────────

#[error_code]
pub enum VaultError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Vault is not paused")]
    VaultNotPaused,
    #[msg("Vault has open positions - deposits/withdrawals blocked")]
    PositionsOpen,
    #[msg("Fee exceeds maximum allowed")]
    FeeTooHigh,
    #[msg("Deposit cap exceeded")]
    DepositCapExceeded,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("NAV not set")]
    NavNotSet,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Zero amount")]
    ZeroAmount,
    #[msg("Withdrawal already processed")]
    AlreadyProcessed,
    #[msg("Withdrawal cooldown not met")]
    CooldownNotMet,
    #[msg("No fees to harvest")]
    NoFeesToHarvest,
}
