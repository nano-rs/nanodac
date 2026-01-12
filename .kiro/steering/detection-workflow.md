# NanoDaC Detection Workflow

This steering file defines the required workflow for creating new detections.

## MANDATORY: New Detection Workflow

When the user asks to create, build, or write a new detection, you MUST follow these steps IN ORDER using the nanodac MCP tools. Do NOT skip steps.

### Phase 1: Setup (REQUIRED - Do these FIRST)

**Step 1: Sync Repository** ← START HERE, DO NOT SKIP
```
Call tool: sync_repo
```
This ensures you have the latest detections before creating a new one.

**Step 2: Create GitHub Issue**
```
Call tool: create_issue
  - title: "New Detection: <brief description>"
  - body: "<description of what to detect>"
  - labels: ["detection"]
```
IMPORTANT: Only use the "detection" label. Do not add other labels.
SAVE the issue number from the response for Step 9.

**Step 3: Create Feature Branch**
```
Call tool: create_branch
  - branch_name: "detect/<kebab-case-name>"
```

### Phase 2: Detection Development

**Step 4: Get Schema Reference**
```
Call tool: get_schema
```
Review the detection file format.

**Step 5: Generate Detection Content**
Create YAML frontmatter + query following the schema.

**Step 6: Write Detection File**
```
Call tool: write_detection_file
  - filename: "<category>/<detection_name>.yaml"
  - content: <the complete detection>
```

**Step 7: Validate and Test**
```
Call tool: validate_detection (with the content)
Call tool: test_detection (with the file path, days=7)
```

### STOP HERE - Ask User for Approval

Present results and ask: "Ready to create PR? (yes/no)"

### Phase 3: Submit (Only after user says yes)

**Step 8: Commit and Push**
```
Call tool: commit_and_push
  - message: "feat(detection): add <threat description>"
  - files: ["detections/<path>"]
```

**Step 9: Create Pull Request**
```
Call tool: create_pull_request
  - title: "feat(detection): <brief description>"
  - body: "## Summary\n<what it detects>\n\nCloses #<issue_number>"
  - labels: ["detection"]
```
IMPORTANT: Only use the "detection" label for PRs.

Report the PR URL to the user. The issue will auto-close when PR merges.

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
