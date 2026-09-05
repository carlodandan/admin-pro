# Building and releasing in CI

> What [`.github/workflows/build.yml`](../.github/workflows/build.yml) does, the two secrets it
> needs, and why each step is there.

The workflow builds the Windows installer on a GitHub-hosted Windows runner and attaches it to
a GitHub release. It is **manual only** — `workflow_dispatch`, no `push` or `pull_request`
trigger — because the build inlines your Supabase project URL and anon key into the installer.
That should be a deliberate act tied to a specific commit, not something that fires on every
commit to `main`.

---

## Contents

1. [What the workflow produces](#1-what-the-workflow-produces)
2. [Repository secrets](#2-repository-secrets)
3. [Running the workflow](#3-running-the-workflow)
4. [What each step is for](#4-what-each-step-is-for)
5. [What is deliberately absent](#5-what-is-deliberately-absent)
6. [Keeping the pins aligned](#6-keeping-the-pins-aligned)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. What the workflow produces

| Output | Path / location | Retention |
|---|---|---|
| NSIS installer | `src-tauri/target/release/bundle/nsis/Admin Pro_<version>_x64-setup.exe` | — |
| Build artifact | Actions run → *Artifacts* → `admin-pro-<version>-<commit>-nsis` | 14 days |
| GitHub release | Tag `ap-<short-commit>`, titled `Admin Pro <version> — Windows x64 (<date>)` | Permanent until deleted |

The artifact is uploaded even on a release run. A release can be deleted or replaced; the
artifact is what you debug a failed install against.

The version comes from `src-tauri/tauri.conf.json`, not `package.json` — that file is what
names the installer, so reading anything else would let the release title drift from the file
attached to it.

---

## 2. Repository secrets

Two secrets are required. Both are the same values you put in `.env` locally.

| Secret | Example | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | The project the build signs in against |
| `VITE_SUPABASE_ANON_KEY` | `eyJ…` or `sb_publishable_…` | The publishable API key |

### Adding them

1. Repository → **Settings**.
2. Sidebar → **Secrets and variables** → **Actions**.
3. **New repository secret**, once per value. Names must match exactly — GitHub does not warn
   about a typo, the value simply arrives empty.

### They are inlined, and that is accounted for

Vite substitutes `import.meta.env.VITE_*` at build time and the Rust core compiles the same two
values in as constants, so both are recoverable from the distributed installer by anyone who
cares to look. Baking a secret into a distributable never hides it — the app can always be
unpacked.

What makes this acceptable here is that the anon key is not a secret in this project's model:
no table grants anything to `anon`, so the key on its own returns `permission denied`, not a
filtered result set. The full reasoning is in
[`SECURITY.md § The anon key authorizes nothing`](SECURITY.md#the-anon-key-authorizes-nothing).

> [!CAUTION]
> Never add a `service_role` or secret key as a repository secret for this workflow. It
> bypasses RLS entirely, and unlike the anon key it *would* be a real credential compiled into
> every installer you ship.

The workflow validates both secrets in a dedicated early step rather than letting an empty
value through. An empty `VITE_SUPABASE_*` produces an installer that builds perfectly and then
cannot reach Supabase at all — a failure that surfaces at a user's first launch instead of in
CI. The check fails in seconds, and it tests the values without printing them.

---

## 3. Running the workflow

**Actions** → **Build Admin Pro** → **Run workflow**. Pick the branch or tag to build.

| Input | Default | Effect |
|---|---|---|
| `run_checks` | `true` | Run ESLint, Clippy (`-D warnings`) and `cargo test` before building. |
| `draft` | `false` | Create the release as a draft instead of publishing it. |

Turn `run_checks` off only to iterate on a packaging problem you have already isolated —
never for a build you intend to release. Use `draft` when you want to review the release notes
and the attached installer before anyone can download them.

The job needs `permissions: contents: write` to create the release; that is declared in the
workflow and uses the automatic `GITHUB_TOKEN`. No personal access token is involved.

---

## 4. What each step is for

The job runs on `windows-2025`. Windows is not a preference: the bundle target is NSIS and the
offline credential cache uses the Windows Credential Manager, so a Linux runner cannot produce
a usable build of this application.

| # | Step | Why it is there |
|---|---|---|
| 1 | `actions/checkout@v4` | — |
| 2 | **Check required secrets** | Fails in seconds if either `VITE_SUPABASE_*` is empty, instead of after a full Rust build. Uses `::error::` annotations and never echoes the values. |
| 3 | `pnpm/action-setup@v4` | Installs pnpm at the pinned version. Must come *before* `setup-node`, or `cache: pnpm` has no package manager to find. |
| 4 | `actions/setup-node@v4` | Node at the pinned version, with the pnpm store cached. |
| 5 | `dtolnay/rust-toolchain@stable` | **Required.** This is a Tauri application: the backend is Rust and there is no prebuilt native module to download. Without a toolchain the build dies at the first `cargo` invocation. `components: clippy` is requested here so the Clippy step needs no second install. |
| 6 | `Swatinem/rust-cache@v2` | A cold build of the dependency tree — including bundled SQLite and `aws-lc`/`ring` for rustls — takes several minutes. Keyed on `Cargo.lock`, scoped with `workspaces: src-tauri -> target` because the crate is not at the repository root. |
| 7 | `pnpm install --frozen-lockfile` | Fails if `pnpm-lock.yaml` disagrees with `package.json`, rather than silently resolving something different from what was tested. |
| 8 | `pnpm run lint` | ESLint over `src/renderer`. Gated on `run_checks`. |
| 9 | `cargo clippy --all-targets -- -D warnings` | Clippy is clean on this tree, so warnings are errors to keep it that way. `--all-targets` covers the test targets too. Gated on `run_checks`. |
| 10 | `cargo test` | The crypto module: wrap/unwrap round-trips, idempotent field encryption, blind-index determinism, recovery-key canonicalisation. Gated on `run_checks`. |
| 11 | `pnpm run make` | `tauri build`. This runs `pnpm run build` (Vite → `dist/`) itself via `beforeBuildCommand`, then compiles the release binary and produces the NSIS installer. The two `VITE_*` secrets are supplied here — this is the only step that needs them. |
| 12 | **Collect release metadata** | Reads the version, date, commit and dependency versions into `$GITHUB_ENV` for the release body. |
| 13 | `actions/upload-artifact@v4` | The installer, with `if-no-files-found: error` so a silent packaging failure cannot pass as success. |
| 14 | `softprops/action-gh-release@v2` | Creates tag `ap-<short-commit>` and attaches the installer. `fail_on_unmatched_files: true` for the same reason. |

### Why the metadata step reads two different files

Frontend versions come from `package.json` — they are requirements (`^19.2.3`) and that is
honest for a release note. Rust versions come from `src-tauri/Cargo.lock` via a small
`crate_version()` helper, because `Cargo.toml` only says `"2"` for Tauri and `"0.32"` for
rusqlite; the lockfile records what was actually compiled. `rustc --version` reports the
toolchain the runner resolved, and `MSRV` is read from `rust-version` in `Cargo.toml` so the
release states the floor as well as the version used.

> [!NOTE]
> If you are looking at this file from an older checkout: the previous version of this workflow
> read `.devDependencies.electron`, `.dependencies.better-sqlite3` and `.Dependencies.react`
> (capital *D* — a `jq` path that never matched anything), and uploaded from
> `out/make/squirrel.windows/x64/*`. All four are gone. None of those paths exist in a Tauri
> build, and the release body referenced a `BETTER_SQLITE3_VER` variable that was never set.

---

## 5. What is deliberately absent

**No code-signing or updater secrets.** `src-tauri/tauri.conf.json` configures no updater and
carries no `pubkey`, so `tauri build` never asks for a signing key. The `signkey/` directory
holds an unused local key pair (`*.sample` templates are committed; the real keys are in
`.gitignore`). If you later enable the Tauri updater, that is when `TAURI_SIGNING_PRIVATE_KEY`
and its password become required secrets — and shipping an update feed is a larger decision
than adding two secrets.

**No macOS or Linux job.** Both would need a different bundle target and a keychain backend for
the offline cache. See the [Tauri distribution guide](https://v2.tauri.app/distribute/).

**No `push` trigger.** See the note at the top of this document.

**No `pull_request` trigger.** Secrets are not passed to workflows triggered from a fork, so a
PR build would fail the secrets check by design rather than by accident. Run `pnpm lint` and
`cargo clippy --all-targets` locally instead — they are the same two gates the workflow runs.

---

## 6. Keeping the pins aligned

The workflow pins the Node and pnpm versions in the job's `env` block:

```yaml
env:
  NODE_VERSION: "24.16.0"
  PNPM_VERSION: "11.21.0"
```

These track the local development environment. When you upgrade locally, update them here in
the same commit — `node --version` and `pnpm --version` are the source. The Rust toolchain is
intentionally *not* pinned (`@stable`): `rust-version = "1.88"` in `Cargo.toml` is the real
floor, and a newer stable compiler is expected to work.

---

## 7. Troubleshooting

### `VITE_SUPABASE_URL is not set`

The secrets check did its job. Add the secret under **Settings → Secrets and variables →
Actions**, then re-run. Names are case-sensitive and must match exactly. If you *updated* a
secret, re-run the workflow — an in-flight run keeps the values it started with.

### `error: linker link.exe not found` or an MSVC error

The runner image changed and no longer carries the C++ build tools. `windows-2025` includes
them today; if that changes, add `ilammy/msvc-dev-cmd@v1` before the Rust step.

### `cargo` is not recognised

The Rust toolchain step was removed or failed. It is not optional — see step 5 above.

### The build takes 15+ minutes

The Rust cache missed. It is keyed on `Cargo.lock`, so any dependency change pays for a full
rebuild once. Repeated cold builds with an unchanged lockfile mean the cache is being evicted
(GitHub's 10 GB per-repository limit) — check **Actions → Caches**.

### `if-no-files-found: error` fired, but the build reported success

`tauri build` succeeded but produced no NSIS installer. Check the build log for the bundling
phase specifically; `tauri.conf.json` must have `bundle.active: true` and `nsis` in
`bundle.targets`. A missing icon listed in `bundle.icon` fails bundling while the binary itself
compiles cleanly.

### `Resource not accessible by integration` on the release step

`permissions: contents: write` is missing from the job, or the repository restricts
`GITHUB_TOKEN` to read-only under **Settings → Actions → General → Workflow permissions**.

### The release exists but the tag is wrong

`tag_name` is `ap-<short-commit>` of the commit that was built. Re-running the workflow on the
same commit will try to reuse that tag. Delete the old release and tag first, or build a new
commit.

### The installer builds, but the app cannot reach Supabase

The `VITE_*` values were empty or wrong at build time. There is no runtime configuration file to
correct afterwards — rebuild. Confirm the project schema is applied too; see
[`SUPABASE_SETUP.md § 10`](SUPABASE_SETUP.md#10-troubleshooting).

---

## Secret-handling checklist

| ✅ Do | ❌ Don't |
|---|---|
| Keep `.env` out of the repository (it is already in `.gitignore`). | Commit `.env`, or paste real values into this file. |
| Test for presence, as the workflow's secrets step does. | `echo` a secret to the log — GitHub masks known values, but only exactly-matching ones. |
| Rotate the anon key if you rotate the project's keys, and rebuild. | Add a `service_role` key as a repository secret. |
| Treat everything in the installer as public. | Assume compiling a value in hides it. |

---

## Further reading

- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [Tauri: distributing your app](https://v2.tauri.app/distribute/)
- [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) — the schema the installer expects to already exist
- [`SECURITY.md`](SECURITY.md) — why an extractable anon key is not a finding here
