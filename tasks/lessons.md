# Lessons

- When introducing a tool or workflow term to the user, define it in plain language before asking for a decision. Avoid shorthand like "visual companion" without explaining what the user will see and why it helps.
- When scaffolding a Vite project, declare the supported Node runtime and ignore generated artifacts in the first scaffold commit so install/build output does not pollute follow-up work.
- When parsing compact protocol strings, validate the textual grammar before numeric conversion so empty fields, extra separators, and malformed tokens cannot be normalized into valid values.
- When using Web Crypto with TypeScript 6 typed arrays, pass a BufferSource with an `ArrayBuffer`-backed copy and run `npm run build`; runtime tests alone can miss BufferSource type narrowing issues.
- When hardening protocol decoders, validate cross-field invariants and canonical encodings too; independent field validation can still admit impossible packets or normalized alternate wire forms.
- When implementing QR transfer state, test the actual looped stream shape: repeated identical manifests must be idempotent, conflicting manifests must be rejected, and verification-failure NACKs must request actionable repair chunks.
