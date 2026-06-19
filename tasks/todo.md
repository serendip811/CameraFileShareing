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

- [ ] Create implementation plan after spec approval
- [ ] Build the approved MVP
- [ ] Verify transfer behavior with repeatable tests
- [ ] Document results and remaining risks

## Review

- Design spec written at `docs/superpowers/specs/2026-06-19-qr-camera-file-transfer-design.md`.
- Spec self-review found no `TODO`, `TBD`, placeholder question marks, or obvious scope contradictions.
- Implementation remains pending until the spec is reviewed and approved.
