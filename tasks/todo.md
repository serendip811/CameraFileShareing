# Camera-to-Screen File Transfer Todo

## Design Phase

- [x] Explore project context
- [x] Clarify target platform and MVP constraints
  - [x] Target platform: browser web app / PWA
  - [x] Initial transfer direction and device roles: one-way data stream, final reverse QR ACK/NACK for verification and repair
  - [x] MVP reliability and file-size target: 100KB to 1MB transfers with deterministic hash verification
- [x] Compare 2-3 protocol/product approaches
  - [x] Candidate recommendation: one-way high-throughput data stream with final reverse QR ACK/NACK for verification and repair
- [x] Agree on initial design before implementation
- [x] Write design spec
- [x] Review spec for ambiguity and scope

## Implementation Phase

- [x] Create implementation plan after spec approval
  - [x] Plan written at `docs/superpowers/plans/2026-06-19-qr-camera-file-transfer-implementation.md`
- [x] Stabilize Task 1 scaffold toolchain after code quality review
  - [x] Declare Node 20 runtime in package metadata and version file
  - [x] Ignore generated dependency/build/typecheck artifacts
  - [x] Make build type checks non-emitting
  - [x] Move Vite packages to development dependencies and refresh lockfile
  - [x] Verify install, build, and clean generated-artifact status
- [x] Complete Task 1 scaffold review gate
  - [x] Spec compliance review passed
  - [x] Code quality re-review passed with no Critical or Important issues
- [x] Implement Task 2 protocol primitives
  - [x] Add binary helper tests and implementation
  - [x] Add checksum helper tests and implementation
  - [x] Add chunker tests, shared protocol types, and implementation
  - [x] Add missing range tests and implementation
  - [x] Verify protocol primitive tests with Node 20.20.2
  - [x] Commit `src/protocol` changes
  - [x] Spec compliance review passed after malformed range fix
  - [x] Code quality re-review passed after validation hardening
- [ ] Build the approved MVP
- [ ] Verify transfer behavior with repeatable tests
- [ ] Document results and remaining risks

## Review

- Design spec written at `docs/superpowers/specs/2026-06-19-qr-camera-file-transfer-design.md`.
- Spec self-review found no `TODO`, `TBD`, placeholder question marks, or obvious scope contradictions.
- Implementation plan written at `docs/superpowers/plans/2026-06-19-qr-camera-file-transfer-implementation.md`.
- Verification target for implementation: `npm test`, `npm run build`, and manual two-device QR transfer.
- Task 1 review follow-up target: `npm install`, `npm run build`, and `git status --short` under Node 20.20.2 with generated artifacts ignored.
- Task 1 review follow-up passed under Node 20.20.2: `npm install` and `npm run build` exited 0; `git status --short` did not show dependency or generated build artifacts.
- Task 2 protocol primitive tests passed under Node 20.20.2: `npm test -- src/protocol` exited 0 with 4 test files and 9 tests passing. Protocol primitives committed as `dc624f5` (`feat: add transfer protocol primitives`).

## Task 2 Missing Range Re-review

- [x] Confirm branch and fix commit context
- [x] Inspect `src/protocol/missingRanges.ts` against malformed range grammar
- [x] Inspect `src/protocol/missingRanges.test.ts` for malformed range coverage
- [x] Run targeted protocol tests
- [x] Record compliance result

Result: Task 2 missing range parser is spec compliant after `bd0b858`; malformed examples `-1`, `0-`, `1-2-3`, `a`, and `2-1` are covered by tests and rejected. Verification: `source "$HOME/.nvm/nvm.sh" && nvm use 20.20.2 >/dev/null && npm test -- src/protocol/missingRanges.test.ts src/protocol` exited 0 with 4 files and 10 tests passing.

## Task 2 Code Quality Review Fixes

- [x] Reproduce reported checksum TypeScript build failure
- [x] Add red tests for chunk-size validation, concat total mismatch, missing-range max guard, and canonical range encoding
- [x] Fix protocol primitive validation issues in `src/protocol/*`
- [x] Verify `npm test -- src/protocol` under Node 20.20.2
- [x] Verify `npm run build` under Node 20.20.2
- [x] Commit protocol fixes without task note files

Result: Code quality review fixes verified under Node 20.20.2. `npm test -- src/protocol` exited 0 with 4 files and 17 tests passing; `npm run build` exited 0 after TypeScript checks and Vite production build.

Task 2 review gate passed with no Critical or Important issues after `efedd49` (`fix: harden protocol primitive validation`).
