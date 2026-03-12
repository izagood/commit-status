import * as core from '@actions/core';
import * as github from '@actions/github';

export type CommitState = 'pending' | 'success' | 'failure' | 'error';

export interface StatusInputs {
  token: string;
  sha: string;
  owner: string;
  repo: string;
  context: string;
  descriptionPending: string;
  descriptionSuccess: string;
  descriptionFailure: string;
  targetUrl: string;
  action: string;
  actionWith: Record<string, string>;
}

export function getInputs(): StatusInputs {
  const [defaultOwner, defaultRepo] = (
    process.env['GITHUB_REPOSITORY'] ?? '/'
  ).split('/');

  const targetUrl =
    core.getInput('target-url') ||
    `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`;

  let actionWith: Record<string, string> = {};
  const withInput = core.getInput('with');
  if (withInput) {
    try {
      actionWith = JSON.parse(withInput);
    } catch {
      throw new Error(`Invalid JSON in 'with' input: ${withInput}`);
    }
  }

  return {
    token: core.getInput('token', { required: true }),
    sha: core.getInput('sha', { required: true }),
    owner: core.getInput('owner') || defaultOwner,
    repo: core.getInput('repo') || defaultRepo,
    context: core.getInput('context') || 'commit-status',
    descriptionPending: core.getInput('description-pending') || 'Build is running...',
    descriptionSuccess: core.getInput('description-success') || 'Build succeeded',
    descriptionFailure: core.getInput('description-failure') || 'Build failed',
    targetUrl,
    action: core.getInput('action', { required: true }),
    actionWith,
  };
}

export async function setCommitStatus(params: {
  token: string;
  owner: string;
  repo: string;
  sha: string;
  state: CommitState;
  context: string;
  description: string;
  targetUrl: string;
}): Promise<void> {
  const octokit = github.getOctokit(params.token);

  await octokit.rest.repos.createCommitStatus({
    owner: params.owner,
    repo: params.repo,
    sha: params.sha,
    state: params.state,
    context: params.context,
    description: params.description,
    target_url: params.targetUrl,
  });

  core.info(
    `Set commit status: ${params.state} on ${params.owner}/${params.repo}@${params.sha.substring(0, 7)} [${params.context}]`
  );
}
