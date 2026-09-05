use serde::{Serialize, Serializer};

/// Every failure that can reach the frontend. `invoke` rejects with the
/// message string, which is what the Electron handlers did when they
/// re-threw an error.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Http(#[from] reqwest::Error),

    #[error("{0}")]
    Bcrypt(#[from] bcrypt::BcryptError),

    #[error("{0}")]
    Tauri(#[from] tauri::Error),

    #[error("{0}")]
    Message(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        AppError::Message(value)
    }
}

impl From<&str> for AppError {
    fn from(value: &str) -> Self {
        AppError::Message(value.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

/// Shorthand for the `throw new Error('...')` sites in the original services.
pub fn fail<T>(message: impl Into<String>) -> Result<T> {
    Err(AppError::Message(message.into()))
}
