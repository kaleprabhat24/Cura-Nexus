# Cura Nexus — Feature Inventory

Every user-facing feature found in the reference project (`_reference/AI-Healthcare-System-main`: `README.md`,
`PROJECT.md`, `frontend/README.md`, `frontend/src/pages/*`, `frontend/src/components/**`) plus every item in the
Cura Nexus brief, mapped to the page / module that delivers it.

Legend: ✅ implemented · ⬜ planned · **infra-only → X** (cannot run in a browser-only app; represented as X)

## A. Problem statement

| # | Item | Delivered by | Status |
|---|------|--------------|--------|
| A1 | PS-1 Batch Chest X-Ray triage (independent module) | `/problem-statement` card + live status; results imported via `/app/modules`, shown in `/app/radiology` | ⬜ |
| A2 | PS-2 Chronic follow-up risk prioritisation (independent module) | `/problem-statement` card + live status; Supabase / file connector in `/app/modules`, queue in `/app/followup` | ⬜ |
| A3 | PS-3 Centralised record & interoperability layer | FHIR store `src/data/fhirStore.ts`, record page `/app/patients/:id`, explorer `/app/fhir`, ingest `/app/ingest` | ⬜ |

## B. Reference pages → Cura Nexus

| # | Reference page / component | Cura Nexus | Status |
|---|----------------------------|------------|--------|
| B1 | Login (demo chips) | `/login` | ⬜ |
| B2 | Signup | `/signup` (patient self-service / staff pending approval) | ⬜ |
| B3 | ResetPassword | `/forgot`, `/reset/:token` (simulated email → link in dialog) | ⬜ |
| B4 | Dashboard (hospital ops, telemetry, risk probabilities, record vitals) | `/app/dashboard` (doctor/nurse/admin), `/app/icu` | ⬜ |
| B5 | Patients list | `/app/patients` (sortable/filterable/paginated table) | ⬜ |
| B6 | PatientDetail (timeline, meds, diagnostics, monitoring signals, care actions) | `/app/patients/:id` unified record | ⬜ |
| B7 | Predict (5 disease checks) + PredictionForm + conformal bounds visualiser | `/app/predict/:disease` | ⬜ |
| B8 | DynamicPredict (longitudinal / dynamic signals) | Risk tab trend on record page + Digital Twin `/app/twin` | ⬜ |
| B9 | UnifiedHub (one intake, many models; lab report analyser) | `/app/unified-hub` | ⬜ |
| B10 | Chat (multi-agent RAG) + ModelManager | `/app/copilot` + Settings → AI Providers | ⬜ |
| B11 | Companion (patient diary + assistant) | `/app/companion` (simpler language, symptom diary) | ⬜ |
| B12 | Telemedicine | `/app/telemedicine` (camera/mic preview, notes, dictation, e-prescription) | ⬜ |
| B13 | Capacity (bed board, transfers) | `/app/capacity` | ⬜ |
| B14 | Telemetry (live vitals, alarms) | `/app/icu` (streaming vitals + NEWS2) and `/app/system` (app metrics) | ⬜ |
| B15 | Infrastructure (server/DB health, HL7 feeds) | `/app/system` (storage, adapter health, SW, latency) | ⬜ |
| B16 | Admin (users, audit, analytics, AI agents, data pipeline, hospital setup) | `/app/admin` tabs | ⬜ |
| B17 | Profile | `/app/profile` | ⬜ |
| B18 | Pricing (tiers + procedure cost estimator) | `/pricing` | ⬜ |
| B19 | About | `/about` (architecture diagram, model cards, limitations) | ⬜ |
| B20 | AppRegistry (SMART apps) + SmartAppLauncherModal | `/app/apps` | ⬜ |
| B21 | FederatedLearning (DP-FedAvg) + FederatedNodeOrchestratorModal | `/app/federated` | ⬜ |
| B22 | ClinicalIntelligence (alert feed, risk sandbox, SOAP scribe, lab analyser, advisory board) | Alert feed on dashboard, risk sandbox = `/app/unified-hub`, ambient scribe = dictation in telemedicine/notes, lab analyser = Unified Hub "paste lab report" | ⬜ |
| B23 | DataEngineering (medallion DAG, quality gates, quarantine, OMOP) | `/app/data-engineering` (real in-browser pipeline) | ⬜ |
| B24 | ABDMIntegration + AbdmHealthIdModal | `/app/abdm` (ABHA linking, OTP sim, consent artefacts) | ⬜ |
| B25 | TopNav + MegaMenuPanel + MobileDrawer | `src/components/layout/TopNav.tsx`, `Sidebar.tsx` | ⬜ |
| B26 | CommandPalette / CommandSearch | `src/components/layout/CommandPalette.tsx` (Ctrl/Cmd+K) | ⬜ |
| B27 | SessionTimeoutManager | `src/components/layout/SessionTimeout.tsx` | ⬜ |
| B28 | AuthGuard | `src/app/guards.tsx` | ⬜ |
| B29 | ErrorBoundary, PageLoader, Toasts | `src/components/ui/*` | ⬜ |
| B30 | LanguageSelector | `src/i18n` (English + Hindi) | ⬜ |
| B31 | OnboardingGuideModal | `src/components/layout/OnboardingTour.tsx` | ⬜ |
| B32 | DdiAllergySafetyModal | `/app/pharmacy` + prescribing dialog | ⬜ |
| B33 | DischargeSummaryModal | `/app/discharge` | ⬜ |
| B34 | ShiftHandoffModal | `/app/handoff` (SBAR) | ⬜ |
| B35 | SpeechToTextModal | `src/components/clinical/DictationButton.tsx` | ⬜ |
| B36 | TelemetryAlarmSnoozeModal | `/app/icu` snooze dialog | ⬜ |
| B37 | BillingClaimsModal + SoapDenialAuditModal | `/app/billing` (invoices, payments, claim-denial audit) | ⬜ |
| B38 | DigitalSignatureModal | Discharge summary / e-prescription "Sign" (SHA-256 content hash + signer recorded in Provenance) | ⬜ |
| B39 | HomeDiagnosticKitModal | Patient dashboard "Record a home reading" (BP/glucose/SpO₂ → Observation) | ⬜ |
| B40 | SecurityLockoutModal | Login lockout after 5 failed attempts (15 min) | ⬜ |
| B41 | SelfHealingMaintenanceModal | Admin → Data maintenance (integrity check + repair of orphaned references) | ⬜ |
| B42 | InfrastructureFailoverModal | Settings → Data adapter: test connection + automatic fallback to Local | ⬜ |
| B43 | TelephonyRoutingModal | Follow-up queue outreach (phone/SMS/WhatsApp channel logging) | ⬜ |
| B44 | ClinicalAiConfiguratorModal | Settings → AI Providers | ⬜ |
| B45 | DicomUploadModal / DicomMprRendererModal / PacsViewer / Dicom3DViewer | **infra-only → represented as** radiology worklist with module-supplied thumbnails/heatmaps; Cura Nexus does no image analysis by design (PS-1 is an independent module) | ⬜ |
| B46 | LiveECGMonitor / LiveVitalsStreamViewer | `/app/icu` waveform + vitals stream | ⬜ |
| B47 | RiskTrajectoryChart | Record → Risk tab history chart; Digital Twin | ⬜ |
| B48 | HospitalSetupPanel | Admin → Hospital setup (wards and bed counts) | ⬜ |
| B49 | AIAgentsPanel | Admin → Model registry (model cards incl. external module models seen in Provenance) | ⬜ |
| B50 | AnalyticsPanel | Admin → Analytics | ⬜ |
| B51 | AuditPanel | Admin → Audit log (filter / export) | ⬜ |
| B52 | UsersPanel | Admin → Users & approvals | ⬜ |

## C. Reference README capabilities

| # | Capability | Cura Nexus | Status |
|---|-----------|------------|--------|
| C1 | 5 disease risk models with explainability | Transparent logistic models + per-feature contributions (`src/engines/risk`) | ⬜ |
| C2 | 95% conformal prediction | Split-conformal interval + label set from seeded calibration set (`src/engines/conformal.ts`) | ⬜ |
| C3 | eGFR CKD-EPI 2021, FIB-4, Framingham | `/app/calculators` + `src/engines/calculators.ts` (+ BMI, NEWS2, CHA₂DS₂-VASc, qSOFA) | ⬜ |
| C4 | 10-year multi-organ digital twin (coupled ODE) | `/app/twin` RK4 solver (`src/engines/twin.ts`) | ⬜ |
| C5 | CPIC pharmacogenomics | `src/engines/pharmacy.ts` (CYP2C19, CYP2C9/VKORC1, SLCO1B1, DPYD, CYP2D6) | ⬜ |
| C6 | LangGraph supervisor chat (guardrail → research/analyse → generate) | Intent router + BM25 RAG (`src/engines/copilot`) | ⬜ |
| C7 | Ollama / Gemini / cloud LLM fallback | Settings → AI Providers (Gemini, OpenAI-compatible: Groq/OpenAI/Ollama/LM Studio); optional, phrasing only | ⬜ |
| C8 | PII redaction | `src/engines/pii.ts` (chat input + logs) | ⬜ |
| C9 | JWT/bcrypt auth, RBAC, rate limiting | PBKDF2 (Web Crypto) + session tokens + role guards + login lockout | ⬜ |
| C10 | Audit logging (REVIEW_AI_PREDICTION) | FHIR AuditEvent for every write, denied read, override | ⬜ |
| C11 | FHIR R4 serialisation + bundle export | `src/fhir/*`, FHIR store, `$everything`, Bundle export | ⬜ |
| C12 | ABDM consent lifecycle | Consent engine + ABDM-style consent artefact view | ⬜ |
| C13 | SMART on FHIR readiness / launch | `/app/apps` launcher with patient context | ⬜ |
| C14 | DICOMweb readiness | **infra-only → represented as** ImagingStudy resources from module 1 (no PACS) | ⬜ |
| C15 | Hospital operations: appointments, billing, invoices, payments | `/app/appointments`, `/app/billing` | ⬜ |
| C16 | Discharge / nursing handoff / billing agents | Deterministic generators (+ optional LLM phrasing) | ⬜ |
| C17 | Medallion Bronze/Silver/Gold + quality gates + quarantine | `/app/data-engineering` (`src/engines/pipeline.ts`) | ⬜ |
| C18 | OMOP CDM v5.4 | `src/engines/omop.ts` + OMOP view with CSV export | ⬜ |
| C19 | Federated learning (DP-FedAvg) | `/app/federated` real FedAvg in-browser | ⬜ |
| C20 | Live telemetry / WebSocket vitals | Simulated in-browser stream (`src/engines/vitalsSim.ts`) | ⬜ |
| C21 | System telemetry / metrics / health checks | `/app/system` from the real service layer | ⬜ |
| C22 | Data retention purge / maintenance | Admin → Data maintenance | ⬜ |
| C23 | Model hot-reload | **infra-only → represented as** model registry versions (models are code, reload = page refresh) | ⬜ |
| C24 | Rust gateway, Bun/Elysia edge, rate limiter | **infra-only → represented as** `src/api` service layer (typed contract, latency, errors) | ⬜ |
| C25 | Databricks / Spark / Delta / Airflow | **infra-only → represented as** in-browser pipeline with run history | ⬜ |
| C26 | Kubernetes / Terraform / Docker / Render / HF Spaces | **infra-only → represented as** static build deployable to Vercel/Netlify/GitHub Pages | ⬜ |
| C27 | Prometheus / Grafana monitoring | **infra-only → represented as** `/app/system` metrics | ⬜ |
| C28 | GitHub Actions AI agents (SEO, triage, PR reviewer) | **infra-only → not represented**: repo automation, no user-visible meaning | ⬜ |
| C29 | AES-GCM PII encryption at rest | **infra-only → not represented**: browser IndexedDB is per-origin; documented in limitations | ⬜ |
| C30 | TOTP 2FA | **infra-only → represented as** simulated OTP for ABHA linking (no real second factor offline) | ⬜ |
| C31 | Android app | **infra-only → represented as** responsive layout + installable PWA | ⬜ |
| C32 | Semantic vector cache (turbovec) | **infra-only → represented as** BM25 lexical retrieval (no embedding model offline) | ⬜ |
| C33 | License gate / commercial packages | **not represented**: Cura Nexus has no licence enforcement | ⬜ |

## D. Cura Nexus brief (§5)

| # | Feature | Where | Status |
|---|---------|-------|--------|
| D1 | Landing page with pitch + "Why hospitals buy this" (live metrics) | `/` | ⬜ |
| D2 | Problem Statement page | `/problem-statement` | ⬜ |
| D3 | PBKDF2 local auth, session expiry, timeout warning, logout | `src/api/auth.ts`, `src/lib/crypto.ts` | ⬜ |
| D4 | Roles Patient/Doctor/Nurse/Admin/Radiologist, guards, role menus | `src/app/guards.tsx`, `src/components/layout/nav.ts` | ⬜ |
| D5 | Demo account chips | `/login` | ⬜ |
| D6 | Doctor dashboard worklist (CXR, chronic, NEWS2, consents), KPIs, quick actions | `/app/dashboard` | ⬜ |
| D7 | Patient dashboard (record, plain-language results, appointments, meds, consents, downloads, chat) | `/app/me` | ⬜ |
| D8 | FHIR R4 resource model (20 types) + code sets | `src/fhir/types.ts`, `src/fhir/codes.ts` | ⬜ |
| D9 | FHIR store CRUD + versions + `_history` + search + `$everything` | `src/data/fhirStore.ts`, `src/fhir/search.ts` | ⬜ |
| D10 | FHIR Explorer (query, tree, JSON viewer, copy/download, version diff) | `/app/fhir` | ⬜ |
| D11 | Validator + per-patient data-quality score | `src/fhir/validator.ts` | ⬜ |
| D12 | Ingestion: FHIR Bundle import | `/app/ingest` | ⬜ |
| D13 | Ingestion: HL7 v2 ADT^A01/A04/A08, ORU^R01 | `/app/ingest`, `src/engines/hl7.ts` | ⬜ |
| D14 | Ingestion: CSV mapper with preview | `/app/ingest`, `src/engines/csv.ts` | ⬜ |
| D15 | Dry-run preview + Provenance + AuditEvent on every import | `src/api/ingest.ts` | ⬜ |
| D16 | In-app results auto-written to record | risk checks, calculators, vitals, prescriptions, discharge | ⬜ |
| D17 | MPI Fellegi–Sunter + Jaro–Winkler, score breakdown | `src/engines/mpi.ts`, `/app/mpi` | ⬜ |
| D18 | Merge workbench (pick fields, merge with link + Provenance, un-merge) | `/app/mpi` | ⬜ |
| D19 | Consent management (scoped, enforced, denied reads logged) | `src/engines/consent.ts`, `/app/consents` | ⬜ |
| D20 | ABDM consent artefact view + ABHA linking (validation, simulated OTP) | `/app/abdm` | ⬜ |
| D21 | Unified record page (header, timeline with source badges, 9 tabs, exports Bundle/CCD/IPS) | `/app/patients/:id` | ⬜ |
| D22 | Interoperability dashboard (all live) | `/app/interop` | ⬜ |
| D23 | SMART-style app launcher (risk calc, growth chart, med reconciler) | `/app/apps` | ⬜ |
| D24 | Integration contract + Zod schemas + examples | `docs/INTEGRATION_CONTRACT.md`, `src/fhir/contracts/` | ⬜ |
| D25 | Module 1: export snippet → file import | `docs/integrations/module1-cxr.md`, `/app/modules` | ⬜ |
| D26 | Module 1: postMessage bridge with origin allow-list | `/bridge`, Settings → Integrations | ⬜ |
| D27 | Module 1: same-origin localStorage read | Settings → Integrations | ⬜ |
| D28 | Module 2: Supabase connector (list tables, mapping, sync, incremental, write-back, errors) | Settings → Integrations, `src/connectors/chronicSupabase.ts` | ⬜ |
| D29 | Module 2: CSV/JSON file fallback | `/app/modules` | ⬜ |
| D30 | Paste JSON, status cards, sync history | `/app/modules` | ⬜ |
| D31 | MPI resolution + review queue + idempotent re-import | `src/api/modules.ts` | ⬜ |
| D32 | Radiology worklist (confirm/override → record) | `/app/radiology` | ⬜ |
| D33 | Chronic follow-up queue + factor chart + outreach → Task/Communication + export back | `/app/followup` | ⬜ |
| D34 | Sample module fixtures + one-click import | `public/samples/`, `/app/modules` | ⬜ |
| D35 | Risk checks + Unified Hub + doctor override (audited) | `/app/predict/*`, `/app/unified-hub` | ⬜ |
| D36 | Calculators with formulas + citations | `/app/calculators` | ⬜ |
| D37 | Digital twin with intervention sliders | `/app/twin` | ⬜ |
| D38 | Pharmacy safety: DDI, allergy, CPIC on prescribing | `/app/pharmacy` | ⬜ |
| D39 | Co-Pilot chat (router, BM25 KB ~40 articles + patient record, citations, PII redaction, guardrail, typing, history) | `/app/copilot` | ⬜ |
| D40 | Companion mode | `/app/companion` | ⬜ |
| D41 | ICU live vitals + NEWS2 + alarm snooze | `/app/icu` | ⬜ |
| D42 | Bed capacity board (admit/transfer/discharge) | `/app/capacity` | ⬜ |
| D43 | SBAR handoff generator | `/app/handoff` | ⬜ |
| D44 | Discharge summary generator | `/app/discharge` | ⬜ |
| D45 | Telemedicine room | `/app/telemedicine` | ⬜ |
| D46 | Appointments (book/cancel, availability) | `/app/appointments` | ⬜ |
| D47 | Billing: catalog, invoices, payments, claims-denial audit | `/app/billing` | ⬜ |
| D48 | Speech-to-text dictation with fallback | `DictationButton` | ⬜ |
| D49 | Admin: users/approvals/roles, audit viewer, analytics, model registry, maintenance, backup, reset | `/app/admin` | ⬜ |
| D50 | Data Engineering pipeline + OMOP view + CSV export | `/app/data-engineering` | ⬜ |
| D51 | Telemetry/System status | `/app/system` | ⬜ |
| D52 | Federated learning simulation | `/app/federated` | ⬜ |
| D53 | Pricing, About, Profile | `/pricing`, `/about`, `/app/profile` | ⬜ |
| D54 | Command palette, mega menu + collapsible sidebar, toasts, skeletons, error boundaries, empty states | layout + ui | ⬜ |
| D55 | Onboarding tour | `OnboardingTour` | ⬜ |
| D56 | English + Hindi | `src/i18n` | ⬜ |
| D57 | Light + dark themes, responsive, keyboard accessible | design system | ⬜ |
| D58 | Register patient wizard (6 steps, Zod, MPI duplicate check, FHIR Patient+Consent+Provenance+AuditEvent) | `/app/patients/new` | ⬜ |
| D59 | Edit patient (new version), deactivate, bulk import via CSV | `/app/patients/:id/edit`, `/app/ingest` | ⬜ |
| D60 | Pluggable data adapters (Local / Supabase / REST) + test + fallback | `src/data/adapters/*`, Settings | ⬜ |
| D61 | Optional LLM providers with test + automatic fallback | `src/llm/*`, Settings | ⬜ |
| D62 | Deterministic seed (60–100 Indian patients, duplicates, encounters…) + reset | `src/seed/*` | ⬜ |
| D63 | PWA manifest + service worker (offline after first load) | `public/manifest.webmanifest`, `public/sw.js` | ⬜ |
| D64 | SPA deploy config (Vercel / Netlify / GitHub Pages base path) | `vercel.json`, `public/_redirects`, `VITE_BASE` | ⬜ |
