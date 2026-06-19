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
- [ ] Build the approved MVP
- [ ] Verify transfer behavior with repeatable tests
- [ ] Document results and remaining risks

## Review

- Design spec written at `docs/superpowers/specs/2026-06-19-qr-camera-file-transfer-design.md`.
- Spec self-review found no `TODO`, `TBD`, placeholder question marks, or obvious scope contradictions.
- Implementation plan written at `docs/superpowers/plans/2026-06-19-qr-camera-file-transfer-implementation.md`.
- Verification target for implementation: `npm test`, `npm run build`, and manual two-device QR transfer.
