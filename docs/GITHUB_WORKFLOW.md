# GitHub Actions: Using Repository Secrets

> Securely managing sensitive information in your CI/CD pipeline.

---

## Overview

When building with GitHub Actions, you often need access to sensitive data (API keys, database URLs, etc.) that should **never** be committed to the repository (e.g., inside `.env` files). GitHub provides **Repository Secrets** to inject these values into your workflows securely. But of course, its still better to build backend for handling sensitive data. Baking secrets into the the app still not recommended as someone can still crack the app and get the secrets.

This guide explains how to add secrets and use them in your workflow files.

---

## 1. Adding Secrets to the Repository

1.  Navigate to the main page of the repository on GitHub.
2.  Click on **Settings** (usually the rightmost tab).
3.  In the left sidebar, scroll down to the **Security** section.
4.  Click on **Secrets and variables** -> **Actions**.
5.  Click on the green **New repository secret** button.
6.  **Name**: Enter the variable name (e.g., `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
    *   *Tip: Use uppercase with underscores for consistency with environment variables.*
7.  **Secret**: Paste the value of the secret (the content you would put in your `.env` file).
8.  Click **Add secret**.

Repeat these steps for all necessary environment variables.

---

## 2. Using Secrets in Workflow Files

Once added, you can access these secrets in your `.github/workflows/*.yml` files using the `${{ secrets.SECRET_NAME }}` syntax.

You map these secrets to environment variables that your scripts/commands can access.

### Example Workflow (`.github/workflows/build.yml`)

```yaml
name: Build Admin Pro

on:
  workflow_dispatch:

jobs:
  build-windows:
    runs-on: windows-2025
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    permissions:
      contents: write

    steps:
      # 1. Check out the repository code
      - name: Checkout Code
        uses: actions/checkout@v4

      # 2. Setup PNPM environment
      - uses: pnpm/action-setup@v4
        with:
          # Keep aligned with local environment
          version: 10.28.2

      # 3. Setup Node.js environment
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          # Keep aligned with local environment
          node-version: "24.7.0"
          cache: pnpm

      # 4. Install dependencies cleanly
      - name: Install Dependencies
        run: pnpm install

      # 5. Build the application (electron-forge publish)
      - name: Build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: pnpm run make

      # 6. Set Other Variables
      - name: Set Other Variables
        shell: bash
        run: |
          echo "BUILD_DATE=$(date +%Y%m%d)" >> $GITHUB_ENV
          echo "COMMIT_ID=$(git rev-parse --short HEAD)" >> $GITHUB_ENV
          echo "APP_VERSION=$(jq -r '.version' package.json)" >> $GITHUB_ENV
          echo "VITE_VER=$(jq -r '.devDependencies.vite' package.json)" >> $GITHUB_ENV
          echo "ELECTRON_VER=$(jq -r '.devDependencies.electron' package.json)" >> $GITHUB_ENV
          echo "REACT_VER=$(jq -r '.Dependencies.react' package.json)" >> $GITHUB_ENV
          echo "TAILWIND_VER=$(jq -r '.Dependencies.tailwindcss' package.json)" >> $GITHUB_ENV

      # 7. Upload the Build
      - name: Upload to Release (Admin Pro)
        uses: softprops/action-gh-release@v2
        with:
          files: |
            out/make/squirrel.windows/x64/*
          name: Admin Pro - Windows 64-bit || ${{ env.BUILD_DATE }}
          tag_name: ap-${{ env.COMMIT_ID }}
          body: |
            Build: Windows 64-bit (using Squirrel.Windows)
            Version: ${{ env.APP_VERSION }}
            Commit: Most recent [commit](https://github.com/carlodandan/admin-pro/commit/${{ env.COMMIT_ID }}) during building process.
            
            Major Dependencies:
            - Vite: ${{ env.VITE_VER }}
            - Electron: ${{ env.ELECTRON_VER }}
            - React: ${{ env.REACT_VER }}
            - Tailwind CSS: ${{ env.TAILWIND_VER }}
```

---

## 3. Best Practices

| ✅ Do | ❌ Don't |
|-------|----------|
| **Use Secrets for anything sensitive** (Keys, Passwords). | Commit `.env` files to the repository. |
| **Use generic names** in workflows (`DATABASE_URL`) and map specific secrets (`PROD_DB_URL`) if needed. | Print secrets to the console (GitHub masks them, but it's bad practice). |
| **Rotate secrets** periodically. | hardcode secrets in the workflow file. |
| **Use Environment Secrets** for different deployment stages (Dev, Staging, Prod). | |

---

## 4. Troubleshooting

*   **Secret not found?** Ensure the spelling in `${{ secrets.NAME }}` matches exactly what was added in Settings.
*   **Empty value?** If you updated a secret, re-run the workflow.
*   **Forked repositories:** Secrets are **not** passed to workflows specifically triggered by pull requests from a fork.
