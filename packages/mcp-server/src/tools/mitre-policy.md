`get_mitre_coverage` is read-only and uses the caller's existing API key. It does
not change rule mappings or trigger a catalog sync. It is separate from
`get_coverage`, which measures repository deployability.

Desktop Locked mode uses an explicit allowlist in nano-desktop/src-tauri/src/agent.rs.
This new tool is not implicitly approved there. The owner of that file must
review and add `get_mitre_coverage` to NANODAC_READ_TOOLS before Locked clients
can invoke it; this PR deliberately does not widen any agent policy.
