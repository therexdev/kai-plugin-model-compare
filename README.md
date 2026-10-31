# KAI Model Compare — Foundation plugin

Version 0.3.1 uses plugin API 3. Use KAI Core Beta 0.7.9 or later for the matching model queue and cancellation fixes.

The plugin owns the blind A/B interface, comparison coordination, streaming transport, timings, prompt presets, reveal/vote controls, and saved voting scores. Core provides model discovery and inference through the same public API available to other plugin developers. No comparison controller or feature-specific route remains required in Core.

Installed local models and eligible available network models appear as explicit choices. Network availability comes from the Core network model catalog, including its provider eligibility rules; having a model installed locally does not advertise it as a network model. Paid calls use Core's reviewed credit service. Local streams display as they arrive; a credit service returning a completed response is presented after completion.

Comparison replies use the selected length limit (512–4,096 tokens, default 1,024). The interface distinguishes preparing/waiting from tokens actually arriving. Stop cancels only this comparison, including a request waiting behind another app; starting another comparison retries normally.

Scores live in this plugin's Foundation storage. This version does not migrate or delete original-app data. Its service remains available while KAI runs in the foreground or tray and is revoked when disabled, updated or quit.

**Trust:** this version uses the native runtime and explicitly grants full computer and application access at installation. The interface remains sandboxed. Signatures establish publisher identity and integrity, not a code audit.

## Public integration

The manifest provides `kai.model-compare` with `request`, `poll`, and `cancel` methods. Requests use `{path,method,body,requestId}`; streams are owned and bounded by this plugin. Only model listing, network status/eligibility and inference operations are accepted. No remote rental endpoint is exposed.

The native entry is `plugin/service/index.js`, exporting `create(api)`. No npm runtime dependencies are needed. Run `npm test`, package the `plugin` directory with the Foundation packer, and run `node scripts/verify-package.js` after signing. Keep publisher keys outside the repository.

Tests cover comparison validation/history, the renderer and native service together, first-token delays and gaps between tokens, cancellation before response headers and while streaming, retries, engine error frames, and rejection of unrelated operations.

For the shared local runtime integration check, set `KAI_CORE_SOURCE` and `KAI_DOCUMENTS_SOURCE` to their source checkouts and run `node scripts/test-inference-integration.cjs`. It exercises the real Core Foundation API, HTTP gateway, runtime queue, both native plugin services and renderer bridges with disposable profiles and a synthetic HTTP model. It verifies FIFO operation, cancelling either queued plugin without interrupting the other, and cancellation during preparation without an orphan model launch. Real model output, hardware performance and network credits require separate device verification.

## Foundation package publication

Requires KAI Core **0.7.0 or later**, manifest schema 2/API 3 and native API v1. Source lives in `plugin/`, including its service and all runtime dependencies. Runtime installation never runs npm or dependency hooks.

Before signing, install any author dependencies with `npm ci --ignore-scripts` when this repository has a lockfile, run `npm run build --if-present`, then `node scripts/verify-package.js --source` and `npm test`. The source-only check uses a temporary in-memory test signature; it does not claim a publisher release was signed.

Pack the complete plugin using Core's `scripts/core/pack-plugin.js`, keeping the publisher private key outside every repository. Place the new immutable signed asset at `dist/<repository-name>-<manifest-version>.kaiplugin`, then run `node scripts/verify-package.js`. The release verifier checks the actual publisher signature and exact source/assets/dependency contents against the same package rules as Core. Its standalone format snapshot and SHA-256 provenance are under `scripts/package-format-v3*`; it never imports or executes submitted plugin code.

CI tests source on `foundation-v1`, pull requests and `main` on Windows, macOS and Linux. It checks any signed asset present for the current version. Publication runs only from `main`, only when that exact signed asset exists, and only after every check passes. Existing release assets must match byte-for-byte and are never overwritten. Branch builds cannot publish releases. Native device/integration checks remain necessary before a release; unit tests do not replace them.
