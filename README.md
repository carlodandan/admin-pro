# Admin Pro

> Company Administration System Application

A robust, offline-first desktop application for managing employees, attendance, and payroll. Built with modern web technologies and wrapped in Electron for a native experience on Windows.
![Company Admin Pro](https://raw.githubusercontent.com/carlodandan/company-admin-pro/refs/heads/main/images/dashboard.png)

## 🚀 Quick Start

Follow these steps to set up and run the application from scratch.

### Prerequisites

-   **OS**: Windows 10/11 (This project is configured for Windows).
-   **Node.js**: v18 or higher.
-   **Package Manager**: [pnpm](https://pnpm.io/) (recommended) or npm.

# Local Build

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/carlodandan/admin-pro.git
    cd admin-pro
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Configure Environment:**
    -   Copy `.env.example` to `.env`.
    -   Fill in your Supabase credentials.
    ```bash
    cp .env.example .env
    ```
    | Variable | Description | Required |
    |----------|-------------|----------|
    | `VITE_SUPABASE_URL` | URL of your Supabase project | Yes |
    | `VITE_SUPABASE_ANONKEY` | Supabase Publishable Key | Yes |

    For more information on how to get these values, please refer to the [SUPABASE_SETUP.md](https://github.com/carlodandan/admin-pro/blob/main/docs/SUPABASE_SETUP.md).

4.  **Start Development Server:**
    ```bash
    pnpm start
    ```
    This will launch the Electron app with hot-reloading enabled.

## 📦 Building for Production

To create a distributable installer (EXE) for Windows:

```bash
pnpm make
```

The output files will be located in the `out/` directory.

> **⚠️ Note on Cross-Platform Builds:**
> This specific configuration is optimized for **Windows**. If you wish to build for macOS or Linux, please refer to the [Electron Forge documentation](https://www.electronforge.io/) to configure the appropriate makers for your target platform.

# Github Workflow (CI/CD)

You can also build without cloning the repository in your local machine by using the Github Workflow. Just make sure to setup your secrets properly.

1. Please refer to the [GITHUB_WORKFLOW.md](https://github.com/carlodandan/admin-pro/blob/main/docs/GITHUB_WORKFLOW.md) on how to set it up.

2. After setting up the secrets, you can run the workflow by clicking on the **Actions** tab > **Build Admin Pro** > **Run workflow**.

3. The output files will be located in the release section of the repository.

> **⚠️ Note on Cross-Platform Builds:**
> This specific configuration is optimized for **Windows**. If you wish to build for macOS or Linux, please refer to the [Electron Forge documentation](https://www.electronforge.io/) to configure the appropriate makers for your target platform.

## ✨ Features

-   **Employee Management**: centralized database for employee profiles, roles, and status.
-   **Department Organization**: Manage company structure and budgets.
-   **Attendance System**:
    -   **Kiosk Mode**: Dedicated interface for employees to clock in/out using a PIN.
    -   **Manual Entry**: Admin override for corrections.
    -   **Reporting**: Daily, weekly, and monthly attendance summaries.
-   **Payroll Processing**:
    -   Automated calculation based on attendance.
    -   Support for allowances, deductions, and tax.
    -   Payslip generation.
-   **Offline-First Architecture**:
    -   Uses **SQLite** (`better-sqlite3`) for robust local data storage.
    -   Background synchronization with **Supabase** for cloud backup and remote access.
    -   Functions seamlessly without an internet connection.

## 🛠️ Technology Stack

-   **Runtime**: [Electron](https://www.electronjs.org/)
-   **Build Tool**: [Vite](https://vitejs.dev/) + [Electron Forge](https://www.electronforge.io/)
-   **Frontend**: React, Tailwind CSS
-   **Database**:
    -   Local: SQLite (better-sqlite3)
    -   Cloud: Supabase (PostgreSQL)
-   **Language**: JavaScript (ES6+)

## 🤝 Contributing

1.  Fork the project
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'feat: Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See [LICENSE](https://github.com/carlodandan/admin-pro/blob/main/LICENSE) for more information.
