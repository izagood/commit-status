# commit-status

Wrap any GitHub Action with automatic commit status lifecycle (`pending` → `success`/`failure`).

One step replaces manual pending/success/failure status management.

## How It Works

```
pre.js  → Sets "pending" commit status
main.js → Downloads and runs the wrapped action
post.js → Sets "success" or "failure" based on action result
          (post-if: always() → runs even if action fails)
```

## Quick Start

```yaml
steps:
  - uses: izagood/commit-status@v1
    with:
      action: some-org/build-action@v1
      with: '{"project": "my-app"}'
      sha: ${{ github.event.client_payload.sha }}
      token: ${{ secrets.GIT_PAT }}
      context: 'CI Build'
```

The commit status is automatically set to `pending` before the action runs, and `success` or `failure` after it completes.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `token` | **Yes** | — | GitHub token. Cross-repo requires PAT with `repo:status` scope |
| `sha` | **Yes** | — | Commit SHA to set status on |
| `action` | **Yes** | — | GitHub Action to wrap (e.g. `actions/checkout@v4`) |
| `with` | No | `'{}'` | JSON string of inputs to pass to the wrapped action |
| `owner` | No | Current repo owner | Target repository owner |
| `repo` | No | Current repo name | Target repository name |
| `context` | No | `commit-status` | Status check label |
| `description-pending` | No | `Build is running...` | Description for pending status |
| `description-success` | No | `Build succeeded` | Description for success status |
| `description-failure` | No | `Build failed` | Description for failure status |
| `target-url` | No | Current workflow run URL | URL linked from the status |

## Usage Examples

### Basic: Wrap a build action

```yaml
steps:
  - uses: izagood/commit-status@v1
    with:
      action: actions/github-script@v7
      with: '{"script": "console.log(\"hello\")"}'
      sha: ${{ github.sha }}
      token: ${{ secrets.GITHUB_TOKEN }}
      context: 'Build'
```

### Cross-repo status

```yaml
steps:
  - uses: izagood/commit-status@v1
    with:
      action: some-org/deploy-action@v2
      with: '{"environment": "staging"}'
      sha: ${{ github.event.client_payload.sha }}
      token: ${{ secrets.GIT_PAT }}
      owner: target-org
      repo: target-repo
      context: 'Deploy Staging'
```

### Wrap a composite action

```yaml
steps:
  - uses: izagood/commit-status@v1
    with:
      action: my-org/lint-action@main
      sha: ${{ github.sha }}
      token: ${{ secrets.GITHUB_TOKEN }}
      context: 'Lint'
```

## Supported Action Types

| Type | Supported | Notes |
|------|-----------|-------|
| Node.js (`node12`, `node16`, `node20`, `node24`) | Yes | Runs the `main` entry point |
| Composite (`composite`) | Yes | Runs shell `run` steps |
| Docker | No | Not yet supported |

> **Note**: Nested `uses` inside composite actions are not supported and will be skipped with a warning.

## Token Permissions

| Scenario | Token | Required Scope |
|----------|-------|----------------|
| Same repo | `${{ secrets.GITHUB_TOKEN }}` | `statuses: write` (in permissions) |
| Cross repo | Personal Access Token (PAT) | `repo:status` |

For cross-repo `repository_dispatch` workflows, store the PAT as a repository secret.

## License

MIT
