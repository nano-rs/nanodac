# NanoDaC - Detection-as-Code Instructions

This is a detection-as-code repository for NanoSIEM.

## When Creating New Detections

When the user asks to create, build, or write a new detection (e.g., "create a detection for X", "build a rule for Y", "I want to detect Z"), you MUST use the `new_detection_workflow` MCP prompt from the nanodac server.

**DO NOT** just generate the detection content directly. Instead:

1. Call the `new_detection_workflow` prompt with the threat description
2. Follow the full workflow which includes:
   - Syncing the repository
   - Creating a GitHub issue
   - Creating a feature branch
   - Generating and writing the detection file
   - Validating and testing
   - STOPPING for user approval
   - Then creating PR after approval

This ensures proper tracking, version control, and peer review.

## Available MCP Tools (nanodac server)

### Repository & Git
- `sync_repo` - Pull latest from main (stashes uncommitted changes)
- `create_branch` - Create and checkout a feature branch
- `get_current_branch` - Check current branch name
- `commit_and_push` - Commit files and push to remote

### Detection Management
- `list_detections` - List all detections from NanoSIEM
- `get_detection` - Get a specific detection by ID or name
- `create_detection` - Create detection via API (not file-based)
- `validate_detection` - Validate detection content locally
- `test_detection` - Test detection against historical data
- `write_detection_file` - Write detection YAML to detections/ folder

### GitHub
- `create_issue` - Create a GitHub issue for tracking
- `list_issues` - List open GitHub issues
- `create_pull_request` - Create PR for detection changes

### Query & Search
- `search` - Run ad-hoc search query against NanoSIEM
- `get_schema` - Get detection file schema reference

## Available MCP Prompts

- `new_detection_workflow` - **Use this for new detections** - Full workflow with issue, branch, file, validation, test, PR
- `generate_detection` - Generate detection content only (no git workflow)
- `tune_detection` - Suggest tuning to reduce false positives
- `explain_detection` - Explain a detection in plain English
- `suggest_hints` - Generate AI triage hints for a detection

## Detection File Location

New detection files should be placed in: `detections/<category>/<name>.yaml`

Categories include: malware, network, persistence, lateral_movement, exfiltration, etc.

## Environment Variables Required

The MCP server needs these environment variables:
- `NANOSIEM_API_URL` - NanoSIEM API URL
- `NANOSIEM_API_KEY` - API key for authentication
- `NANOSIEM_SEARCH_URL` - Search service URL (optional)
