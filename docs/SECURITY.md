# Security Model

> How Admin Pro stores credentials, where the encryption key lives, what stays encrypted at
> rest, and — just as importantly — what this design does not defend against.

Everything below is implemented in `src-tauri/src/crypto/`, `src-tauri/src/auth/mod.rs` and
`supabase/migrations/20260905052457_cloud_credentials_and_keyring.sql`. Where the code and
this document disagree, the code is right; please open an issue.

---

## Contents

- [Design goals](#design-goals)
- [Threat model](#threat-model)
- [Identity and authorization](#identity-and-authorization)
- [The data key](#the-data-key)
- [The recovery key](#the-recovery-key)
- [Field-level encryption](#field-level-encryption)
- [Blind indexes](#blind-indexes)
- [Offline grace cache](#offline-grace-cache)
- [Cloud access control](#cloud-access-control)
- [Password changes and recovery](#password-changes-and-recovery)
- [Cryptographic inventory](#cryptographic-inventory)
- [Operational runbook](#operational-runbook)
- [Known limitations](#known-limitations)
- [Reporting a vulnerability](#reporting-a-vulnerability)

---

## Design goals

1. **No credential material on the client.** No password hash, no key file, no plaintext key
   anywhere on the machine.
2. **One data key per installation, generated exactly once**, with "once" enforced by the
   database rather than by client-side logic.
3. **The same ciphertext in both databases**, so a row can move local → cloud without a
   re-encryption step and without a second key.
4. **Encryption that cannot be applied twice**, so a backfill over a partially-migrated table
   is safe to re-run.
5. **Authorization decided server-side**, on data the user cannot edit.
6. **Usable without a connection**, without weakening any of the above.

## Threat model

**Defended against**

| Threat | How |
|---|---|
| Stolen laptop or stolen `company-admin.sqlite` | Employee `email`, `phone`, `pin_code` and `company_id` are AES-256-GCM ciphertext. The key is not on the disk in any form. |
| Stolen installer or extracted `anon` key | No policy grants `anon` anything. Every table returns `permission denied`. |
| A user editing their own JWT metadata to become an admin | Authorization reads `public.app_admins`, never `user_metadata`. |
| Read access to the cloud database (e.g. a leaked read-only credential) | `employees` rows are ciphertext there too, and `app_keyring` holds only wrapped blobs. |
| Offline brute force of the stored key material | Both wrapped blobs require Argon2id (19 MiB, 2 passes) per guess. There is no cheaper verifier to attack, because no hash is stored. |
| PIN discovery by response timing at the kiosk | The decrypted PIN is compared with `subtle::ConstantTimeEq`. |
| Extending offline access by staying offline or moving the clock | Expiry is absolute and set at sign-in; a backwards clock jump beyond one hour discards the cache. |
| A second device silently overwriting local data | Sync is one-way. Cloud rows are never pulled after the first-run seed. |

**Not defended against — by design or by limitation**

| Threat | Why not |
|---|---|
| A compromised machine while the app is unlocked | The data key is in process memory by necessity. Anything with debug rights on that process can read it. |
| An administrator exfiltrating data through the UI | The administrator is the trusted party. Encryption here is at-rest protection, not need-to-know separation — the UI decrypts on load and shows plaintext. |
| A malicious or compromised Supabase project owner | Whoever controls the project can drop policies. Cloud data stays confidential (it is ciphertext), but availability and integrity are theirs. |
| Loss of **both** the administrator password and the recovery key | Unrecoverable, deliberately. See [Operational runbook](#operational-runbook). |
| Keylogging or shoulder-surfing the administrator password | Out of scope for an application-level design. |
| Traffic analysis against the cloud project | Row counts, timestamps and table shapes are visible to anyone who can read the database. |
| Tampering with local SQLite while the app is closed | Rows are encrypted, not signed. A local attacker can delete or reorder rows; GCM detects modification of a *value* but nothing binds a value to its row. |

---

## Identity and authorization

Administrator credentials live in Supabase GoTrue. The application never hashes, stores or
compares a password itself — `bcrypt` was removed from `Cargo.toml` when this model landed.

Authorization is a table, not a claim:

```sql
create table public.app_admins (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  email     text,
  created_at timestamptz not null default now(),
  singleton boolean not null default true check (singleton)
);
create unique index app_admins_singleton_key on public.app_admins (singleton);
```

`singleton` is always `true` and uniquely indexed, so the table holds **at most one row,
ever**. Every policy consults it through one helper:

```sql
create or replace function private.is_admin()
returns boolean language sql security definer set search_path = '' stable
as $$
  select exists (
    select 1 from public.app_admins where user_id = (select auth.uid())
  );
$$;
```

Three details are deliberate:

- It lives in `private`, **not** `public`. Postgres grants `EXECUTE` to `PUBLIC` on every new
  function, so a `SECURITY DEFINER` function in `public` is an unauthenticated API endpoint.
  The migration additionally does `revoke execute … from public, anon` and grants it only to
  `authenticated`.
- `set search_path = ''` prevents a search-path hijack against a `SECURITY DEFINER` body.
- `(select auth.uid())` is wrapped in a subquery so Postgres evaluates it once per statement
  rather than once per row.

`user_metadata` / `raw_user_meta_data` is **never** consulted. It is user-editable through
GoTrue, so `role: 'admin'` there is a claim the holder writes about themselves. An earlier
version of this application set exactly that field; it was removed.

`private.is_admin()` is the *only* authorization predicate. There is no per-row ownership
model, because the application has a single administrator by construction.

---

## The data key

One 32-byte AES-256-GCM **data encryption key (DEK)** per installation. It exists in exactly
two places:

1. **In process memory** while the application is unlocked, as
   `AppState { dek: RwLock<Option<Zeroizing<[u8; 32]>>> }`. `Zeroizing` scrubs it when the
   last holder drops.
2. **In `public.app_keyring`, wrapped twice** — and nowhere else. Not in SQLite, not in a
   file, not in the Credential Manager in unwrapped form.

```sql
create table public.app_keyring (
  id boolean primary key default true check (id),   -- exactly one row, ever
  wrapped_by_password bytea not null,
  wrapped_by_recovery bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Wrapping

```
blob = salt(16) || nonce(12) || AES-256-GCM(KEK, nonce, DEK)   → 76 bytes
KEK  = Argon2id(passphrase, salt)                              → 32 bytes
```

Argon2id runs with the `argon2` crate defaults — **19 MiB, 2 passes, 1 lane**, the OWASP
recommendation. The salt is fresh on every wrap, so re-sealing the same key under the same
password yields a different blob and comparing two blobs reveals nothing.

The blob is self-describing: `crypto::unwrap` splits it by fixed lengths and rejects anything
that is not exactly 76 bytes as corrupt or foreign.

### There is no verifier

**No password hash and no key checksum is stored anywhere.** Possession of a secret is proven
by the GCM tag check succeeding during unwrap; a wrong passphrase surfaces as
`Incorrect password or recovery key.` This is stronger than storing a hash — an attacker who
exfiltrates `app_keyring` has no cheap oracle to attack, only Argon2id-per-guess followed by
an AEAD verification.

### Generated once, enforced by the database

Registration is the only path that creates the key, and it cannot be repeated:

| Step | Guarantee |
|---|---|
| `sign_up(email, password)` | GoTrue creates the account. No `role` metadata is set. |
| `claim_first_admin()` | Inserts `auth.uid()` into `app_admins` **only while the table is empty**. A second call fails: *"an administrator is already registered for this project"*. |
| `install_keyring(wrapped_password, wrapped_recovery)` | Requires `private.is_admin()`, then inserts the single keyring row. A second call fails: *"the encryption key has already been generated for this project"*. |

Both RPCs turn the underlying `unique_violation` into a plain-language error, so the client
never has to check first — the race is closed in the database.

`authenticated` holds `SELECT` on both tables and **no** `INSERT`, `UPDATE` or `DELETE`
(revoked explicitly in the migration). The RPCs are the only write path, and
`app_keyring` has no `UPDATE` or `DELETE` policy at all.

---

## The recovery key

The second wrapping is the escrow. It replaces the old "super-admin password", which was a
value the operator chose and the app stored as a local bcrypt hash.

- **Generated, never chosen** — 32 bytes from the OS CSPRNG.
- **Encoded in Crockford base32** — the alphabet omits `I`, `L`, `O` and `U`, so a key read
  off a screen cannot be mistranscribed into a *different valid* key.
- **Formatted as 13 groups of 4**, 64 characters total:
  `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`
- **Normalised on input** by `crypto::canonical_recovery_key`: non-alphanumerics dropped,
  upper-cased, and `I`/`L` folded to `1`, `O` to `0`. Hyphens, spaces and case therefore do
  not matter when typing it back in.
- **Shown exactly once**, at the end of registration, behind a required
  "I have saved this key" acknowledgement. Neither database stores it, and the application
  has no code path that can display it again.

Its only use is unwrapping `wrapped_by_recovery` to recover the DEK when the administrator
password is lost.

---

## Field-level encryption

### Wire format

```
enc:v1:<base64url-nopad( nonce(12) || ciphertext+tag(16) )>
```

Version-prefixed so a future scheme can coexist with existing rows rather than requiring a
flag-day migration. No additional authenticated data is used.

### Encrypted columns

| Table | Columns |
|---|---|
| `employees` | `email`, `phone`, `pin_code`, `company_id` |

Names, positions, salaries, hire dates, status, attendance and payroll figures are **not**
encrypted. Payroll and attendance are joined and aggregated by `employee_id`, and salary is
summed in SQL; encrypting those would move real work into the client for no gain, since the
identifying columns are already protected.

### Idempotence

```rust
pub fn encrypt_field(dek: &Dek, value: &str) -> Result<String> {
    if value.starts_with(FIELD_PREFIX) || value.is_empty() {
        return Ok(value.to_string());   // already encrypted, or nothing to encrypt
    }
    …
}
```

`decrypt_field` mirrors it — a value *without* the prefix is returned untouched. Both are
therefore **total functions**, which gives three properties for free:

1. Encrypting twice is impossible. The guard is a string-prefix test, not a trial decryption,
   so it cannot be defeated by ciphertext that happens to look like plaintext.
2. Rows written by an older, plaintext build still read correctly.
3. `db::migrations::backfill_employee_encryption` is idempotent **by construction** rather
   than by bookkeeping. Running it twice changes zero rows on the second pass; it needs no
   "already done" flag, and a crash halfway through leaves a valid, mixed table that the next
   run finishes.

### Where the boundary sits

Encryption is confined to `src-tauri/src/db/employees.rs`. Reads decrypt after the query;
writes encrypt before binding. Consequences worth knowing:

- **The push path needs no encryption code.** It reads the local row, which is already
  ciphertext, so Supabase receives ciphertext without a separate step. The first-run seed
  copies ciphertext straight back, because both sides share the one key.
- **The frontend never sees ciphertext.** Search, tables, payslips and all CSV exports
  operate on decrypted rows, so none of them needed changing.
- **`verify_pin` cannot match in SQL.** `WHERE pin_code = ?` cannot work against a random
  nonce, so the kiosk lookup is by `id` or `company_id_bidx`, followed by a constant-time
  comparison of the decrypted PIN.

---

## Blind indexes

`employees.email` is `NOT NULL UNIQUE` and `company_id` is `UNIQUE`. AES-GCM uses a random
nonce, so the same address encrypts differently every time and a `UNIQUE` constraint on the
ciphertext column silently stops enforcing anything — it would accept the same address twice.

The real constraint moves to a deterministic keyed digest:

```
email_bidx      = hex( HMAC-SHA256( index_key, lower(trim(email)) ) )
company_id_bidx = hex( HMAC-SHA256( index_key, lower(trim(company_id)) ) )
index_key       = HKDF-SHA256( DEK, info = "admin-pro/blind-index/v1" )
```

- **The index key is derived, not stored.** It is a pure function of the DEK, so it needs no
  custody of its own and rotating the DEK rotates it.
- **Keyed, not plain hashing.** A bare `SHA-256` of an email address is trivially reversible
  by dictionary attack; an HMAC under a key the attacker does not have is not.
- **`lower(trim(…))`** preserves the case-insensitive uniqueness that a plaintext email column
  implied.
- **Empty values index to `NULL`**, so blanks stay outside the unique index instead of
  colliding with each other.
- **What it leaks:** equality, and only equality. Two rows with the same digest have the same
  plaintext. Nothing about the value itself is recoverable from the digest.

The inline `UNIQUE` on the ciphertext columns is left in place rather than dropped — removing
an inline constraint in SQLite means rebuilding the table, and a constraint that can no longer
collide is harmless.

---

## Offline grace cache

Cloud-only credentials would, on their own, mean the application cannot open without a
connection. A successful **online** sign-in therefore leaves a cache in the **Windows
Credential Manager** under `AdminPro/session`:

```rust
struct CachedSession {
    email: String,
    wrapped_by_password: String,   // base64, byte-identical to app_keyring
    wrapped_by_recovery: String,
    expires_at: i64,               // absolute, set at sign-in
    last_seen: i64,                // monotonic, anti-rollback
}
```

Four properties make this safe:

1. **It holds no unwrapped key.** The cache stores the *same wrapped blobs* the cloud holds,
   so an offline sign-in performs the identical Argon2id unwrap with the password it is
   given. Reading the credential off the machine buys an attacker an Argon2id attack, not the
   key — and not access, since the password is still required.
2. **Expiry is absolute**, set at sign-in and never extended by a read, so the grace window
   cannot be stretched by simply staying offline. `GRACE_DAYS = 7`.
3. **`last_seen` only moves forward.** A backwards clock jump beyond a one-hour drift
   tolerance is treated as tampering and the credential is **deleted**, not merely rejected.
   The same happens once `now >= expires_at`.
4. **Both blobs are cached**, so recovery by recovery key also works offline.

And one property it does **not** have: the cache is a *snapshot*, taken at the last online
sign-in. Changing the administrator password re-seals the cloud blob, but it cannot reach a
machine that never comes back online — the old password keeps opening that machine's cached
copy until `expires_at`. The grace window is therefore also the revocation lag, which is the
main reason it is seven days rather than thirty. Signing out does not clear the cache either;
if it did, the next launch would demand a connection and there would be no offline access at
all. `reset_registration` clears it, as does any entry the loader cannot parse.

The credential is scoped to the Windows user account. Deleting it costs nothing but a
required online sign-in on the next start.

The sign-in screen surfaces the state rather than failing opaquely: it shows
*"offline — cached access expires in N days"* while the grace holds, and a distinct terminal
message once it lapses. `days_remaining()` rounds **up** to whole days and floors at zero, so
"1 day" means "some time left today".

---

## Cloud access control

RLS is enabled on all seven tables in `public`: `departments`, `employees`, `attendance`,
`payroll`, `registration_credentials`, `app_admins`, `app_keyring`.

### One policy per action, never `FOR ALL`

```sql
create policy employees_admin_select on public.employees
  for select to authenticated using ((select private.is_admin()));
create policy employees_admin_insert on public.employees
  for insert to authenticated with check ((select private.is_admin()));
create policy employees_admin_update on public.employees
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy employees_admin_delete on public.employees
  for delete to authenticated using ((select private.is_admin()));
```

Each part of that shape is load-bearing:

- **`TO authenticated`**, not `auth.role() = 'authenticated'`. The latter is deprecated by
  Supabase and, worse, passes for anonymous sign-ins — an anonymous user carries the
  `authenticated` Postgres role.
- **`TO authenticated` alone would be authentication without authorization** (a BOLA/IDOR
  shape). The `private.is_admin()` predicate is what actually authorizes.
- **`UPDATE` carries both `USING` and `WITH CHECK`.** Without `WITH CHECK`, a row can be
  rewritten into a state the policy would not have admitted.
- **A `SELECT` policy is required for `UPDATE` to work at all.** Postgres must read the row
  first; without one, an update reports zero rows changed and no error.

`app_admins` is the exception: `app_admins_self_select` is by ownership
(`user_id = (select auth.uid())`), so the signed-in administrator can confirm their own row
and nothing else. `app_keyring` has a `SELECT` policy only — no `INSERT`, `UPDATE` or
`DELETE` policy exists, so the RPCs are its sole write path.

### Explicit grants

RLS filters rows; grants decide whether the table is reachable at all. Supabase no longer
auto-exposes new `public` tables to the Data API — new projects since 2026-05-30, and all
projects from 2026-10-30 — so the migration grants explicitly:

```sql
grant select, insert, update, delete on public.employees to authenticated;   -- and the 4 data tables
grant select                        on public.app_admins to authenticated;   -- read-only
grant select                        on public.app_keyring to authenticated;  -- read-only
revoke all on <every table> from anon;
```

`TRUNCATE`, `REFERENCES` and `TRIGGER` are revoked from `authenticated` on every table.

### The anon key authorizes nothing

Verified against the live project: `GET /rest/v1/employees` with the `anon` key returns

```
401  {"code":"42501","message":"permission denied for table employees"}
```

A **permission error**, not an RLS-filtered empty array — the same for `app_keyring`,
`app_admins`, `registration_credentials` and `departments`. The one function `anon` may call
is `check_admin_exists_v2()`, which returns a bare boolean and exists so the application can
decide between the registration and sign-in screens before anyone has signed in.

### One legacy function is removed

The migration drops `public.setup_schema()`, shipped by earlier versions of this project. It
was `SECURITY DEFINER`, lived in `public`, had `EXECUTE` granted to `anon`, and ran DDL as
`postgres` — an unauthenticated caller could reshape the schema. If you set up a project from
the old `src/database/setup_schema_rpc.sql`, **applying this migration is the fix**, and those
files have been deleted from the repository.

### No `updated_at` triggers

Unlike the earlier schema, there are deliberately no `BEFORE UPDATE` triggers maintaining
`updated_at`. Local is authoritative and pushes its own `updated_at`; a trigger would clobber
it and break the sync receipt check described in
[`ARCHITECTURE.md`](ARCHITECTURE.md#one-way-sync).

---

## Password changes and recovery

### Changing the password

The DEK never changes and is never exposed:

1. GoTrue updates the password on the account.
2. The in-memory DEK is re-sealed under the new password — `wrap(dek, new_password)`.
3. `rewrap_password(new_blob)` replaces `wrapped_by_password` only.

`wrapped_by_recovery` is untouched, so **the recovery key keeps working after a password
change** — verified directly against the live project. Step 3 failing while step 1 succeeded
would leave an account whose password no longer unwraps the key, so the UI surfaces that
failure rather than reporting a bare "password changed".

### Recovering from a lost password

1. Enter the recovery key. `crypto::canonical_recovery_key` normalises it, then
   `unwrap(wrapped_by_recovery, key)` recovers the DEK — success *is* the proof of possession.
2. Set a new password through GoTrue.
3. `rewrap_password(wrap(dek, new_password))` re-seals the recovered key.

Nothing local is consulted at any step, and no super-admin hash column exists to check
against.

### Rotating the recovery key

Not implemented. `install_keyring` is single-shot and there is no `rewrap_recovery` RPC, so
issuing a new recovery key means re-provisioning the project. This is a known gap — see
[Known limitations](#known-limitations).

---

## Cryptographic inventory

| Purpose | Primitive | Parameters | Crate |
|---|---|---|---|
| Field & key encryption | AES-256-GCM | 12-byte random nonce, 16-byte tag, no AAD | `aes-gcm 0.10` |
| Password → KEK | Argon2id | 19 MiB, t=2, p=1, 16-byte random salt, 32-byte output | `argon2 0.6` |
| Blind-index key | HKDF-SHA256 | no salt, `info = "admin-pro/blind-index/v1"` | `hkdf 0.12` |
| Blind index | HMAC-SHA256 | over `lower(trim(value))`, hex-encoded | `hmac 0.12`, `sha2 0.10` |
| Randomness | OS CSPRNG | `rand::thread_rng()` | `rand 0.8` |
| PIN comparison | constant-time equality | — | `subtle 2` |
| Memory hygiene | zero on drop | `Zeroizing<[u8; 32]>` | `zeroize 1` |
| Credential cache | Windows Credential Manager | `AdminPro/session`, per-Windows-user | `keyring 4.2` |
| Transport | TLS 1.2+ | `rustls`, no OpenSSL, no default features | `reqwest 0.12` |
| Recovery-key encoding | Crockford base32 | 32 bytes → 52 symbols → 13 groups of 4 | — |

Two base64 alphabets are in use and must not be conflated: **URL-safe, unpadded** for
`enc:v1:` payloads, and **standard** for the keyring RPC arguments and the cached blobs,
because Postgres `decode(…, 'base64')` expects the standard alphabet. The
`install_keyring` / `rewrap_password` RPCs take `text` rather than `bytea` precisely so the
write never depends on PostgREST's `bytea` input parsing.

Unit tests for wrap/unwrap round-tripping, idempotent field encryption, blind-index
determinism and recovery-key canonicalisation live in `src-tauri/src/crypto/mod.rs`
(`cargo test`).

---

## Operational runbook

| Situation | What to do |
|---|---|
| **Administrator password forgotten** | Use the recovery key on the sign-in screen's recovery path. Set a new password; the key is re-sealed automatically. |
| **Recovery key lost, password known** | Data is safe, but escrow is gone. There is no rotation path — plan a re-provision if escrow matters to you. |
| **Both lost** | The encrypted columns are unrecoverable. Everything else (names, salaries, attendance, payroll) stays readable in SQLite, so a re-provision keeps most of the data. This is the intended consequence of holding no verifier and no plaintext key. |
| **Laptop lost or stolen** | Change the administrator password from another device and revoke sessions in the Supabase dashboard. **This does not immediately disarm the stolen machine.** Its Credential Manager entry holds the wrapped blobs as they were at its last online sign-in, so the *old* password still unlocks it offline until `expires_at` — at most seven days later. While it is online the old password is refused outright, because GoTrue decides first and a rejection never falls through to the cache. Taken offline, though, the snapshot still opens. Treat the remainder of that grace window as the exposure window; disk encryption and the Windows account password are what actually protect the local database in the meantime. |
| **Suspected cloud compromise** | Rotate the administrator password (invalidates the wrapped blob an attacker may have copied), rotate the `anon` key, and review `app_admins` for unexpected rows — there should be exactly one. |
| **Moving to a new machine** | Install, sign in online once. The empty SQLite file triggers a one-time seed from the cloud; ciphertext copies across unchanged because both sides share the key. |
| **Handover to a new administrator** | Change the password (re-seals the key) and update `app_admins.email` if you want it to match. There is no multi-admin model. |
| **Checking the deployed schema is intact** | Run the Supabase advisors. Expect no `rls_disabled_in_public` and no `function_search_path_mutable`. |

### Expected advisor findings

A clean deployment still reports warnings. These are accounted for, not oversights:

| Advisor | Count | Why it is expected |
|---|---|---|
| `pg_graphql_authenticated_table_exposed` | 7 | A direct consequence of the mandatory `grant … to authenticated`. The tables *are* reachable by an authenticated admin — that is the design; RLS is what restricts them. |
| `anon_security_definer_function_executable` | 1 | `check_admin_exists_v2()` must be callable before any sign-in. It returns one boolean and touches no data. |
| `authenticated_security_definer_function_executable` | 4 | `private.is_admin()` plus the three RPCs. Each carries its own internal guard, and `SECURITY DEFINER` is what lets them bypass RLS on the tables they are the sole write path for. |
| `unused_index` (INFO) | 6 | Expected on a project with no traffic yet; the indexes serve local-style query patterns as data arrives. |

---

## Known limitations

1. **No recovery-key rotation.** `install_keyring` is single-shot. Issuing a new recovery key
   requires re-provisioning the cloud project.
2. **No DEK rotation.** Rotating the data key would mean decrypting and re-encrypting every
   employee row and recomputing both blind indexes — implementable, not implemented.
3. **Single administrator by construction.** `app_admins.singleton` allows exactly one row.
   Multiple administrators would need a per-user policy model and a way to wrap the DEK for
   each of them.
4. **The administrator sees plaintext.** Encryption here protects data at rest against someone
   who obtains a database file, not against the operator. There is no need-to-know tier.
5. **Rows are encrypted, not signed.** GCM authenticates each value against modification, but
   nothing binds a value to its row or table, so local row deletion or reordering is not
   detected.
6. **`anon` sign-up is still enabled** on the project (`disable_signup: false`). Nothing an
   anonymous account can do is authorized, but disabling sign-ups after the first
   administrator exists removes the ability to create unused accounts at all.
7. **`VITE_*` values are inlined into the installer.** Unavoidable for a client-side
   configuration, and harmless for the `anon` key under these policies. Never put a
   `service_role` key in `.env`.
8. **Field encryption is not searchable server-side.** Employee search filters rows already
   loaded and decrypted in the client. That is fine at this scale and would need a different
   design at a much larger one.

---

## Reporting a vulnerability

Please report security issues privately rather than in a public issue: open a
[GitHub security advisory](https://github.com/carlodandan/admin-pro/security/advisories/new)
on the repository. Include the version, the affected component, and a reproduction if you
have one.
