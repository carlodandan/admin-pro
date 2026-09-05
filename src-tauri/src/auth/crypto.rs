//! What is left of `AuthService`'s crypto once credentials moved to the cloud.
//!
//! The per-install `encryption.key` file, the bcrypt hashing and the unused
//! `encryptPassword`/`decryptPassword` pair are all gone: a local key file is
//! precisely what this design removes, and no password is hashed on this device
//! any more. Key custody now lives in `crate::crypto`, which never writes key
//! material to disk.

use rand::RngCore;

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
