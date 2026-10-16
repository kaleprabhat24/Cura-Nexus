# Progress — simplified vs SPEC.md

This build was finished under a 30-minute deadline that put breadth first, so many SPEC.md items are smaller than specified. Everything listed in the README works. The table below shows what was simplified.

| SPEC.md item | This build |
|---|---|
| IndexedDB (Dexie), repository pattern, Supabase/REST adapters with fallback | Everything is stored in `localStorage` (`src/store.ts`). Settings saves a Supabase or REST URL and can test the connection, but data is not synced to either. |
| `src/api` service layer with Zod, simulated latency, typed errors | Pages read and write the store directly. |
| PBKDF2 auth, session expiry, timeout modal, password reset | Passwords use salted SHA-256 (Web Crypto). The session is kept in `localStorage`. There is no reset flow and no timeout warning. |
| Full FHIR store: versions, `_history`, search parameters, `$everything`, version diffs | `meta.versionId` is incremented on update. The viewer lets you browse by type and patient, and validates resources (`src/fhir/validator.ts`). There is no search language and no history view. |
| HL7 v2 and CSV ingestion hub with dry-run preview and Provenance | Not wired into the UI. The parser is in `src/engines/hl7.ts`. CSV is only used for Module 2 imports. |
| Fellegi–Sunter MPI and merge workbench | Duplicate check at registration only: Jaro–Winkler on name, plus DOB and phone. The full engine is in `src/engines/mpi.ts` but isn't used by the UI. |
| Scoped consents, ABDM artefact view, ABHA OTP linking, break-glass | Treatment consent can be granted or revoked per patient. Staff are blocked from clinical data while no consent is active. |
| Module 1 postMessage bridge, same-origin read, export snippet | JSON import only (file, paste or sample). |
| Module 2 table/column mapping UI, incremental sync, write-back | Supabase fetch from one table, using fixed column names (`mrn`, `risk_score`, `tier`, `factors`, `action`), plus JSON and CSV import. |
| Matching module results to patients | By MRN, or by name + DOB (Jaro–Winkler ≥ 0.9). Results with no match are reported to the user, not queued for review. |
| Radiology confirm/override, outreach logging and export back | Not built. Results are shown on the dashboards, the Modules page and the patient timeline. |
| Conformal intervals, Unified Hub, doctor override | Risk checks show the probability and each factor's contribution only. The conformal code is in `src/engines/risk/conformal.ts` but isn't used. |
| Calculators: Framingham, NEWS2, CHA₂DS₂-VASc, qSOFA | The calculators page has eGFR, BMI and FIB-4. NEWS2 is used on the ICU monitor. The other formulas are in `src/engines/calculators.ts` but have no page. |
| Digital twin, telemedicine, SBAR handoff, claims audit, dictation, CPIC rules | Not built. Engines for the twin, claims audit and CPIC rules are in `src/engines/`. |
| Co-Pilot chat: supervisor routing, citations, PII redaction | Knowledge-base retrieval (BM25 over 40 articles), with optional Gemini or OpenAI-compatible LLM. |
| Data Engineering, OMOP, telemetry, federated learning, pricing, about, profile pages | Not built. Engines are in `src/engines/` (pipeline, omop, fedavg). |
| Command palette, i18n (Hindi), onboarding tour, PWA, toasts | Not built. A PWA manifest and service worker exist in `public/` but are not registered. |
| Seed: 60–100 patients over 2–5 years, deliberate duplicates | 30 patients with about one year of vitals and HbA1c, plus conditions, medicines and consents. |
| Vitest + Playwright tests, docs/API.md, contracts docs, DECISIONS.md | Not written. Checked by hand: `npm run build` passes, every route was opened in a browser with no console errors, and the sample imports worked. |

`_archive/` holds the start of the full IndexedDB service layer and seed from before the scope change. It is not part of the build.

`FEATURE_INVENTORY.md` maps the reference project to the full SPEC.md plan. Its checkboxes were not updated for this reduced build.
