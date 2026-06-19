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
