The four Observability tools are reads: get_metrics, get_metric_monitors,
get_slos and get_synthetics_status. Metrics timeseries uses POST solely for the
read query contract. No definitions or alert state are changed. Missing
telemetry, no_data and partial results are preserved verbatim.

Desktop Locked mode requires explicit review and entries for each tool in
NANODAC_READ_TOOLS in nano-desktop/src-tauri/src/agent.rs. That file belongs to
another lane and was explicitly excluded from this task. These tools are not
implicitly permitted, and no wildcard approval is introduced.
