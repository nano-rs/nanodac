# nanodac - Detection-as-Code for NanoSIEM

nanodac brings GitOps workflows to security detection engineering. Write detection rules as YAML files, validate them in CI/CD, and deploy them to NanoSIEM with peer review and version control.

## Why Detection-as-Code?

- **Version Control** - Track every change to detection logic with git history
- **Peer Review** - Require pull request approval before rules go live
- **CI/CD Automation** - Validate and deploy detections automatically
- **IDE Integration** - Write rules with AI assistance in Cursor/Kiro via MCP
- **Reproducibility** - Environment parity with infrastructure-as-code practices
- **Rollback** - Instant recovery by reverting commits

## Quick Start

```bash
# Initialize a new detection repository
npx nanodac init

# Validate all detection files
npx nanodac validate

# Test a detection against historical data
npx nanodac test detections/brute_force_ssh.yaml

# Preview changes before deploying
npx nanodac sync --dry-run

# Deploy to NanoSIEM
npx nanodac sync
```

## Installation

```bash
# Using npm
npm install -g @nanodac/cli

# Or use npx without installing
npx nanodac <command>
```

## Detection File Format

Detection files use YAML frontmatter with the query in the document body:

```yaml
---
title: brute_force_ssh
description: Detects SSH brute force attempts from a single source IP
author: security-team
severity: high
mode: staging
detection_mode: scheduled
schedule: "*/5 * * * *"
lookback: 15m
mitre_tactics: TA0006
mitre_techniques: T1110
risk_score: auto
risk_entity: src_endpoint.ip
tags:
  - authentication
  - brute_force

ai_triage_hints:
  ignore_when:
    - "Source IP is a known security scanner"
    - "User is a service account with expected auth patterns"
  suspicious_when:
    - "Multiple usernames targeted from same IP"
    - "Activity occurs outside business hours"
  context: "SSH brute force can trigger on legitimate password recovery attempts. Check if user recently requested password reset."
---
metadata.log_source=ssh_logs
  | where status_id=2
  | stats count() as attempts,
          values(user.name) as targeted_users,
          min(time) as first_attempt,
          max(time) as last_attempt
    by src_endpoint.ip
  | where attempts > 10
```

## Configuration

Create `nanodac.config.yaml` in your repository root:

```yaml
# NanoSIEM API endpoint
apiUrl: https://nanosiem.example.com:3001

# Search service endpoint (optional, defaults to apiUrl)
searchUrl: https://nanosiem.example.com:3002

# Directory containing detection files
detectionsDir: ./detections

# Default values for new rules
defaults:
  severity: medium
  mode: staging
  detection_mode: scheduled
```

Set your API key via environment variable:

```bash
export NANOSIEM_API_KEY=your-api-key-here
```

### Required API Key Permissions

Your API key needs the following NanoSIEM permissions depending on which features you use:

| Permission | Required for | Commands / Tools |
|---|---|---|
| `detections:view` | List, get, test, validate, format, stats, matches | `test`, `diff`, `sync --dry-run`, most MCP tools |
| `detections:create` | Create rules, test ad-hoc queries | `sync` (create), `create_detection` |
| `detections:edit` | Update existing rules | `sync` (update), `update_detection` |
| `detections:promote` | Promote, demote, pause, resume, trigger | `promote_detection`, `demote_detection`, `trigger_detection` |
| `detections:delete` | Delete rules | `sync --delete-orphans` |
| `detections:export` | Export all rules | `exportRules` client method |
| `rule_repositories:view` | Browse external rule repos | `list_repositories`, `browse_repository` |
| `rule_repositories:import` | Import rules from repos | `import_rule` |

**Minimum for CLI usage:** `detections:view` + `detections:create` + `detections:edit`

**Full access (recommended):** All `detections:*` permissions + `rule_repositories:view` + `rule_repositories:import`

## CLI Commands

### `nanodac init`

Initialize a new detection repository with example files and configuration.

```bash
nanodac init
nanodac init --directory ./my-detections
```

### `nanodac validate`

Validate detection files for syntax errors, schema compliance, and best practices.

```bash
# Validate all detections
nanodac validate

# Validate specific files
nanodac validate detections/malware/*.yaml

# Strict mode (treat warnings as errors)
nanodac validate --strict
```

**Validation checks:**
- YAML frontmatter syntax
- Required fields (title, severity, query)
- MITRE ATT&CK format (TA#### / T####)
- Cron expression validity
- Lookback period format

### `nanodac test`

Test a detection against historical data to see what it would match.

```bash
# Test with default 7-day lookback
nanodac test detections/brute_force_ssh.yaml

# Test last 24 hours
nanodac test detections/brute_force_ssh.yaml --hours 24

# Show all matching events (up to 1000)
nanodac test detections/brute_force_ssh.yaml --all

# Show specific fields only
nanodac test detections/brute_force_ssh.yaml --fields src_endpoint.ip,user,attempts

# Compact output format
nanodac test detections/brute_force_ssh.yaml --compact
```

### `nanodac diff`

Compare local detection files against what's deployed in NanoSIEM.

```bash
# Show summary of differences
nanodac diff

# Detailed diff output
nanodac diff --verbose
```

### `nanodac sync`

Deploy detection files to NanoSIEM.

```bash
# Preview changes without deploying
nanodac sync --dry-run

# Deploy changes
nanodac sync

# Skip confirmation prompts
nanodac sync --force

# Full sync - delete remote rules not in local files
nanodac sync --delete-orphans
```

## GitHub Actions Integration

Add detection validation and deployment to your CI/CD pipeline.

### Example Workflow

Create `.github/workflows/detection-sync.yml`:

```yaml
name: Detection Sync

on:
  push:
    branches: [main]
    paths: ['detections/**']
  pull_request:
    paths: ['detections/**']

jobs:
  validate:
    name: Validate Detections
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - name: Validate detections
        uses: ./.github/actions/nanodac
        with:
          nanosiem-url: ${{ secrets.NANOSIEM_URL }}
          api-key: ${{ secrets.NANOSIEM_API_KEY }}
          action: validate
          github-token: ${{ secrets.GITHUB_TOKEN }}

  deploy:
    name: Deploy Detections
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Deploy detections
        uses: ./.github/actions/nanodac
        with:
          nanosiem-url: ${{ secrets.NANOSIEM_URL }}
          api-key: ${{ secrets.NANOSIEM_API_KEY }}
          action: deploy
```

### Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `nanosiem-url` | NanoSIEM API URL | Yes | - |
| `api-key` | NanoSIEM API key | Yes | - |
| `search-url` | Search service URL | No | - |
| `detections-dir` | Detection files directory | No | `detections` |
| `action` | Action: `validate`, `deploy`, or `both` | No | `both` |
| `strict` | Treat warnings as errors | No | `false` |
| `dry-run` | Preview changes without deploying | No | `false` |
| `delete-orphans` | Delete orphaned remote detections | No | `false` |
| `github-token` | Token for PR comments | No | `github.token` |

### Action Outputs

| Output | Description |
|--------|-------------|
| `validation-result` | `valid` or `invalid` |
| `created-count` | Number of detections created |
| `updated-count` | Number of detections updated |
| `deleted-count` | Number of detections deleted |

## MCP Server for AI-Assisted Detection Writing

The nanodac MCP server integrates with AI coding assistants like Cursor and Kiro.

### Setup for Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "nanodac": {
      "command": "node",
      "args": ["/path/to/nanodac/packages/mcp-server/dist/index.js"],
      "env": {
        "NANOSIEM_API_URL": "https://nanosiem.example.com:3001",
        "NANOSIEM_SEARCH_URL": "https://nanosiem.example.com:3002",
        "NANOSIEM_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Setup for Kiro

Add to `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "nanodac": {
      "command": "node",
      "args": ["./nanodac/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_detections` | List all detections from NanoSIEM |
| `get_detection` | Get a single detection by ID or name |
| `create_detection` | Create a new detection from YAML content |
| `update_detection` | Update an existing detection |
| `validate_detection` | Validate detection syntax locally |
| `validate_query` | Server-side query validation (effective mode, field refs) |
| `test_detection` | Test query against historical data (supports grouped bucketing) |
| `promote_detection` | Promote rule lifecycle (staging -> live -> alerting) |
| `demote_detection` | Demote rule (alerting -> live) |
| `trigger_detection` | Manually trigger a rule to execute now |
| `search` | Execute ad-hoc search queries |
| `get_schema` | Read the strict OCSF 1.9 tenant catalog and detection file format |
| `get_hint_job` | Read async triage hint status and result |
| `create_issue` | Create a GitHub issue for tracking |
| `list_issues` | List GitHub issues in the repository |
| `create_branch` | Create a git branch for detection development |
| `write_detection_file` | Write detection YAML to disk |
| `commit_and_push` | Commit and push detection changes |
| `create_pull_request` | Create PR with issue linking |
| `list_repositories` | List external rule repositories (e.g., SigmaHQ) |
| `browse_repository` | Browse rules in an external repository |
| `import_rule` | Import a rule from an external repository |
| `get_coverage` | Detection coverage analysis |

### AI Prompts

The MCP server includes prompts for common detection engineering tasks:

- **new_detection_workflow** - Complete workflow from idea to PR (see below)
- **generate_detection** - Create a detection from a threat description
- **tune_detection** - Optimize a noisy detection
- **explain_detection** - Explain what a detection does

### AI-Driven Detection Workflow

Just say: **"Let's create a new detection for PowerShell encoded commands"**

The AI will automatically:
1. Create a GitHub issue to track the work
2. Create a feature branch (`detect/powershell-encoded-commands`)
3. Generate the detection with proper MITRE mappings and triage hints
4. Write the file to `detections/`
5. Validate syntax and test against historical data
6. **STOP and ask for your approval**

After you approve:
7. Commit and push the changes
8. Create a PR with "Closes #X" to link the issue
9. Add "awaiting-review" label

When the PR is merged, the linked issue closes automatically.

## Example Workflow: Peer-Reviewed Detection Changes

### 1. Create a feature branch

```bash
git checkout -b detect/lateral-movement-psexec
```

### 2. Write or modify detections

```yaml
# detections/lateral_movement/psexec_execution.yaml
---
title: psexec_remote_execution
description: Detects PsExec usage for lateral movement
author: jane.doe
severity: high
mode: staging
...
---
metadata.log_source=windows_security
  | where event_id=4688
  | where process.name CONTAINS "psexec"
  | stats count() by src_endpoint.hostname, dst_endpoint.hostname, user
```

### 3. Test locally

```bash
# Validate the detection
nanodac validate detections/lateral_movement/psexec_execution.yaml

# Test against historical data
nanodac test detections/lateral_movement/psexec_execution.yaml --days 14
```

### 4. Create a pull request

```bash
git add detections/lateral_movement/psexec_execution.yaml
git commit -m "feat(detection): add PsExec lateral movement detection"
git push -u origin detect/lateral-movement-psexec
```

### 5. CI validates the detection

The GitHub Action runs automatically:
- Validates YAML syntax and schema
- Tests query against NanoSIEM
- Posts results as PR comment

### 6. Team reviews and approves

Reviewers can:
- Check detection logic
- Verify MITRE mappings
- Suggest threshold adjustments
- Request additional context

### 7. Merge deploys to production

Once approved and merged to main:
- Detection is automatically deployed
- Starts in `staging` mode for bake-in
- Analyst can promote to `alerting` when ready

## Issue Tracking Integration

Track detection improvements with GitHub issues:

```bash
# Create an issue for a noisy detection
nanodac issue create --title "Tune brute_force_ssh detection" \
  --body "False positives from security scanners" \
  --labels detection,tuning

# List open detection issues
nanodac issue list --labels detection
```

Uses the GitHub CLI (`gh`) to create and manage issues in your repository.

## Directory Structure

Recommended repository layout:

```
detections/
├── authentication/
│   ├── brute_force_ssh.yaml
│   ├── failed_mfa.yaml
│   └── impossible_travel.yaml
├── lateral_movement/
│   ├── psexec_execution.yaml
│   └── wmi_process_creation.yaml
├── malware/
│   ├── known_bad_hashes.yaml
│   └── suspicious_powershell.yaml
└── data_exfiltration/
    ├── large_upload.yaml
    └── cloud_storage_access.yaml
nanodac.config.yaml
.github/
└── workflows/
    └── detection-sync.yml
```

## Best Practices

### Detection Naming

- Use snake_case for titles: `brute_force_ssh`, `lateral_movement_psexec`
- Group related detections in subdirectories
- Prefix experimental rules: `wip_` or `test_`

### Mode Progression

1. **staging** - New detections start here for silent monitoring
2. **live** - Promoted after bake-in period, generates signals
3. **alerting** - Full production, generates alerts and cases

### AI Triage Hints

Include `ai_triage_hints` to help analysts and AI systems:

```yaml
ai_triage_hints:
  ignore_when:
    - "Source is a known security tool"
    - "Activity is during maintenance window"
  suspicious_when:
    - "Multiple hosts affected simultaneously"
    - "Activity outside business hours"
  context: "Additional background for analysts investigating this alert."
```

### Testing Before Deployment

Always test detections against historical data:

```bash
# Check for excessive matches (potential false positives)
nanodac test detections/new_rule.yaml --days 30 --all | wc -l

# Review sample matches
nanodac test detections/new_rule.yaml --limit 10
```

## Packages

| Package | Description |
|---------|-------------|
| `@nanodac/core` | Schema, parser, validator, API client |
| `@nanodac/cli` | Command-line interface |
| `@nanodac/mcp-server` | MCP server for AI assistants |
| `@nanodac/github-action` | GitHub Action for CI/CD |

## License

MIT

## Lean lake contract

nanodac targets strict canonical OCSF 1.9.0 tenants and nPL over the lean logs dataset.
Content repositories default to `main`; legacy UDM content on `legacy/clickhouse` is unsupported.
`get_schema` reads the tenant field catalog. Use canonical paths such as `src_endpoint.ip`,
`user.name`, `process.cmd_line`, `time`, and `metadata.log_source` in queries.
Search counts with `total_count_exact: false` are lower bounds; preserve `has_more` and `next_offset`.
Real-time rules use the tenant's near-real-time scheduler, with no materialized views.
`generate_hints` starts an asynchronous metadata-based job; use `get_hint_job` for its result.
Standalone Sigma AI conversion is removed because its endpoint is unavailable on shared lean tenants.
Import curated nPL rules from the OCSF content repository instead.
