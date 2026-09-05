# Building and releasing in CI

> What [`.github/workflows/build.yml`](../.github/workflows/build.yml) does, the two secrets it
> needs, and what it deliberately leaves out.

The workflow builds the Windows installer on a GitHub-hosted Windows runner and attaches it to a
GitHub release. It is **manual only** — `workflow_dispatch`, no `push` or `pull_request` trigger
— because the build inlines your Supabase project URL and anon key into the installer. That
should be a deliberate act tied to a specific commit, not something that fires on every commit
to `main`.

It is also deliberately small: five steps, four of which are off-the-shelf actions.
[`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) does the build, creates
the release and uploads the installer, so there is no hand-written packaging, metadata or upload
logic to keep in sync with the project.

---

## Contents

1. [What the workflow produces](#1-what-the-workflow-produces)
2. [Repository secrets](#2-repository-secrets)
3. [Running the workflow](#3-running-the-workflow)
4. [The five steps](#4-the-five-steps)
5. [What is deliberately absent](#5-what-is-deliberately-absent)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. What the workflow produces

| Output | Path / location | Retention |
|---|---|---|
| NSIS installer | `src-tauri/target/release/bundle/nsis/Admin Pro_<version>_x64-setup.exe` | — |
| Workflow artifact | Actions run → *Artifacts* | 90 days (repository default) |
| GitHub release | Tag `v<version>`, titled `Admin Pro v<version>` | Permanent until deleted |

The artifact is uploaded alongside the release (`uploadWorkflowArtifacts: true`). A release can
be deleted or replaced; the artifact is what you debug a failed install against.

**The version comes from `src-tauri/tauri.conf.json`.** `tauri-action` reads it there and
substitutes it for `__VERSION__` in the tag, the release name and the release body — so the
title can never drift from the file attached to it. It is currently `1.0.0`, giving tag `v1.0.0`.

> [!IMPORTANT]
> Because the tag is derived from the version rather than the commit, **rerunning the workflow
> without bumping `version` updates the existing release in place** — same tag, new installer,
> and the name and body are refreshed. Bump the version in `src-tauri/tauri.conf.json` when you
> want a distinct release.

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

> [!WARNING]
> An empty `VITE_SUPABASE_*` produces an installer that builds perfectly and then cannot reach
> Supabase at all, and there is no runtime configuration file to correct afterwards. Nothing in
> the workflow checks for this, so confirm both secrets exist before you run it — the failure
> otherwise surfaces at a user's first launch rather than in CI.

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
> Never add a `service_role` or secret key as a repository secret for this workflow. It bypasses
> RLS entirely, and unlike the anon key it *would* be a real credential compiled into every
> installer you ship.

---

## 3. Running the workflow

**Actions** → **Build Admin Pro** → **Run workflow**. Pick the branch or tag to build. There are
no inputs.

The job declares `permissions: contents: write` so `tauri-action` can create the release, and
uses the automatic `GITHUB_TOKEN`. No personal access token is involved.

To publish as a draft instead, set `releaseDraft: true` in the workflow. Note that `tauri-action`
v1 **fails** if `releaseDraft: true` is set and the release it finds for that tag is not a draft
— the flag has to match.

---

## 4. The five steps

| # | Step | Action | What it does |
|---|---|---|---|
| 1 | Checkout code | `actions/checkout@v7` | Clones the commit you selected. |
| 2 | Setup pnpm and Node | `pnpm/setup@v2` | Installs pnpm 11 and Node 24, caches the pnpm store, **and runs `pnpm install --frozen-lockfile`**. |
| 3 | Setup Rust | `dtolnay/rust-toolchain@stable` | Installs a stable Rust toolchain. This is a Tauri application — the backend is Rust and there is no prebuilt native module to download. |
| 4 | Cache Rust build | `Swatinem/rust-cache@v2` | Caches `src-tauri/target`. A cold build of the dependency tree takes several minutes. |
| 5 | Build and publish | `tauri-apps/tauri-action@v1` | Everything else: frontend build, release binary, NSIS installer, release creation, asset upload. |

### Why there is no separate install step

`pnpm/setup@v2` runs the install itself — its `install` input defaults to `true`, and without an
explicit `require-lockfile` it installs with `--frozen-lockfile`. `version: 11` and
`runtime: node@24` track the local environment; update them here when you upgrade locally. Note
that v2 of that action requires pnpm 11 or newer.

The Rust toolchain is intentionally *not* pinned (`@stable`). `rust-version = "1.88"` in
`src-tauri/Cargo.toml` is the real floor, and a newer stable compiler is expected to work.

### What step 5 does internally

`tauri build` runs `beforeBuildCommand` from `src-tauri/tauri.conf.json`, which is
`pnpm run build` — Vite compiles the React frontend to `dist/`. Cargo then compiles the release
binary and the NSIS bundler wraps both into the per-user installer. `tauri-action` finds the
resulting bundle, creates or updates the release for `v<version>`, and uploads it.

---

## 5. What is deliberately absent

**No lint, clippy or test gate.** The workflow builds and publishes; it does not verify. Run the
gates locally before triggering it:

```bash
pnpm lint
cd src-tauri && cargo clippy --all-targets && cargo test
```

That is a real trade-off — a red tree can be released. It is the price of a five-step workflow,
and it is reversible: adding those three steps back is mechanical.

**No code-signing or updater secrets.** `src-tauri/tauri.conf.json` configures no updater and
carries no `pubkey`, so `tauri build` never asks for a signing key, and `uploadUpdaterJson` is
set to `false` — left at its default `true`, the release would receive a `latest.json` listing no
platforms. The `signkey/` directory holds an unused local key pair (`*.sample` templates are
committed; the real keys are in `.gitignore`). If you enable the Tauri updater, that is when
`uploadUpdaterJson: true`, `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
all become necessary together.

**No icon generation step.** `src-tauri/icons/` is committed and complete, including `icon.ico`
and `icon.icns`. `pnpm tauri icon <source.png>` is a one-off you run locally when the logo
changes, not something a release build should redo.

**No macOS or Linux job.** Both would need a different bundle target and a keychain backend for
the offline cache. See the [Tauri distribution guide](https://v2.tauri.app/distribute/).

**No `push` trigger.** See the note at the top of this document.

**No `pull_request` trigger.** Secrets are not passed to workflows triggered from a fork, so a PR
build would silently produce an installer that cannot reach Supabase.

---

## 6. Troubleshooting

### The release was updated instead of created

Expected when the version has not changed — see the note in
[section 1](#1-what-the-workflow-produces). Bump `version` in `src-tauri/tauri.conf.json`.

### `Resource not accessible by integration` on the release step

`permissions: contents: write` is missing from the job, or the repository is configured with
read-only workflow permissions (**Settings → Actions → General → Workflow permissions**).

### The build fails with a draft mismatch

`releaseDraft: true` is set but the release for that tag already exists and is published.
`tauri-action` v1 fails rather than converting it. Delete the release, or align the flag.

### `pnpm/setup` fails on the pnpm version

v2 of that action fetches a native per-platform pnpm binary and requires **pnpm 11 or newer**.
Anything older needs `pnpm/action-setup` instead.

### The build takes 15+ minutes

The Rust cache missed. `Cargo.lock` changed, the cache expired, or the `Swatinem/rust-cache@v2`
step was removed. A cold dependency-tree build is genuinely that slow; later runs are not.

### `error: linker link.exe not found` or an MSVC error

The MSVC toolchain is preinstalled on the `windows-2025` image. If you changed `runs-on`, that is
the cause.

### The installer builds, but the app cannot reach Supabase

The `VITE_*` secrets were empty at build time. Confirm both exist under **Settings → Secrets and
variables → Actions**, then rerun — the values are compiled in, so there is nothing to fix
post-install. See [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

### `latest.json` appeared on the release

`uploadUpdaterJson` was set back to `true` without an updater configured. With no signed updater
bundles the generated file lists no platforms and is meaningless.

---

## Secret-handling checklist

| ✅ Do | ❌ Don't |
|---|---|
| Keep `.env` out of the repository (it is already in `.gitignore`). | Commit `.env`, or paste real values into this file. |
| Confirm both secrets exist before triggering a release build. | `echo` a secret to the log — GitHub masks known values, but only exactly-matching ones. |
| Rotate the anon key if you rotate the project's keys, and rebuild. | Add a `service_role` key as a repository secret. |
| Treat everything in the installer as public. | Assume compiling a value in hides it. |

---

## Further reading

- [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) — every input the build step accepts
- [`pnpm/setup`](https://github.com/pnpm/setup) — pnpm and a JavaScript runtime in one step
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [Tauri: distributing your app](https://v2.tauri.app/distribute/)
- [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) — the schema the installer expects to already exist
- [`SECURITY.md`](SECURITY.md) — why an extractable anon key is not a finding here
