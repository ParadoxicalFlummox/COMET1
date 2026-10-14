[![wakatime](https://wakatime.com/badge/user/51dab51a-ec50-46e0-ad83-8e8104fe0e9c/project/0e6240ec-7340-4ad9-94c6-7bfa75cccf95.svg)](https://wakatime.com/badge/user/51dab51a-ec50-46e0-ad83-8e8104fe0e9c/project/0e6240ec-7340-4ad9-94c6-7bfa75cccf95)
![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=flat-square&logo=google&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=flat-square&logo=googlesheets&logoColor=white)

# COMET

A plug-and-play workforce management framework built on Google Apps Script. COMET turns any Google Sheet into a relational, JSON-backed database and layers scheduling, attendance, absence tracking, and supervisor tooling on top of it. With no external services, no API keys, and no unverified-app warnings.

## Why COMET

Traditional workforce tools force a tradeoff: heavy SaaS platforms (extraneous features, per-seat pricing, data locked in someone else's cloud) or homemade spreadsheets (no concurrency safety, no history and little to no automation). COMET is the middle path, a full application that lives inside a Google Sheet that you already own providing Google's collaboration system and built in SSO.

COMET is built as a **framework, not a one-off**: the storage layer, controller layer, and the services are separable. This allows a single core to power multiple different frontends. COMET releases as versions on the main codebase rather than separate repos (rename pending).

## Features

- **SheetDB ORM** - a psuedo database layer over Sheets: whitelisted tables, key sanitization, `getAll` / `getRecord` / `upsertRecord` / `saveOne` / `saveAll` and grid protection so that users cannot break the schema by hand.
- **Thread-safe writes** - every write takes a `LockService` lock; concurrent devices and scripts serialize correctly.
- **UKG importer** - parse raw UKG data into the sheet, highlight it, and ingest it through a normalizer that dedupes and updates employee records.
- **Auto-scheduler** - generates department schedules from per-department config (weekly hour budgets, per-day coverage targets, operating windows), with coverage-aware day-off granding and seniority-based priority.
- **Absence and attendance** - PTO, sick, floating holiday, RDO, and holiday events in a single store; counseling notices (CNs) as events with `derivedFrom` links to their evidence; burn hours as manager-set inputs at approval time.
- **Attendance service** - occurances, counseling notices, points, and a one-click complete employee history export.
- **Archiver** - prunes records older than 3 rolling fiscal years into archive tabs, keeping active tables fast.
- **Controller layer** - a public API surface for any UI (sidebar, modal, external webapp, or the Zenith supervisor app) that calls core services by name instead of touching sheet internals.
- **Format service** - ISO dates everywhere in storage; user date-order preferences applied only at display time.

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
