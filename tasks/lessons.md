# Lessons

- When introducing a tool or workflow term to the user, define it in plain language before asking for a decision. Avoid shorthand like "visual companion" without explaining what the user will see and why it helps.
- When scaffolding a Vite project, declare the supported Node runtime and ignore generated artifacts in the first scaffold commit so install/build output does not pollute follow-up work.
- When parsing compact protocol strings, validate the textual grammar before numeric conversion so empty fields, extra separators, and malformed tokens cannot be normalized into valid values.
- When using Web Crypto with TypeScript 6 typed arrays, pass a BufferSource with an `ArrayBuffer`-backed copy and run `npm run build`; runtime tests alone can miss BufferSource type narrowing issues.
- When hardening protocol decoders, validate cross-field invariants and canonical encodings too; independent field validation can still admit impossible packets or normalized alternate wire forms.
- When implementing QR transfer state, test the actual looped stream shape: repeated identical manifests must be idempotent, conflicting manifests must be rejected, and verification-failure NACKs must request actionable repair chunks.
- When wrapping browser hardware APIs, classify environmental failures separately from unsupported capability; mobile LAN HTTP can hide camera APIs because the context is insecure, and UI code needs actionable error codes.
- When guarding async UI lifecycles, a run token is not enough by itself; stale continuations must clean up only the resources they own, and async result writers need a version check after every awaited boundary.
- For camera-to-screen workflows, file selection must only prepare a transfer, not start optical transmission; add an explicit or QR-confirmed readiness phase so both devices can be physically aligned before data frames move.
- Model bidirectional QR transfer like HTTP request/response, not broadcast streaming: the receiver should request chunk ranges and the sender should only emit data frames in response to the latest matching request.
- For mobile camera-to-screen tools, treat camera preview and outgoing QR as a single first-screen workspace; avoid stacking them as separate full-width sections because the physical workflow requires seeing both at once.
