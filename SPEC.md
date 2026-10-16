You are a senior full-stack engineer and health-informatics architect. Build a complete, production-grade, runnable web application called Cura Nexus (tagline: "Unified Patient Record & Interoperability Platform") in the current folder. Work autonomously from start to finish. Do not stop to ask me questions; when something is ambiguous, pick the option that best serves the goals below, write the decision in `DECISIONS.md`, and keep going. I will not edit any code myself. When you finish, I must be able to run `npm install` and `npm run dev`, open the browser, and have every feature work.
0. Goals, in priority order

1. Everything works. Every button, page, form and feature does something real. No dead links, no "coming soon", no buttons that do nothing, no console errors.
2. Zero setup. No API keys, no database server, no Docker, no Python and no `.env` are needed. All data lives in the browser (IndexedDB) and is seeded with realistic demo data on first launch.
3. Easy to deploy. `npm run build` produces a static site that works on Vercel, Netlify or GitHub Pages with every feature intact.
4. Hospital-grade UI. It must look at least as polished as the reference project, and preferably better: calm, clinical, information-dense and fast.
5. Interview-grade engineering. Clean architecture, typed code, real algorithms, tests, and a README that explains the design like a senior engineer would.

1. The reference project (read it first)
There is a zip of a reference project in this folder (`AI-Healthcare-System-main.zip`, or whichever `.zip` is present). Unzip it into `./_reference/` (add `_reference/` to `.gitignore`) and study it before you write any code:

* `README.md` (all of it), `PROJECT.md`, `frontend/README.md`
* `frontend/src/pages/*` (24 pages: Dashboard, Patients, PatientDetail, Predict, DynamicPredict, UnifiedHub, Chat, Telemedicine, Capacity, Telemetry, Admin, Profile, Pricing, About, AppRegistry, FederatedLearning, ClinicalIntelligence, Companion, DataEngineering, Infrastructure, ABDMIntegration, Login, Signup, ResetPassword)
* `frontend/src/components/**` (layout/TopNav, MegaMenu, CommandPalette, modals/, operations/, predict/, admin/)
* `frontend/src/components/layout/nav-config.ts`, `frontend/src/index.css` (look and feel)
* `packages/clinical-fhir-abdm`, `packages/clinical-tabular`, `packages/clinical-rag-cache` (algorithm ideas)

Then write `FEATURE_INVENTORY.md`: a checklist of every user-facing feature in the reference README and frontend, each with the page or module in Cura Nexus that will deliver it. Keep this file updated and tick items off as you build them. At the end every item must be either ✅ implemented, or marked "infra-only, represented as X" with a one-line reason.
Rules for using the reference:

* Reuse the ideas and the feature set, not the infrastructure. Rust/Bun gateways, Databricks, Kubernetes, Terraform, Airflow, Prometheus and the GitHub Actions agents cannot run in a browser-only app. Where one of these has a user-visible meaning, build a working in-browser equivalent (for example, the Data Engineering page actually runs Bronze→Silver→Gold quality gates on the local patient data). Otherwise leave it out and say so in the inventory.
* Do not copy its exaggerated claims ("100% accuracy", "HIPAA-compliant"). Cura Nexus states what it really does, with honest model cards.
* Write your own code. Don't paste the reference's files in.

2. My problem statement (what Cura Nexus is)
Cura Nexus uses a modular architecture: a frontend, a backend, a set of independent AI modules, and a central database. After login, users reach either a Patient Dashboard or a Doctor Dashboard, from which they can access:

1. Batch Chest X-Ray Triage: multiple images are preprocessed and passed through a reconstruction-based (autoencoder/VAE-style) anomaly-detection model. Each image gets an anomaly score, the batch is ranked, and the highest-priority cases are shown first for radiologist review.
2. Chronic-Disease Follow-up Risk Prioritisation: longitudinal patient data (visits, medications, missed appointments, prior readings) is cleaned and feature-engineered, scored by an ML risk model, and shown as a High/Medium/Low priority queue with the contributing factors explained next to the score. Outcomes recorded after outreach feed back into the patient's profile.
3. Centralised Record & Interoperability Layer: results from both modules above are written into one FHIR R4-oriented patient record, which both dashboards can access.

Scope: this project is module 3 plus everything from the reference project. I have already built modules 1 (Chest X-Ray triage) and 2 (Chronic-care risk prioritisation) as separate, independent projects, each with ML models I trained myself. They stay separate apps. Do not rebuild them, and do not re-implement their models with simple algorithms: Cura Nexus never scores X-rays or chronic risk itself.
What Cura Nexus does for modules 1 and 2 is store their results in the central record, which is exactly what problem-statement item 3 asks for. How they store data today:

* Module 1 (CXR) stores its results in the browser's localStorage. localStorage is locked to a single origin (protocol + host + port), so Cura Nexus on a different port or domain cannot read it directly. The connector design in §5.3 works around this.
* Module 2 (Chronic care) stores its data in Supabase. Cura Nexus can read it directly with that project's URL and anon key (§5.3). If any connector path turns out to be impractical, build the fallback (file import) and write the reason in `DECISIONS.md`. The integration is a bonus; the rest of the app must never depend on it.

How the problem statement appears in the app:

* Add a "Problem Statement" page (linked from the landing page, About and the footer) that presents all three PS items as written above.
   * Items 1 and 2: badge "Independent module — connected via Cura Nexus", a short description, and a live connection status with a link to the Connected Modules page.
   * Item 3: badge "Implemented in Cura Nexus", with links to the pages that deliver it.
* Module 3's FHIR record is fed by this app's own data (seeded patients, patient registration, risk checks, calculators, vitals, prescriptions, encounters, discharge summaries), by the generic import paths in §5.2 (FHIR Bundle, HL7 v2, CSV) and by the module 1/2 connectors in §5.3.

3. Product positioning (the USP a hospital would pay for)
Frame the product, its landing page and the README around this pitch:
"One patient, one record, any source, works offline." Indian hospitals run separate systems for imaging, labs, the chronic-care clinic and billing, and they rarely share patient identity. Cura Nexus is a drop-in layer that:

* ingests HL7 v2, CSV and FHIR from any source system;
* resolves duplicate patients with a probabilistic Master Patient Index;
* enforces consent (ABDM/ABHA-aligned, DPDP Act 2023-aware);
* keeps versioned, provenance-tracked FHIR R4 records;
* turns the in-app risk scores and alerts into one prioritised, explainable worklist;
* runs on a single machine with no cloud dependency (data sovereignty).

Put a short "Why hospitals buy this" section on the landing page: integration cost, duplicate-record reduction, data-quality improvement, consent compliance and audit readiness. Every metric shown there must be computed from the app's own data, never invented.
4. Tech stack and architecture (fixed decisions)

* Vite + React 18 + TypeScript (strict), Tailwind CSS 3, React Router 6, Zustand (UI state), Dexie (IndexedDB), Zod (validation), react-hook-form, Recharts, lucide-react, framer-motion (subtle only), date-fns. Pick stable versions that work together and commit `package-lock.json`.
* Use npm, not bun or pnpm. Every script must work on Windows, macOS and Linux: no bash-only syntax, and use `cross-env` if needed. Node 18+.
* No real backend is required. Build a service layer that behaves like a REST API, in `src/api/*`: async functions with typed requests and responses, Zod validation, simulated latency of 80–250 ms, and proper error objects. UI components call only this layer, never the database directly. Mirror the reference's REST contract in the names (`auth.signup`, `patients.list`, `fhir.bundle`, `predict.diabetes`…), and list them in `docs/API.md`.
* Pluggable data layer (`src/data/adapters/`), using the repository pattern behind one `DataAdapter` interface:
   1. `LocalAdapter` (IndexedDB via Dexie): the default, fully working.
   2. `SupabaseAdapter`: activated when I paste a Supabase URL and anon key in Settings (supabase-js; ship `supabase/schema.sql` to create the tables). Optional.
   3. `RestAdapter`, labelled "PostgreSQL (via REST endpoint: PostgREST / Neon Data API / your API)". Explain in the UI that browsers cannot open raw Postgres connections. Optional. Settings has a "Test connection" button, and you can switch back to Local at any time. The app must never break if an optional adapter fails: show a toast and fall back to Local.
* Optional LLM enhancement (Settings → AI Providers). Every feature must work fully without any key, using the algorithms below. If a key is configured, these features gain an "Enhance with LLM" toggle: chat answers, discharge summaries, the handoff narrative and the patient-friendly explanation text. Providers:
   * Google Gemini (API key)
   * OpenAI-compatible endpoint: base URL + key + model. Presets: Groq (`openai/gpt-oss-120b`), OpenAI, and Local (Ollama `http://localhost:11434/v1`, LM Studio `http://localhost:1234/v1`, no key needed). Keys are stored only in this browser's localStorage, with a visible warning. Add a "Test" button. If an LLM call fails, fall back to the algorithmic output automatically. The LLM never decides clinical scores; it only phrases text.
* Folder layout: `src/app` (routing, providers), `src/pages`, `src/components/{ui,layout,charts,fhir,…}`, `src/api`, `src/data`, `src/engines` (pure, framework-free algorithm modules, each unit-tested), `src/fhir` (types, builders, validators, mappers), `src/seed`, `src/i18n`, `docs/`, `tests/`.
* SPA deploy config: `vercel.json` and `public/_redirects` (Netlify) with SPA rewrites; base-path support for GitHub Pages. Add a PWA manifest and service worker so it works offline after the first load.

5. Features (all must work)
5.1 Auth, roles and dashboards

* Landing page (public), Login, Sign up, Forgot/Reset password. The reset is simulated: show the reset link in a toast or modal instead of sending email.
* Local auth: passwords hashed with PBKDF2 (Web Crypto) and a per-user salt; a session token with expiry; a session-timeout warning modal; logout.
* Roles: Patient, Doctor, Nurse, Admin (also Radiologist if useful). Route guards plus role-based menus.
* Seeded demo accounts shown as one-click chips on the login page (e.g. `doctor@cura.ai / Demo@123`, plus patient, nurse and admin).
* Sign-up lets a user register as a patient (self-service) or as staff (pending until an admin approves).
* Doctor Dashboard: today's worklist (top CXR triage cases and high-risk chronic follow-ups imported from my modules, NEWS2 alerts, pending consents), KPIs and quick actions.
* Patient Dashboard: my record (FHIR-backed), results explained in plain language, appointments, medications, consents (grant/revoke), downloadable records, and a symptom/health chat.

5.2 ★ Module 3: Centralised Record & Interoperability Layer (hero feature, build this deepest)

* FHIR R4 resource model in TypeScript: Patient, Practitioner, Organization, Encounter, Observation, Condition, MedicationRequest, AllergyIntolerance, DiagnosticReport, ImagingStudy, RiskAssessment, Flag, Task, Communication, Appointment, Consent, Provenance, AuditEvent, DocumentReference, Bundle. Use correct `resourceType`, `id`, `meta.versionId`, `meta.lastUpdated`, references (`Patient/123`) and CodeableConcepts with real LOINC / SNOMED CT / ICD-10 / RxNorm codes from a small embedded code set.
* FHIR store on top of the adapter: create / read / update (new version) / history (`_history`) / search with a supported subset of parameters (`patient`, `code`, `date` ranges, `status`, `_sort`, `_count`), plus `Patient/$everything`. Expose a FHIR Explorer page: a query box, a resource tree, a JSON viewer with copy/download, and version diffs between resource versions.
* Validator: structural validation of each resource against simplified profiles (required fields, cardinality, code systems). Show errors and warnings inline, and as a per-patient data-quality score.
* Ingestion hub:
   1. Import a FHIR Bundle (JSON).
   2. HL7 v2 parser (ADT^A01/A04/A08, ORU^R01) → FHIR, with sample messages built in.
   3. A CSV mapper with column-to-field mapping UI and preview. Ship sample files for each format in `public/samples/`. In-app results (risk checks, calculators, vitals, prescriptions, discharge summaries) are written to the record as `Observation` / `RiskAssessment` / `MedicationRequest` / `DocumentReference` automatically. Every import shows a dry-run preview, then writes Provenance (source, agent, timestamp) and an AuditEvent.
* Master Patient Index (MPI): Fellegi–Sunter-style probabilistic matching using Jaro–Winkler on names, exact/fuzzy DOB, phone, ABHA number and address tokens. It outputs match / possible match / no match with a weighted score breakdown, and a merge workbench (side-by-side, pick fields, merge with link and Provenance, and un-merge).
* Consent management: patient-granted, scoped consents (purpose, resource types, date range, grantee) checked on every cross-role read. Denied reads are logged. Include an ABDM/ABHA-style consent artefact view and an ABHA ID linking flow (format validation, simulated OTP).
* Unified patient record page: a header (demographics, ABHA, allergies, flags), a longitudinal timeline merging every source with source badges, tabs for Conditions / Observations (with trend charts) / Medications / Imaging / Risk / Documents / Consents / Provenance / Audit, and export as a FHIR Bundle, CCD-style PDF (print stylesheet) or IPS-style summary.
* Interoperability dashboard: resources by type and source, ingestion success/failure, duplicates resolved, validation pass rate, consent activity, all computed live.
* A SMART-on-FHIR-style app launcher (from the reference's App Registry): small internal apps (risk calculators, growth chart, medication reconciler) launched with patient context.

5.3 Connectors for my external modules (CXR Triage and Chronic Care)
Cura Nexus does no image analysis and no chronic-risk scoring of its own. Those come from my trained models, which run in my separate projects. Cura Nexus's job is to receive, normalise, store and present their outputs.

* Integration contract (`docs/INTEGRATION_CONTRACT.md` + Zod schemas in `src/fhir/contracts/`). Define clear JSON payloads that my modules can produce:
   * CXR Triage result: batch id, model name/version, run timestamp, and per image: patient identifiers (MRN/ABHA/name+DOB), study id, anomaly score, rank, priority (Critical/Review/Routine), optional heatmap/thumbnail as a base64 or URL, and the radiologist decision if any.
   * Chronic Care result: patient identifiers, model name/version, risk score, tier (High/Medium/Low), contributing factors with weights, recommended action, and outreach outcomes (channel, date, outcome, notes). Accept each either as this JSON or as a FHIR Bundle (`ImagingStudy` + `DiagnosticReport` + `Observation` for CXR; `RiskAssessment` + `Flag` + `Task`/`Communication` for chronic care). Give a full example file for each in `docs/examples/`.
* Module 1 (CXR, localStorage) connector: three paths, on the "Connected Modules" page.
   1. Export → import file (the default, always works): write a short `exportForCura()` snippet in `docs/integrations/module1-cxr.md`. I paste it into module 1's browser console, or add it as a button there, and it downloads module 1's localStorage results as a contract-format JSON file. Cura Nexus imports that file. Make the snippet tolerant: it lists the localStorage keys and lets me choose which key holds the results.
   2. "Send to Cura Nexus" bridge (live, optional): a `/bridge` route in Cura Nexus receives results via `window.postMessage` from an origin I allow-list in Settings, then validates, previews and imports them. Document the ~15-line button code for module 1 to open Cura Nexus and post its data.
   3. Same-origin direct read (optional): if both apps are ever served from the same origin (e.g. both under one domain at different paths), Cura Nexus can read a configured localStorage key directly. Offer this in Settings, and detect and explain when it isn't possible.
* Module 2 (Chronic care, Supabase) connector: in Settings → Integrations, I paste module 2's Supabase URL and anon key (stored separately from Cura Nexus's own optional Supabase adapter in §4).
   * Cura Nexus lists the tables it can see.
   * A table/column mapping UI maps them onto the Chronic Care contract, since you don't know my schema. Auto-guess from common column names (`patient_id`, `name`, `dob`, `risk_score`, `risk_level`/`tier`, `factors`, `outcome`, `visit_date`) and save the mapping.
   * It pulls read-only on demand ("Sync now") and optionally on an interval, as an incremental sync on an `updated_at`/`created_at` column when one exists.
   * Write-back of outreach outcomes to a table I choose is off by default behind a toggle.
   * Handle errors clearly: RLS/permission errors ("the anon key needs a SELECT policy on these tables" — include sample SQL policies in `docs/integrations/module2-chronic.md`), network failures and schema mismatches.
   * Fallback: import a CSV/JSON export of the tables.
* Common to both:
   * a "Paste JSON" box for quick demos;
   * a status card per module (connected / last sync / records received / failures) with an "Open module" link to a URL I configure;
   * a re-runnable sync history.
* Mapping into the record: every incoming result goes through the MPI to find or create the right patient (unmatched → review queue), is mapped to the FHIR resources above with Provenance naming the source module and model version, gets an AuditEvent, and is re-validated. Re-importing the same result must be idempotent (no duplicates).
* Presentation (no re-scoring, just display what my models produced):
   * CXR results appear as a ranked radiology worklist, with thumbnails/heatmaps if provided and confirm/override actions that write back to the record.
   * Chronic results appear as a High/Medium/Low follow-up queue, with the contributing factors my model supplied shown as a bar/waterfall chart. Outreach outcomes logged in Cura Nexus are saved as FHIR `Task`/`Communication`, and they can be exported back in the contract format so my chronic-care module can consume them (closing the feedback loop in my problem statement).
   * Both appear on the patient's timeline and on both dashboards.
* Demo fixtures: ship sample result files (realistic, matching seeded patients, including a few with deliberately mismatched identifiers to exercise the MPI) and a one-click "Import sample module results" action, so the integration can be demonstrated without my modules running. Label these as sample data.

5.4 Everything from the reference project (make each one work)

* 5 disease risk checks: Diabetes, Heart, Liver, Kidney, Lungs. Each is a form with validated inputs and a transparent algorithm: a logistic model with literature-inspired coefficients or a validated score. Show feature contributions and a 95% conformal prediction interval computed from a seeded calibration set. Add a Unified Hub that runs all five from one intake, and a doctor review/override that is audit-logged.
* Clinical calculators: eGFR (CKD-EPI 2021, race-free), FIB-4, Framingham 10-year CVD risk, BMI, NEWS2, CHA₂DS₂-VASc, qSOFA. Show the formulas and cite their sources.
* Digital twin: a 10-year multi-organ trajectory simulator using simple coupled ODEs (BP, eGFR, HbA1c, weight) solved with Euler/RK4, with intervention sliders (adherence, statin, exercise, smoking cessation) and before/after charts.
* Pharmacy safety: drug–drug interaction and allergy checker against an embedded table, plus CPIC pharmacogenomics rules (CYP2C19–clopidogrel, CYP2C9/VKORC1–warfarin, SLCO1B1–statins, DPYD–fluoropyrimidines, CYP2D6–codeine) applied when prescribing.
* Clinical Co-Pilot chat: an intent router (supervisor pattern: guardrail → retrieve → analyse → answer), BM25 retrieval over a bundled medical knowledge base (~40 short articles you write) plus the selected patient's FHIR record, answers with citations, PII redaction, an off-topic guardrail, streaming-style typing, and saved history. Uses the LLM only if one is configured. Also a patient-facing Companion mode with simpler language.
* Hospital operations: live ICU/ward dashboard with simulated streaming vitals (heart rate, SpO₂, BP, RR, temperature) and NEWS2 alerting; alarm snooze with reason; bed capacity board (admit / transfer / discharge); SBAR shift-handoff generator; discharge summary generator; telemedicine room (camera/mic preview via getUserMedia, consult notes, e-prescription); appointments (book/cancel, doctor availability); billing: service catalog, invoices, simulated payments, and a claims-denial risk audit using rule-based CPT/ICD-10 consistency checks.
* Speech-to-text dictation for notes (Web Speech API, with a graceful fallback when unsupported).
* Admin: user management and approvals, role changes, a full audit log viewer (filter/export), system analytics, model registry/model cards, data maintenance (retention purge simulation, export/import a full backup JSON, reset demo data).
* Data Engineering page: a real in-browser Bronze → Silver → Gold pipeline over the app's data with data-quality gates, a quarantine table, row counts, a lineage graph and run history. Also an OMOP CDM v5.4 view mapping FHIR → OMOP tables (PERSON, VISIT_OCCURRENCE, CONDITION_OCCURRENCE, DRUG_EXPOSURE, MEASUREMENT) with export to CSV.
* Telemetry / System status page: in-app metrics (API-layer latency histogram, storage usage, error count, active sessions) collected from the real service layer.
* Federated learning page: run an actual in-browser FedAvg simulation across 3–5 virtual hospital nodes training the diabetes-risk logistic model from the risk checks, with per-round accuracy charts. Keep it honest and small.
* Pricing, About (architecture diagram, honest model cards and limitations) and Profile pages.
* Global UX: a command palette (Ctrl/Cmd+K) for searching patients, pages and actions; a mega-menu top nav like the reference plus a collapsible sidebar; toasts; skeleton loaders; error boundaries; empty states; a first-login onboarding tour; English + Hindi (i18n); light and dark themes; responsive layouts down to tablet and phone width; keyboard accessible (WCAG AA contrast, focus rings, aria labels).

5.5 Add new patients (must be excellent)

* A multi-step "Register patient" wizard: demographics → contact/address → identifiers (MRN auto-generated, ABHA optional and validated) → allergies and conditions → consent capture → review.
* Zod validation with clear inline errors.
* Before saving, run the MPI duplicate check and show likely matches with scores; the user chooses "This is the same patient" (open the existing record) or "Create new".
* Saving creates the FHIR `Patient` + `Consent` + `Provenance` + `AuditEvent`, and the patient appears immediately in all lists, the dashboards and the command palette.
* Also support editing (new version), deactivating, and bulk import via the CSV mapper.

6. Demo data (seed on first run, deterministic with a fixed seed)
60–100 Indian patients with realistic names, cities, ABHA numbers for some, 2–5 years of encounters/observations/medications, a few deliberate duplicates for the MPI to find, varied chronic conditions, the sample CXR and Chronic Care result files from §5.3 (not pre-imported, so the import can be demonstrated live), appointments, invoices, consents and staff users. Include a "Reset demo data" action.
7. UI and design direction
Study the reference UI, then exceed it. Target the feel of a modern clinical product (think Epic Hyperspace re-imagined by Linear/Vercel): a neutral, calm base, one confident accent (teal/clinical blue), semantic colours only for severity (critical/high/medium/low, used consistently everywhere), tight typography (Inter + a display face, tabular numbers for vitals), dense but breathable tables with sticky headers, sorting, filtering and pagination, and polished charts. Avoid generic templated looks, gratuitous gradients/glows and emoji in the UI. Every page needs a clear primary action, proper loading/empty/error states, and must look good in both themes. Build a small internal component library (`src/components/ui`: Button, Input, Select, Dialog, Drawer, Tabs, Table, Badge, Card, Tooltip, Toast, Skeleton, StatTile, SeverityPill) and use it everywhere for consistency.
8. Quality gates (do these before you say you're done)

1. `npm run typecheck`, `npm run lint` and `npm run build` all pass with zero errors.
2. Vitest unit tests for every engine: MPI scoring, Jaro–Winkler, HL7 parser, FHIR validator, FHIR search, consent enforcement, both module-result contracts (valid, invalid and idempotent re-import), the module 1 postMessage bridge (origin allow-list), the module 2 Supabase column mapping (with a mocked client), the risk-check models and their contributions, conformal intervals, eGFR/FIB-4/Framingham/NEWS2 against known reference values, the DDI/CPIC rules, BM25 retrieval, the ODE solver, and PBKDF2 auth. `npm test` passes.
3. A Playwright smoke test (`npm run test:e2e`, using the system Chromium if one is present) that: signs up, logs in as each demo role, visits every route, registers a new patient (including the duplicate-warning path), imports the sample CXR and Chronic Care results and checks they appear on the patient record and both dashboards, records an outreach outcome and exports it back, imports an HL7 message, exports a FHIR Bundle, and fails on any console error or uncaught exception. Fix everything it finds.
4. Run `npm run build && npm run preview` and verify the production build works with a fresh browser profile (empty IndexedDB → seed → app usable).
5. Re-open `FEATURE_INVENTORY.md` and confirm every line is ticked or justified. Map problem-statement item 3 to the exact pages/files that implement it, and show where items 1 and 2 connect in.

9. Deliverables

* The working app in this folder.
* `README.md` with: a one-paragraph pitch; screenshots (capture them with Playwright into `docs/screenshots/`); Quick start (exactly: `npm install`, `npm run dev`, open `http://localhost:5173`); demo accounts; a feature tour; an architecture diagram (Mermaid); the data-adapter and LLM-provider design; algorithm explanations with formulas; a problem statement section (items 1–2 noted as independent projects built separately with my own trained models; item 3 with a traceability table to its implementation); one-command deploy instructions for Vercel/Netlify/GitHub Pages; honest limitations ("synthetic data, decision support only, not a medical device"); and an "Interview talking points" section covering the key design trade-offs (why browser-first, why the repository pattern, why Fellegi–Sunter, why the LLM is optional and never scores, why the AI modules stay independent services behind a contract, how this would scale to a real FHIR server such as HAPI).
* `docs/API.md`, `docs/FHIR_MAPPING.md`, `docs/INTEGRATION_CONTRACT.md`, `docs/integrations/module1-cxr.md`, `docs/integrations/module2-chronic.md`, `DECISIONS.md` and `FEATURE_INVENTORY.md`.

10. How to work

* First, write a phased plan (in a task list) and the feature inventory. Then build in this order: foundation (stack, design system, data layer, auth, seed) → Module 3 (FHIR store, MPI, ingestion, record page) → connectors for my external modules → reference features → polish → tests → docs. Run the app and tests after each phase and fix problems before moving on.
* Prefer depth and correctness over breadth when time is tight, but nothing in §5 may be left non-functional. A simpler working version beats an impressive broken one.
* Don't leave TODOs, placeholder text, lorem ipsum or mock buttons in the final build.
* When completely done, print: the run commands, the demo logins, and a short summary of what was built.
