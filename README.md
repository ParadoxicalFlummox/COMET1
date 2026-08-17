[![wakatime](https://wakatime.com/badge/user/51dab51a-ec50-46e0-ad83-8e8104fe0e9c/project/0e6240ec-7340-4ad9-94c6-7bfa75cccf95.svg)](https://wakatime.com/badge/user/51dab51a-ec50-46e0-ad83-8e8104fe0e9c/project/0e6240ec-7340-4ad9-94c6-7bfa75cccf95)
![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=flat-square&logo=google&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=flat-square&logo=googlesheets&logoColor=white)

# COMET1
> **Centralized Operations, Management & Employee Toolkit**

COMET1 is a streamlined Google Apps Script framework built directly on top of a single Google Sheets file. It aims to deliver a polished, "plug-and-play" package for workforce management and automation.

---

## Background & History

* **COMET0:** The original project evolved from standalone Google Sheets automation scripts into a single centralized tool. Rapid iteration, adding/removing features, and automated code cleanup resulted in high complexity and technical debt.
* **COMET1:** A complete rewrite of the COMET0 feature stack designed for maintainability, simplicity, and ease of deployment.
* **COMET2 (Planned):** A future standalone, self-hosted solution focused on custom UI components, enhanced user experience, and optimized database architecture.

---

## Getting Started

### Prerequisites
* A Google Account with access to Google Sheets and Google Apps Script.

### Installation
1. Make a copy of the template Google Sheets file.
2. Open **Extensions** > **Apps Script**.
3. Configure your initial settings in `Config.gs` (or your setup file).
4. Run the `setup()` function to initialize triggers and UI menus.

---

## Tech Stack

* **Platform:** Google Apps Script (GAS)
* **Database/UI Layer:** Google Sheets

---

## Roadmap

- [x] Refactor and clean up COMET0 legacy codebase
- [ ] Create standardized module templates for simple integrations
- [ ] Improve user onboarding documentation
- [ ] Design specification architecture for **COMET2** (Standalone platform)

---

### Project Notice & AI Usage

Claude Code is used exclusively in this project for writing, running, and maintaining unit tests. Core business logic, features, and system architecture are designed and implemented manually.
