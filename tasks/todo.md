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
- [x] Implement Task 3 packet codec and file manifest
  - [x] Add packet codec tests and confirm they fail before implementation
  - [x] Implement packet encoding/decoding with strict QR input validation
  - [x] Add file manifest tests and confirm they fail before implementation
  - [x] Implement manifest helpers with strict chunk-size and MVP file-limit checks
  - [x] Verify targeted Task 3 tests, full protocol tests, and production build under Node 20.20.2
  - [x] Commit Task 3 protocol files
- [x] Fix Task 3 code quality review issues
  - [x] Add red tests for manifest chunk invariants, zero-byte policy, canonical payloads, NACK syntax-only validation, transfer IDs, and metadata hygiene
  - [x] Add shared protocol validation for transfer IDs, file names, MIME types, chunk count consistency, and NACK range syntax
  - [x] Apply shared validation in packet decode and manifest creation
  - [x] Verify targeted Task 3 tests, full protocol tests, and production build under Node 20.20.2
  - [x] Commit protocol changes only with `fix: harden packet manifest validation`
  - [x] Spec compliance review passed
  - [x] Code quality re-review passed with no Critical, Important, or Minor issues
- [x] Implement Task 4 sender and receiver transfer state
  - [x] Review current protocol constraints from Task 3
  - [x] Add sender transfer tests and confirm RED
  - [x] Implement sender preparation and bounded repair packet selection
  - [x] Add receiver transfer tests and confirm RED
  - [x] Implement receiver ingest, progress, verification, and file output
  - [x] Verify `npm test -- src/transfer` under Node 20.20.2
  - [x] Verify `npm test -- src/protocol src/transfer` under Node 20.20.2
  - [x] Verify `npm run build` under Node 20.20.2
  - [x] Commit Task 4 transfer files
  - [x] Spec compliance review passed
  - [x] Code quality re-review passed after repeated manifest fix
- [x] Implement Task 5 QR display and scanner adapters
  - [x] Add QR display test and confirm RED
  - [x] Implement QR display data URL adapter
  - [x] Add QR scanner tests and confirm RED
  - [x] Implement QR scanner decode, camera, stop, and capture adapters
  - [x] Verify QR, protocol, transfer tests, and production build under Node 20.20.2
  - [x] Commit Task 5 QR adapter files
- [x] Fix Task 5 camera access error classification
  - [x] Add RED tests for jsQR call arguments, camera constraints, classified camera failures, and capture branches
  - [x] Implement typed camera error model and `getUserMedia` failure mapping
  - [x] Verify QR, protocol, transfer tests, and production build under Node 20.20.2
  - [x] Commit camera error classification fix
- [x] Implement Task 6 React sender and receiver UI
  - [x] Add App UI tests and confirm RED
  - [x] Replace app shell with home, sender, and receiver modes
  - [x] Wire sender file preparation, QR streaming, ACK completion, and NACK repair selection with `selectRepairPacketsForNack`
  - [x] Wire receiver camera start/stop, scan loop, verification QR, and verified download URL
  - [x] Map `CameraAccessError.code` values to actionable UI messages
  - [x] Expand responsive UI styles
  - [x] Verify `npm test -- src/App.test.tsx`, `npm test`, and `npm run build` under Node 20.20.2
  - [x] Commit Task 6 UI changes
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
- Task 3 packet codec and file manifest committed as `b770425` (`feat: encode QR transfer packets`). Red checks observed missing `packetCodec` and `fileManifest` modules before implementation. Final verification under Node 20.20.2: `npm test -- src/protocol/packetCodec.test.ts src/protocol/fileManifest.test.ts` exited 0 with 2 files and 18 tests passing; `npm test -- src/protocol` exited 0 with 6 files and 35 tests passing; `npm run build` exited 0.
- Task 3 code quality review fixes committed as `eff9cef` (`fix: harden packet manifest validation`). Red check showed 10 intended failures across packet and manifest tests. Final verification under Node 20.20.2: `npm test -- src/protocol/packetCodec.test.ts src/protocol/fileManifest.test.ts` exited 0 with 2 files and 27 tests passing; `npm test -- src/protocol` exited 0 with 6 files and 44 tests passing; `npm run build` exited 0.
- Task 3 review gate passed after `eff9cef`; code quality re-review found no remaining Critical, Important, or Minor issues. Carry-forward for Task 4: validate decoded NACK indexes against the active transfer before selecting repair chunks.
- Task 4 sender/receiver transfer state: RED check under Node 20.20.2 showed missing `sender` and `receiver` modules before implementation. Final verification under Node 20.20.2: `npm test -- src/transfer` exited 0 with 2 files and 8 tests passing; `npm test -- src/protocol src/transfer` exited 0 with 8 files and 52 tests passing; `npm run build` exited 0.
- Task 4 self-review: sender repair selection bounds NACK expansion by `manifest.totalChunks`; receiver rejects active-transfer mismatches without storing chunks; complete hash mismatch returns NACK with empty `missingRanges`; `buildVerifiedFile` only returns bytes after ACK verification.
- Task 5 QR display and scanner adapters committed as `37ba393` (`feat: add QR display and scanner adapters`). RED checks observed missing `qrDisplay` and `qrScanner` modules before implementation. Final verification under Node 20.20.2: `npm test -- src/qr` exited 0 with 2 files and 5 tests passing; `npm test -- src/protocol src/transfer src/qr` exited 0 with 10 files and 64 tests passing; `npm run build` exited 0; extra full `npm test` exited 0 with 10 files and 64 tests passing.
- Task 5 self-review: QR display uses the requested low error-correction, margin, and scale settings; scanner decode returns payload data or `null`; camera stream lifecycle stays in `src/qr`; stop logic stops every track; capture rejects zero-size frames and reads from a 2D canvas.
- Task 5 camera access review fix: RED check showed 4 expected QR scanner failures before implementation. Final verification under Node 20.20.2: `npm test -- src/qr` exited 0 with 2 files and 15 tests passing; `npm test -- src/protocol src/transfer src/qr` exited 0 with 10 files and 74 tests passing; `npm run build` exited 0.
- Task 6 React UI committed as `604a701` (`feat: add QR transfer UI`). RED check under Node 20.20.2 showed 4 expected App test failures before implementation: missing `Send`/`Receive` buttons, missing sender/receiver controls, and missing camera error helper. Final verification under Node 20.20.2: `npm test -- src/App.test.tsx` exited 0 with 1 file and 4 tests passing; `npm test` exited 0 with 11 files and 78 tests passing; `npm run build` exited 0.
- Task 6 self-review: sender validates ACK transfer ID and SHA-256, uses `selectRepairPacketsForNack` for NACK repair frames, and stops streaming on completion; receiver maps `CameraAccessError.code` to actionable messages, stops camera tracks and scan timers on cleanup, revokes verified-file object URLs, and only creates the download link after ACK verification.

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

## Task 4 Code Quality Review

- [x] Inspect `96562c1..0865b4e` diff and changed transfer files
- [x] Check sender repair packet selection for bounded expansion and context validation
- [x] Check receiver repeated manifest handling, rejection accounting, NACK behavior, verification, and build output flow
- [x] Run targeted tests/build for transfer state changes
- [x] Record review findings and readiness assessment

Result: Task 4 code quality review found one Critical issue and multiple Important follow-ups. Verification still passed under Node 20.20.2: `npm test -- src/transfer` exited 0 with 2 files and 8 tests passing; `npm test -- src/protocol src/transfer` exited 0 with 8 files and 52 tests passing; `npm run build` exited 0. Readiness: not ready for Task 5 until repeated manifest handling is fixed.

## Task 4 Fix Re-review

- [x] Inspect `2fe963d` fix diff and current transfer files
- [x] Verify repeated manifest, conflicting manifest, hash mismatch, NACK transfer ID, looped stream, and repair regression coverage
- [x] Run protocol/transfer tests and production build under Node 20.20.2
- [x] Record re-review findings and Task 5 readiness

Result: Task 4 fix re-review passed with no Critical or Important findings. Remaining note: Task 6 should use `selectRepairPacketsForNack` rather than the string-only helper. Verification under Node 20.20.2: `npm test -- src/protocol src/transfer && npm run build` exited 0 with 8 test files and 59 tests passing, followed by a successful production build. Readiness: ready for Task 5.

## Task 4 Code Quality Review Fixes

- [x] Add RED tests for repeated manifests, conflicting manifests, actionable verification-failure NACKs, NACK transfer ID validation, and repair loops
- [x] Preserve receiver progress across identical repeated manifests
- [x] Reject conflicting manifests without switching transfers
- [x] Request all chunks when hash verification or reassembly fails
- [x] Add sender NACK-aware repair selection with transfer ID validation
- [x] Verify `npm test -- src/transfer` under Node 20.20.2
- [x] Verify `npm test -- src/protocol src/transfer` under Node 20.20.2
- [x] Verify `npm run build` under Node 20.20.2

Result: Task 4 review fixes verified under Node 20.20.2. RED checks showed 8 intended transfer test failures before implementation. Final verification: `npm test -- src/transfer` exited 0 with 2 files and 15 tests passing; `npm test -- src/protocol src/transfer` exited 0 with 8 files and 59 tests passing; `npm run build` exited 0.

Task 4 review gate passed after `2fe963d`; no Critical or Important findings remain. Carry-forward for Task 6: use `selectRepairPacketsForNack` for receiver NACK handling.
