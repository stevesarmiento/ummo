use quasar_lang::prelude::*;

#[error_code]
pub enum UmmoError {
    Unauthorized = 6000,
    InvalidTokenProgram,
    InvalidTokenAccount,
    InvalidVaultAccount,
    InvalidPda,
    InvalidAmount,
    NotImplemented,
    InvalidOracleAccount,
    OracleStale,
    OracleInvalidPrice,
    OracleConfidenceTooWide,
    ExecPriceTooFarFromOracle,

    RiskInsufficientBalance,
    RiskUndercollateralized,
    RiskInvalidMatchingEngine,
    RiskPnlNotWarmedUp,
    RiskOverflow,
    RiskAccountNotFound,
    RiskNotAnLpAccount,
    RiskPositionSizeMismatch,
    RiskAccountKindMismatch,
    RiskSideBlocked,
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

