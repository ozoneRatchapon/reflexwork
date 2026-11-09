# 017 — Workspace clippy clean (housekeeping, 2026-11-10)

`cargo clippy --workspace --all-targets` printed 26 warnings outside the chatbot crates (reflex-wasm / pii-mask were already clean).
Rule: fix warnings before commit; remove truly unused code; no behaviour change.

## reflex-kernel
- [x] unused imports: `TaskCategory` (encoder.rs:15), `types::TaskSpec` (policy.rs:20)
- [x] mcp.rs: `JsonRpcResponse`, `JsonRpcError` never constructed; `McpClient.server_command/server_args` never read — check use, then delete or use
- [x] policy.rs:220 `needless_range_loop`
- [x] solana.rs:164 `Arc<DynSigner>` not Send+Sync (`arc_with_non_send_sync`) — Rc if single-threaded, else document
- [x] main.rs:235 `"help" | _` wildcard in or-pattern
- [x] the rest of the list (manual RangeInclusive::contains, too many arguments 8/7)

## programs/workflow-escrow (Anchor)
- [x] `unexpected_cfgs` from the `#[program]` macro (`anchor-debug`, `custom-heap`, `custom-panic`, `target_os = "solana"`): declare them in Cargo.toml (features + `[lints.rust] unexpected_cfgs check-cfg`)

## Done when
`cargo clippy --workspace --all-targets` = 0 warnings; `cargo test --workspace` unchanged.

## Result (2026-11-10)
0 warnings. Kept with a reason (an `allow` at the site): `arc_with_non_send_sync` (anchor-client requires `Arc<DynSigner>`), `too_many_arguments` on `submit_execution_proof` (the on-chain instruction interface). The MCP stdio transport is still a stub: its config fields now appear in the not-connected error; the unused response structs were deleted (re-add them with the transport). `cargo test --workspace`: same results as before.
