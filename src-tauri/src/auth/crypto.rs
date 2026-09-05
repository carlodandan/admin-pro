//! The crypto half of `AuthService`: the per-install encryption key, bcrypt
//! hashing and the license-key generator.

use std::path::Path;

use aes_gcm::aead::consts::U16;
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::aes::Aes256;
use aes_gcm::{AesGcm, Nonce};
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::error::{fail, Result};
use crate::manila;

/// Node's `createCipheriv('aes-256-gcm', key, iv)` accepts a 16-byte IV, which
/// this app used. The `aes-gcm` default is 12 bytes, so the nonce size is
/// widened to match rather than re-encrypting anything.
type Aes256Gcm16 = AesGcm<Aes256, U16>;

/// bcryptjs used `genSalt(10)`; the cost has to match or existing hashes stop
/// verifying.
const BCRYPT_COST: u32 = 10;

/// `initializeEncryptionKey()` — load `encryption.key` or create it.
pub fn initialize_encryption_key(key_path: &Path, data_dir: &Path) -> String {
    match load_or_create(key_path) {
        Ok(key) => key,
        Err(error) => {
            eprintln!("Error handling encryption key: {error}");
            fallback_key(data_dir)
        }
    }
}

fn load_or_create(key_path: &Path) -> Result<String> {
    if key_path.exists() {
        let contents = std::fs::read_to_string(key_path)?;
        let parsed: Value = serde_json::from_str(&contents)?;
        return match parsed.get("key").and_then(Value::as_str) {
            Some(key) if !key.is_empty() => Ok(key.to_string()),
            _ => fail("encryption.key is missing its `key` field"),
        };
    }

    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let key = hex::encode(bytes);

    if let Some(parent) = key_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        key_path,
        serde_json::to_vec(&json!({
            "key": key,
            "created": manila::iso_utc(),
            "algorithm": "aes-256-gcm",
        }))?,
    )?;

    Ok(key)
}

/// `getFallbackKey()` — machine-derived, used only when the key file is
/// unreadable. Same inputs, same order, same separator as the original.
pub fn fallback_key(data_dir: &Path) -> String {
    let machine_info = [
        data_dir.to_string_lossy().to_string(),
        // `process.platform` on Windows.
        "win32".to_string(),
        // `app.getName()` resolves to productName.
        "Admin Pro".to_string(),
    ]
    .join("|");

    let digest = Sha256::digest(machine_info.as_bytes());
    hex::encode(digest)
}

/// `getKey(secret)` — the raw SHA-256 of the hex string, not of its bytes.
fn derive_key(secret: &str) -> [u8; 32] {
    Sha256::digest(secret.as_bytes()).into()
}

/// `encryptPassword()`.
///
/// Unused by the app — as in the original, where nothing called it — but kept
/// so the `encryption.key` lifecycle and the on-disk format stay portable.
#[allow(dead_code)]
pub fn encrypt_password(secret: &str, password: &str) -> Result<Value> {
    let cipher = Aes256Gcm16::new_from_slice(&derive_key(secret))
        .map_err(|_| crate::error::AppError::Message("invalid encryption key".to_string()))?;

    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);

    let sealed = cipher
        .encrypt(
            Nonce::<U16>::from_slice(&iv),
            Payload {
                msg: password.as_bytes(),
                aad: &[],
            },
        )
        .map_err(|_| crate::error::AppError::Message("encryption failed".to_string()))?;

    // Node reports the 16-byte tag separately; `aes-gcm` appends it.
    let split = sealed.len().saturating_sub(16);
    Ok(json!({
        "iv": hex::encode(iv),
        "encrypted": hex::encode(&sealed[..split]),
        "authTag": hex::encode(&sealed[split..]),
        "keyVersion": "1.0",
    }))
}

/// `decryptPassword()`. Also unused by the app.
#[allow(dead_code)]
pub fn decrypt_password(secret: &str, data: &Value) -> Result<String> {
    let hex_field = |key: &str| -> Result<Vec<u8>> {
        let value = data.get(key).and_then(Value::as_str).unwrap_or_default();
        hex::decode(value).map_err(|error| crate::error::AppError::Message(error.to_string()))
    };

    let iv = hex_field("iv")?;
    let mut sealed = hex_field("encrypted")?;
    sealed.extend_from_slice(&hex_field("authTag")?);

    let cipher = Aes256Gcm16::new_from_slice(&derive_key(secret))
        .map_err(|_| crate::error::AppError::Message("invalid encryption key".to_string()))?;

    let plain = cipher
        .decrypt(
            Nonce::<U16>::from_slice(&iv),
            Payload {
                msg: &sealed,
                aad: &[],
            },
        )
        .map_err(|_| crate::error::AppError::Message("decryption failed".to_string()))?;

    String::from_utf8(plain)
        .map_err(|error| crate::error::AppError::Message(error.to_string()))
}

/// `hashPassword()`.
pub fn hash_password(password: &str) -> Result<String> {
    bcrypt::hash(password, BCRYPT_COST).map_err(|error| {
        eprintln!("Error hashing password: {error}");
        error.into()
    })
}

/// `verifyPassword()` — `false` on any error, as the original returned.
pub fn verify_password(password: &str, hash: &str) -> bool {
    match bcrypt::verify(password, hash) {
        Ok(valid) => valid,
        Err(error) => {
            eprintln!("Error verifying password: {error}");
            false
        }
    }
}

/// `generateLicenseKey()` — `LIC-<base36 millis>-<4 random bytes>`, uppercased.
pub fn generate_license_key() -> String {
    let millis = chrono::Utc::now().timestamp_millis().max(0) as u64;
    let mut random = [0u8; 4];
    rand::thread_rng().fill_bytes(&mut random);

    format!("LIC-{}-{}", base36(millis), hex::encode(random)).to_uppercase()
}

/// `Number.prototype.toString(36)`.
fn base36(mut value: u64) -> String {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_string();
    }

    let mut out = Vec::new();
    while value > 0 {
        out.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_default()
}
