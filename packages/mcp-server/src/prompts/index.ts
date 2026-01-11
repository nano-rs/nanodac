/**
 * MCP Prompts for AI-assisted detection writing
 */

/** Prompt definitions */
export const PROMPTS = [
  {
    name: 'new_detection_workflow',
    description: 'Complete workflow: create issue, branch, detection file, validate, test, and prepare for PR. Use this when creating a new detection from scratch.',
    arguments: [
      {
        name: 'threat_description',
        description: 'Description of what to detect (e.g., "PowerShell encoded commands", "brute force SSH attacks")',
        required: true,
      },
      {
        name: 'assignee',
        description: 'GitHub username to assign the issue/PR to',
        required: false,
      },
    ],
  },
  {
    name: 'generate_detection',
    description: 'Generate a detection rule from a threat description',
    arguments: [
      {
        name: 'threat_description',
        description: 'Description of the threat to detect',
        required: true,
      },
      {
        name: 'severity',
        description: 'Detection severity (critical, high, medium, low, informational)',
        required: false,
      },
      {
        name: 'data_sources',
        description: 'Available data sources (e.g., "Windows Event Logs, Proxy Logs")',
        required: false,
      },
    ],
  },
  {
    name: 'tune_detection',
    description: 'Suggest tuning for a detection to reduce false positives',
    arguments: [
      {
        name: 'detection_content',
        description: 'Current detection file content (YAML)',
        required: true,
      },
      {
        name: 'false_positive_patterns',
        description: 'Known false positive patterns observed',
        required: false,
      },
    ],
  },
  {
    name: 'explain_detection',
    description: 'Explain what a detection rule does in plain English',
    arguments: [
      {
        name: 'detection_content',
        description: 'Detection file content to explain',
        required: true,
      },
    ],
  },
  {
    name: 'suggest_hints',
    description: 'Suggest AI triage hints for a detection',
    arguments: [
      {
        name: 'detection_content',
        description: 'Detection file content',
        required: true,
      },
      {
        name: 'environment_context',
        description: 'Context about the environment (e.g., "Healthcare org with HIPAA compliance")',
        required: false,
      },
    ],
  },
];

/** Handle prompt requests */
export function handlePrompt(
  name: string,
  args: Record<string, string | undefined>
): { messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }> } {
  switch (name) {
    case 'new_detection_workflow':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: newDetectionWorkflowPrompt(args),
            },
          },
        ],
      };

    case 'generate_detection':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: generateDetectionPrompt(args),
            },
          },
        ],
      };

    case 'tune_detection':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: tuneDetectionPrompt(args),
            },
          },
        ],
      };

    case 'explain_detection':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: explainDetectionPrompt(args),
            },
          },
        ],
      };

    case 'suggest_hints':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: suggestHintsPrompt(args),
            },
          },
        ],
      };

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

function generateDetectionPrompt(args: Record<string, string | undefined>): string {
  return `Generate a NanoSIEM detection rule for the following threat:

## Threat Description
${args.threat_description || 'No description provided'}

## Requirements
- Use YAML frontmatter format with these fields: title, description, author, severity, mode, detection_mode, schedule, lookback, mitre_tactics, mitre_techniques, risk_score, risk_entity, tags, ai_triage_hints
- Use NanoSIEM's piped query syntax: source_type=X | command1 | command2
- Available commands: stats, where, timechart, table, sort, head, tail, prevalence, lookup
- Severity: ${args.severity || 'medium'}
- Detection mode: scheduled (for complex queries) or real-time (for simple filters)
- Include ai_triage_hints with ignore_when (benign patterns) and suspicious_when (true positive indicators)
${args.data_sources ? `\n## Available Data Sources\n${args.data_sources}` : ''}

## CRITICAL: Alert Output Must Be Actionable
Alerts must contain enough context for analysts to investigate WITHOUT needing to run additional queries.

BAD - Only stats output (analyst gets just numbers):
\`\`\`
source_type=auth | stats count() by src_ip | where count > 10
\`\`\`
Alert output: { src_ip: "10.1.1.5", count: 15 } - NOT USEFUL!

GOOD - Include contextual fields for investigation:
\`\`\`
source_type=auth
  | where action="failed"
  | stats count() as attempts,
          values(user) as targeted_users,
          values(dest_host) as targeted_hosts,
          min(timestamp) as first_seen,
          max(timestamp) as last_seen
    by src_ip
  | where attempts > 10
\`\`\`
Alert output includes: src_ip, attempt count, which users were targeted, which hosts, time range

ALWAYS include in stats aggregations:
- Time context: min(timestamp), max(timestamp) or first_seen/last_seen
- Target context: values(user), values(dest_ip), values(url), etc.
- Source context: values(src_host), values(process_name), etc.
- The specific artifacts that triggered the alert

## Format
\`\`\`yaml
---
title: snake_case_name
description: Brief description of what this detects
author: your_name
severity: medium
mode: staging
detection_mode: scheduled
schedule: "*/5 * * * *"
lookback: 15m
mitre_tactics: TAxxxx
mitre_techniques: Txxxx
risk_score: auto
risk_entity: auto-detect
tags:
  - category
ai_triage_hints:
  ignore_when:
    - "Benign condition 1"
    - "Benign condition 2"
  suspicious_when:
    - "Suspicious condition 1"
    - "Suspicious condition 2"
  context: "Additional context for analysts"
---
source_type=log_source
  | command1
  | command2
\`\`\`

Generate the detection:`;
}

function tuneDetectionPrompt(args: Record<string, string | undefined>): string {
  return `Tune this NanoSIEM detection to reduce false positives:

## Current Detection
\`\`\`yaml
${args.detection_content || 'No detection content provided'}
\`\`\`

## Known False Positive Patterns
${args.false_positive_patterns || 'Not specified - suggest common exclusions based on the detection type'}

## Tuning Options
1. Add exclusion conditions with \`where\` clauses (e.g., \`| where NOT src_ip IN ("10.1.1.50")\`)
2. Adjust thresholds in aggregation queries (e.g., increase count threshold)
3. Add prevalence filtering for rare artifacts (\`| prevalence domain < 5\`)
4. Update ai_triage_hints with ignore_when patterns for known benign activity
5. Adjust schedule or lookback for better context

## Guidelines
- Be specific with exclusions - use exact values when possible
- Preserve detection of actual threats - don't over-tune
- Consider time-based patterns (business hours vs after hours)
- Add comments explaining why each exclusion is added

Provide the tuned detection with explanations for each change:`;
}

function explainDetectionPrompt(args: Record<string, string | undefined>): string {
  return `Explain this NanoSIEM detection rule in plain English:

\`\`\`yaml
${args.detection_content || 'No detection content provided'}
\`\`\`

Provide:
1. **Plain English Summary** - What this detection is looking for
2. **MITRE ATT&CK Context** - What tactics and techniques this maps to and why
3. **Query Logic Breakdown** - Step by step explanation of what each part of the query does
4. **Potential False Positives** - Common scenarios that might trigger this detection incorrectly
5. **Tuning Opportunities** - Suggestions for reducing noise while maintaining detection coverage
6. **AI Triage Hints Analysis** - Explanation of the ignore_when and suspicious_when conditions`;
}

function newDetectionWorkflowPrompt(args: Record<string, string | undefined>): string {
  const threatDescription = args.threat_description || 'detection';
  const assignee = args.assignee;

  return `# New Detection Workflow

You are helping create a new detection for: **${threatDescription}**

Follow this workflow step by step. STOP after step 6 and wait for user approval before proceeding.

---

## Phase 1: Setup (Do these steps immediately)

### Step 1: Sync Repository
Use \`sync_repo\` tool to ensure we have the latest detections from main.
This will stash any uncommitted changes and pull the latest code.

### Step 2: Create GitHub Issue
Use \`create_issue\` tool with:
- title: "New Detection: ${threatDescription}"
- body: "Create detection for: ${threatDescription}\\n\\nStatus: In Development"
- labels: ["detection", "in-progress"]
${assignee ? `- assignee: "${assignee}"` : ''}

**Save the issue number from the response.**

### Step 3: Create Feature Branch
Use \`create_branch\` tool with:
- branch_name: "detect/<slug-from-threat-description>"
  (Convert threat description to kebab-case, e.g., "powershell-encoded-commands")

---

## Phase 2: Detection Development

### Step 4: Generate Detection Content
Create a detection file with:
- YAML frontmatter with all required fields
- Query using NanoSIEM piped syntax
- AI triage hints for analyst guidance
- Appropriate MITRE ATT&CK mappings

Use \`get_schema\` tool first if you need the format reference.

### Step 5: Write Detection File
Use \`write_detection_file\` tool with:
- filename: "<category>/<detection_name>.yaml"
  (e.g., "malware/encoded_powershell.yaml")
- content: The complete detection file

### Step 6: Validate and Test
1. Use \`validate_detection\` tool with the detection content
2. Use \`test_detection\` tool to test against historical data (7 days)

---

## STOP AND REPORT

Present the results to the user:
- Detection file content
- Validation results (any errors/warnings)
- Test results (number of matches, sample events)
- Any concerns or suggestions

Ask: "Ready to create PR? (yes/no)"

---

## Phase 3: Submit for Review (Only after user approval)

### Step 7: Commit and Push
Use \`commit_and_push\` tool with:
- message: "feat(detection): add ${threatDescription}"
- files: ["detections/<path-to-file>"]

### Step 8: Create Pull Request
Use \`create_pull_request\` tool with:
- title: "feat(detection): ${threatDescription}"
- body: Include:
  - What this detection does
  - MITRE ATT&CK mapping
  - Test results summary
  - "Closes #<issue_number>" to link the issue
- issue_number: The issue number from Step 2
- labels: ["detection", "awaiting-review"]

---

## Workflow Complete!

Report to user:
- PR URL
- Issue will automatically close when PR is merged
- Detection is ready for peer review

---

Now execute Phase 1 and Phase 2, then STOP and wait for user approval.`;
}

function suggestHintsPrompt(args: Record<string, string | undefined>): string {
  return `Suggest AI triage hints for this NanoSIEM detection:

## Detection
\`\`\`yaml
${args.detection_content || 'No detection content provided'}
\`\`\`

${args.environment_context ? `## Environment Context\n${args.environment_context}\n` : ''}

## AI Triage Hints Purpose
The ai_triage_hints help analysts quickly identify false positives (ignore_when) vs true positives (suspicious_when).

## Requirements
Generate hints in this format:
\`\`\`yaml
ai_triage_hints:
  ignore_when:
    - "Specific condition indicating benign activity"
    - "Another benign condition"
  suspicious_when:
    - "Specific condition indicating suspicious activity"
    - "Another suspicious condition"
  context: "Brief context about this detection and common false positive scenarios"
\`\`\`

## Guidelines
1. **Be Specific** - Use exact values, field names, and patterns
2. **ignore_when** (2-5 items):
   - Known automated processes or scheduled tasks
   - Expected behavior from specific users, hosts, or services
   - Common false positive patterns for this detection type
3. **suspicious_when** (2-5 items):
   - Unusual timing (after hours, weekends)
   - Anomalous source (unknown host, new user)
   - High volume or frequency
   - Indicators of compromise patterns
4. **context** - 1-2 sentences about common false positives and what to look for

Provide the ai_triage_hints section:`;
}
