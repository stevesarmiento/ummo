use anchor_lang::prelude::*;

#[error_code]
pub enum UmmoError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid token program")]
    InvalidTokenProgram,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Invalid vault account")]
    InvalidVaultAccount,
    #[msg("Invalid PDA")]
    InvalidPda,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Not implemented")]
    NotImplemented,
    #[msg("Invalid oracle account")]
    InvalidOracleAccount,
    #[msg("Oracle is stale")]
    OracleStale,
    #[msg("Oracle price is invalid")]
    OracleInvalidPrice,
    #[msg("Oracle confidence too wide")]
    OracleConfidenceTooWide,
    #[msg("Execution price too far from oracle")]
    ExecPriceTooFarFromOracle,
    #[msg("Risk engine insufficient balance")]
    RiskInsufficientBalance,
    #[msg("Risk engine undercollateralized")]
    RiskUndercollateralized,
    #[msg("Risk engine invalid matching engine")]
    RiskInvalidMatchingEngine,
    #[msg("Risk engine pnl not warmed up")]
    RiskPnlNotWarmedUp,
    #[msg("Risk engine overflow")]
    RiskOverflow,
    #[msg("Risk engine account not found")]
    RiskAccountNotFound,
    #[msg("Risk engine account is not LP")]
    RiskNotAnLpAccount,
    #[msg("Risk engine position size mismatch")]
    RiskPositionSizeMismatch,
    #[msg("Risk engine account kind mismatch")]
    RiskAccountKindMismatch,
    #[msg("Risk engine side blocked")]
    RiskSideBlocked,
    #[msg("Risk engine corrupt state")]
    RiskCorruptState,
}

impl From<percolator::RiskError> for UmmoError {
    fn from(value: percolator::RiskError) -> Self {
        match value {
            percolator::RiskError::InsufficientBalance => Self::RiskInsufficientBalance,
            percolator::RiskError::Undercollateralized => Self::RiskUndercollateralized,
            percolator::RiskError::Unauthorized => Self::Unauthorized,
            percolator::RiskError::InvalidMatchingEngine => Self::RiskInvalidMatchingEngine,
            percolator::RiskError::PnlNotWarmedUp => Self::RiskPnlNotWarmedUp,
            percolator::RiskError::Overflow => Self::RiskOverflow,
            percolator::RiskError::AccountNotFound => Self::RiskAccountNotFound,
            percolator::RiskError::NotAnLPAccount => Self::RiskNotAnLpAccount,
            percolator::RiskError::PositionSizeMismatch => Self::RiskPositionSizeMismatch,
            percolator::RiskError::AccountKindMismatch => Self::RiskAccountKindMismatch,
            percolator::RiskError::SideBlocked => Self::RiskSideBlocked,
            percolator::RiskError::CorruptState => Self::RiskCorruptState,
        }
    }
}
