//! Key custody and field-level encryption.
//!
//! There is exactly one data-encryption key (DEK) per installation. It is
//! generated in the cloud project at registration and stored there only in
//! wrapped form, sealed twice over:
//!
//! * `wrapped_by_password` — Argon2id(admin password) as the key-encryption key
//! * `wrapped_by_recovery` — Argon2id(generated super-admin key) as the KEK
//!
//! Both blobs are self-describing: `salt(16) || nonce(12) || ciphertext+tag`.
//! No verifier, hash or plaintext copy of the DEK exists anywhere — possession
//! of a secret is proven by the unwrap succeeding, so there is nothing on either
//! side of the wire that an attacker could crack offline without also attacking
//! Argon2id.
//!
//! Field values are stored as `enc:v1:<base64url(nonce(12) || ct+tag)>`. Both
//! `encrypt_field` and `decrypt_field` short-circuit on that prefix, which makes
//! them total functions: encrypting twice is impossible, decrypting a plaintext
//! row left over from an older build is a no-op, and the backfill in
//! `db::migrations` is therefore idempotent by construction rather than by
//! bookkeeping.

pub mod keychain;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;
use subtle::ConstantTimeEq;
use zeroize::Zeroizing;

use crate::error::{fail, AppError, Result};

/// The one key that encrypts employee PII in both databases. Wrapped in
/// `Zeroizing` so it is scrubbed from memory when the last holder drops it.
pub type Dek = Zeroizing<[u8; KEY_LEN]>;

pub const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
/// `aes-gcm` appends the tag to the ciphertext rather than reporting it apart.
const TAG_LEN: usize = 16;

/// Marks an encrypted field. Bump the version rather than changing the payload
/// shape in place, so old rows stay readable.
pub const FIELD_PREFIX: &str = "enc:v1:";

/// Crockford's alphabet: no I, L, O or U, so a key read off a screen and typed
/// back in cannot be mistranscribed into a different valid key.
const BASE32: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/// A fresh 256-bit data key.
pub fn random_dek() -> Dek {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    rand::thread_rng().fill_bytes(key.as_mut_slice());
    key
}

/// The super-admin recovery key, generated once at registration and shown to the
/// operator exactly once. It is *generated* rather than chosen: it is the escrow
/// of last resort, so it must not inherit a human's password entropy.
///
/// 32 random bytes in Crockford base32, hyphenated into groups of four.
pub fn generate_recovery_key() -> String {
    let mut bytes = [0u8; KEY_LEN];
    rand::thread_rng().fill_bytes(&mut bytes);

    let mut symbols = String::with_capacity(52);
    let mut buffer: u16 = 0;
    let mut bits = 0u32;
    for byte in bytes {
        buffer = (buffer << 8) | u16::from(byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            let index = ((buffer >> bits) & 0x1f) as usize;
            symbols.push(char::from(BASE32[index]));
        }
    }
    if bits > 0 {
        let index = ((buffer << (5 - bits)) & 0x1f) as usize;
        symbols.push(char::from(BASE32[index]));
    }

    symbols
        .as_bytes()
        .chunks(4)
        .map(|chunk| String::from_utf8_lossy(chunk).to_string())
        .collect::<Vec<_>>()
        .join("-")
}

/// Fold a re-typed recovery key back to the exact string `wrap` was given.
///
/// Hyphens and spaces are dropped, case is normalised, and the characters
/// Crockford's alphabet omits are folded to the digits they are mistaken for.
/// Wrapping and unwrapping both go through this, so a key typed as
/// `abcd efgh` unwraps the same blob as `ABCD-EFGH`.
pub fn canonical_recovery_key(input: &str) -> String {
    input
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| match character.to_ascii_uppercase() {
            'I' | 'L' => '1',
            'O' => '0',
            other => other,
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Wrapping the data key
// ---------------------------------------------------------------------------

/// Seal `secret` under `passphrase`, returning `salt(16) || nonce(12) || ct+tag`.
///
/// The salt is fresh on every call, so re-wrapping the same key under the same
/// password produces a different blob and reveals nothing by comparison.
pub fn wrap(secret: &[u8], passphrase: &str) -> Result<Vec<u8>> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    let mut rng = rand::thread_rng();
    rng.fill_bytes(&mut salt);
    rng.fill_bytes(&mut nonce);

    let kek = derive_kek(passphrase, &salt)?;
    let sealed = seal(kek.as_slice(), &nonce, secret)?;

    let mut blob = Vec::with_capacity(SALT_LEN + NONCE_LEN + sealed.len());
    blob.extend_from_slice(&salt);
    blob.extend_from_slice(&nonce);
    blob.extend_from_slice(&sealed);
    Ok(blob)
}

/// Recover the data key from a wrapped blob.
///
/// A wrong passphrase fails the GCM tag check, which is the only proof of
/// possession in the system — there is no stored hash to compare against.
pub fn unwrap(blob: &[u8], passphrase: &str) -> Result<Dek> {
    let expected = SALT_LEN + NONCE_LEN + KEY_LEN + TAG_LEN;
    if blob.len() != expected {
        return fail(format!(
            "the stored key is {} bytes, expected {expected} — it is corrupt or was written by an incompatible build",
            blob.len()
        ));
    }

    let (salt, rest) = blob.split_at(SALT_LEN);
    let (nonce, sealed) = rest.split_at(NONCE_LEN);

    let kek = derive_kek(passphrase, salt)?;
    let plain = open(kek.as_slice(), nonce, sealed)
        .map_err(|_| AppError::Message("Incorrect password or recovery key.".to_string()))?;

    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    key.copy_from_slice(&plain);
    Ok(key)
}

/// Argon2id with the crate defaults — 19 MiB, two passes, one lane, which is the
/// OWASP-recommended configuration — over the passphrase and salt.
fn derive_kek(passphrase: &str, salt: &[u8]) -> Result<Zeroizing<[u8; KEY_LEN]>> {
    let mut kek = Zeroizing::new([0u8; KEY_LEN]);
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, kek.as_mut_slice())
        .map_err(|error| AppError::Message(format!("key derivation failed: {error}")))?;
    Ok(kek)
}

// ---------------------------------------------------------------------------
// Field encryption
// ---------------------------------------------------------------------------

/// Encrypt one field value, or return it unchanged when it is already encrypted.
///
/// The prefix test — not a trial decryption — is what makes double encryption
/// impossible, so a backfill can run over a half-migrated table safely.
pub fn encrypt_field(dek: &Dek, value: &str) -> Result<String> {
    if value.starts_with(FIELD_PREFIX) || value.is_empty() {
        return Ok(value.to_string());
    }

    let mut nonce = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce);

    let sealed = seal(dek.as_slice(), &nonce, value.as_bytes())?;
    let mut payload = Vec::with_capacity(NONCE_LEN + sealed.len());
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&sealed);

    Ok(format!("{FIELD_PREFIX}{}", URL_SAFE_NO_PAD.encode(payload)))
}

/// Decrypt one field value, or return it unchanged when it is not encrypted.
///
/// Rows written by an earlier build are plaintext and must keep reading
/// correctly until the backfill reaches them.
pub fn decrypt_field(dek: &Dek, value: &str) -> Result<String> {
    let Some(encoded) = value.strip_prefix(FIELD_PREFIX) else {
        return Ok(value.to_string());
    };

    let payload = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|error| AppError::Message(format!("encrypted field is malformed: {error}")))?;
    if payload.len() < NONCE_LEN + TAG_LEN {
        return fail("encrypted field is truncated");
    }

    let (nonce, sealed) = payload.split_at(NONCE_LEN);
    let plain = open(dek.as_slice(), nonce, sealed).map_err(|_| {
        AppError::Message(
            "A field could not be decrypted with this installation's key.".to_string(),
        )
    })?;

    String::from_utf8(plain)
        .map_err(|error| AppError::Message(format!("decrypted field is not text: {error}")))
}

/// `encrypt_field` over a nullable column.
pub fn encrypt_opt(dek: &Dek, value: Option<&str>) -> Result<Option<String>> {
    value.map(|inner| encrypt_field(dek, inner)).transpose()
}

/// `decrypt_field` over a nullable column.
pub fn decrypt_opt(dek: &Dek, value: Option<&str>) -> Result<Option<String>> {
    value.map(|inner| decrypt_field(dek, inner)).transpose()
}

// ---------------------------------------------------------------------------
// Blind indexes
// ---------------------------------------------------------------------------

/// The blind-index key, derived from the data key rather than stored.
///
/// `employees.email` and `company_id` are unique columns. AES-GCM uses a random
/// nonce, so one address encrypts to a different string every time and a UNIQUE
/// constraint on the ciphertext silently stops enforcing anything. The real
/// constraint moves to a deterministic keyed digest of the plaintext, which
/// reveals equality and nothing else.
pub fn derive_index_key(dek: &Dek) -> Zeroizing<[u8; KEY_LEN]> {
    let mut index_key = Zeroizing::new([0u8; KEY_LEN]);
    Hkdf::<Sha256>::new(None, dek.as_slice())
        .expand(b"admin-pro/blind-index/v1", index_key.as_mut_slice())
        // 32 bytes is well inside HKDF-SHA256's 8160-byte ceiling.
        .expect("32 bytes is a valid HKDF-SHA256 output length");
    index_key
}

/// `hex(HMAC-SHA256(index_key, lower(trim(value))))`.
///
/// Trimming and lower-casing make the index match the case-insensitive equality
/// the plaintext UNIQUE constraint used to imply for email addresses.
pub fn blind_index(index_key: &[u8; KEY_LEN], value: &str) -> String {
    let mut mac = <Hmac<Sha256>>::new_from_slice(index_key)
        .expect("HMAC accepts a key of any length");
    mac.update(value.trim().to_lowercase().as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// `blind_index` over a nullable column. An empty value indexes to `None` so a
/// blank stays outside the unique index instead of colliding with other blanks.
pub fn blind_index_opt(index_key: &[u8; KEY_LEN], value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|inner| !inner.is_empty())
        .map(|inner| blind_index(index_key, inner))
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/// Constant-time string equality, for comparing a decrypted PIN against the one
/// the kiosk was given. A `==` here would leak the PIN one character at a time
/// through response timing.
pub fn secret_eq(left: &str, right: &str) -> bool {
    left.as_bytes().ct_eq(right.as_bytes()).into()
}

// ---------------------------------------------------------------------------
// AEAD primitives
// ---------------------------------------------------------------------------

fn seal(key: &[u8], nonce: &[u8], plain: &[u8]) -> Result<Vec<u8>> {
    cipher(key)?
        .encrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: plain,
                aad: &[],
            },
        )
        .map_err(|_| AppError::Message("encryption failed".to_string()))
}

fn open(key: &[u8], nonce: &[u8], sealed: &[u8]) -> Result<Vec<u8>> {
    cipher(key)?
        .decrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: sealed,
                aad: &[],
            },
        )
        .map_err(|_| AppError::Message("decryption failed".to_string()))
}

fn cipher(key: &[u8]) -> Result<Aes256Gcm> {
    Aes256Gcm::new_from_slice(key)
        .map_err(|_| AppError::Message("the encryption key is the wrong length".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrapping_round_trips_and_rejects_the_wrong_passphrase() {
        let dek = random_dek();
        let blob = wrap(dek.as_slice(), "correct horse").expect("wrap");

        assert_eq!(blob.len(), SALT_LEN + NONCE_LEN + KEY_LEN + TAG_LEN);
        assert_eq!(
            unwrap(&blob, "correct horse").expect("unwrap").as_slice(),
            dek.as_slice()
        );
        assert!(unwrap(&blob, "wrong horse").is_err());
    }

    #[test]
    fn wrapping_is_salted_per_call() {
        let dek = random_dek();
        let first = wrap(dek.as_slice(), "same").expect("wrap");
        let second = wrap(dek.as_slice(), "same").expect("wrap");
        assert_ne!(first, second);
    }

    #[test]
    fn a_field_is_never_encrypted_twice() {
        let dek = random_dek();
        let once = encrypt_field(&dek, "someone@example.com").expect("encrypt");
        let twice = encrypt_field(&dek, &once).expect("re-encrypt");

        assert_eq!(once, twice, "the enc:v1: prefix must short-circuit");
        assert_eq!(
            decrypt_field(&dek, &twice).expect("decrypt"),
            "someone@example.com"
        );
    }

    #[test]
    fn plaintext_passes_through_decryption_untouched() {
        let dek = random_dek();
        assert_eq!(
            decrypt_field(&dek, "not-yet-migrated").expect("decrypt"),
            "not-yet-migrated"
        );
    }

    #[test]
    fn the_blind_index_is_deterministic_and_case_folded() {
        let dek = random_dek();
        let index_key = derive_index_key(&dek);

        assert_eq!(
            blind_index(&index_key, "  Someone@Example.COM "),
            blind_index(&index_key, "someone@example.com")
        );
        assert_ne!(
            blind_index(&index_key, "a@example.com"),
            blind_index(&index_key, "b@example.com")
        );
        assert_eq!(blind_index_opt(&index_key, Some("   ")), None);
    }

    #[test]
    fn a_recovery_key_canonicalises_back_to_itself() {
        let key = generate_recovery_key();
        assert_eq!(key.len(), 52 + 12, "52 base32 symbols in 13 hyphenated groups");

        let canonical = canonical_recovery_key(&key);
        assert_eq!(canonical.len(), 52);
        assert_eq!(canonical_recovery_key(&key.to_lowercase()), canonical);
        assert_eq!(canonical_recovery_key(&key.replace('-', " ")), canonical);
    }
}
