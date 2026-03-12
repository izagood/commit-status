import * as core from '@actions/core';
import { getInputs, setCommitStatus } from './status-api';

async function run(): Promise<void> {
  try {
    const inputs = getInputs();

    const actionSucceeded = core.getState('action_succeeded') === 'true';
    core.info(`Wrapped action result: ${actionSucceeded ? 'success' : 'failure'}`);

    const state = actionSucceeded ? 'success' : 'failure';
    const description = actionSucceeded
      ? inputs.descriptionSuccess
      : inputs.descriptionFailure;

    await setCommitStatus({
      token: inputs.token,
      owner: inputs.owner,
      repo: inputs.repo,
      sha: inputs.sha,
      state,
      context: inputs.context,
      description,
      targetUrl: inputs.targetUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Failed to set final commit status: ${message}`);
  }
}

run();
