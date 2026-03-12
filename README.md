# CommitState

Commit status lifecycle (`pending` → `success`/`failure`) in a single GitHub Action call.

Replace 3 boilerplate jobs (~50 lines) with 1 step (~10 lines).

## How It Works

```
pre.js  → Sets "pending" status immediately
main.js → Saves state (no-op)
post.js → Sets "success" or "failure" based on needs-result
          (post-if: always() → runs even if job fails)
```

## Quick Start

```yaml
report_status:
  runs-on: ubuntu-latest
  needs: [build]
  if: always()
  steps:
    - uses: izagood/commitstate@v1
      with:
        sha: ${{ github.event.client_payload.sha }}
        token: ${{ secrets.GIT_PAT }}
        owner: my-org
        repo: my-repo
        context: 'CI Status'
        needs-result: ${{ needs.build.result }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `token` | **Yes** | — | GitHub token. Cross-repo requires PAT with `repo:status` scope |
| `sha` | **Yes** | — | Commit SHA to set status on |
| `owner` | No | Current repo owner | Target repository owner |
| `repo` | No | Current repo name | Target repository name |
| `context` | No | `commitstate` | Status check label |
| `description-pending` | No | `Build is running...` | Description for pending status |
| `description-success` | No | `Build succeeded` | Description for success status |
| `description-failure` | No | `Build failed` | Description for failure status |
| `target-url` | No | Current workflow run URL | URL linked from the status |
| `needs-result` | No | — | Dependent job result(s) |

## Usage Patterns

### Wrapper Job (Recommended)

Use when your CI runs in a separate job (e.g., reusable workflow):

```yaml
jobs:
  ci:
    uses: ./.github/workflows/reusable-ci.yml

  report_status:
    runs-on: ubuntu-latest
    needs: [ci]
    if: always()
    steps:
      - uses: izagood/commitstate@v1
        with:
          sha: ${{ github.event.client_payload.sha }}
          token: ${{ secrets.GIT_PAT }}
          owner: target-org
          repo: target-repo
          context: 'Cross-Repo CI'
          needs-result: ${{ needs.ci.result }}
```

### Multiple Dependencies

```yaml
report_status:
  runs-on: ubuntu-latest
  needs: [lint, test, build]
  if: always()
  steps:
    - uses: izagood/commitstate@v1
      with:
        sha: ${{ github.event.client_payload.sha }}
        token: ${{ secrets.GIT_PAT }}
        context: 'Full CI'
        needs-result: ${{ join(needs.*.result, ',') }}
```

All dependent jobs must be `success` or `skipped` for the final status to be `success`. Any `failure` or `cancelled` results in `failure`.

### Same Job (Escape Hatch)

When running in the same job as your CI steps, use the `COMMITSTATE_FAILURE` env var:

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: izagood/commitstate@v1
        with:
          sha: ${{ github.sha }}
          token: ${{ secrets.GITHUB_TOKEN }}
          context: 'CI'

      - name: Run tests
        run: npm test

      # If a step fails, the post step uses main_completed state to detect failure
```

To explicitly signal failure mid-job:

```yaml
      - name: Custom check
        run: |
          if ! check_something; then
            echo "COMMITSTATE_FAILURE=true" >> $GITHUB_ENV
          fi
```

## Status Determination Logic

The post step determines the final status using this priority:

1. **`needs-result` input** — Parses comma-separated job results. All must be `success` or `skipped` for success.
2. **`COMMITSTATE_FAILURE` env var** — If set to `true`, reports failure.
3. **`main_completed` state** — If main step ran successfully, reports success; otherwise failure.

## Before / After

### Before (~50 lines, 3 jobs)

```yaml
set_pending:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/github-script@v7
      with:
        script: |
          await github.rest.repos.createCommitStatus({
            owner: 'org', repo: 'repo',
            sha: context.payload.client_payload.sha,
            state: 'pending', context: 'CI',
            description: 'Build is running...'
          })

run_ci:
  needs: [set_pending]
  uses: ./.github/workflows/ci.yml

report_success:
  needs: [run_ci]
  if: success()
  runs-on: ubuntu-latest
  steps:
    - uses: actions/github-script@v7
      with:
        script: # ... 10 lines

report_failure:
  needs: [run_ci]
  if: failure()
  runs-on: ubuntu-latest
  steps:
    - uses: actions/github-script@v7
      with:
        script: # ... 10 lines
```

### After (~10 lines, 1 job)

```yaml
report_status:
  runs-on: ubuntu-latest
  needs: [run_ci]
  if: always()
  steps:
    - uses: izagood/commitstate@v1
      with:
        sha: ${{ github.event.client_payload.sha }}
        token: ${{ secrets.GIT_PAT }}
        owner: org
        repo: repo
        context: 'CI'
        needs-result: ${{ needs.run_ci.result }}
```

## Token Permissions

| Scenario | Token | Required Scope |
|----------|-------|----------------|
| Same repo | `${{ secrets.GITHUB_TOKEN }}` | `statuses: write` (in permissions) |
| Cross repo | Personal Access Token (PAT) | `repo:status` |

For cross-repo `repository_dispatch` workflows, store the PAT as a repository secret.

## License

MIT
