# NanoDac GitHub Action

Validate and deploy NanoSIEM detection rules via GitHub Actions.

## Features

- **Validate** detection files on pull requests
- **Deploy** detections on merge to main
- **PR Comments** with validation results
- **Dry-run** mode to preview changes
- **Delete orphans** option for full sync

## Usage

### Basic Workflow

```yaml
name: Detection Sync

on:
  push:
    branches: [main]
    paths: ['detections/**']
  pull_request:
    paths: ['detections/**']

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Sync detections
        uses: ./nanodac/packages/github-action
        with:
          nanosiem-url: ${{ secrets.NANOSIEM_URL }}
          api-key: ${{ secrets.NANOSIEM_API_KEY }}
          action: ${{ github.event_name == 'push' && 'both' || 'validate' }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `nanosiem-url` | NanoSIEM API URL | Yes | - |
| `api-key` | NanoSIEM API key | Yes | - |
| `search-url` | Search service URL | No | - |
| `detections-dir` | Directory containing detection files | No | `detections` |
| `action` | Action: `validate`, `deploy`, or `both` | No | `both` |
| `strict` | Treat warnings as errors | No | `false` |
| `dry-run` | Preview changes without deploying | No | `false` |
| `delete-orphans` | Delete remote detections not in local files | No | `false` |
| `github-token` | GitHub token for PR comments | No | `github.token` |

## Outputs

| Output | Description |
|--------|-------------|
| `validation-result` | `valid` or `invalid` |
| `created-count` | Number of detections created |
| `updated-count` | Number of detections updated |
| `deleted-count` | Number of detections deleted |

## Secrets

Add these secrets to your repository:

- `NANOSIEM_URL` - Your NanoSIEM API URL (e.g., `https://nanosiem.example.com:3000`)
- `NANOSIEM_API_KEY` - API key with detection permissions
- `NANOSIEM_SEARCH_URL` - (Optional) Search service URL

## PR Comments

When running on a pull request with `github-token` provided, the action posts a comment with validation results:

```
## Detection Validation Results

| Status | Count |
|--------|-------|
| ✅ Valid | 5 |
| ⚠️ Warnings | 1 |
| ❌ Errors | 0 |

### Warnings

**detections/risky_rule.yaml**
- ⚠️ mitre: No MITRE ATT&CK mappings specified
```

## Example Workflows

See `examples/workflows/` for complete workflow examples:

- `detection-sync.yml` - Basic validate on PR, deploy on merge
- `detection-pr-review.yml` - Detailed PR review with dry-run
- `detection-full-sync.yml` - Full sync with orphan deletion
