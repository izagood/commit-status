import * as core from '@actions/core';
import { getInputs } from './status-api';
import { runAction } from './action-runner';

async function run(): Promise<void> {
  const inputs = getInputs();

  core.info(`commit-status: wrapping action '${inputs.action}'`);

  const result = await runAction(inputs.token, inputs.action, inputs.actionWith);

  core.saveState('action_succeeded', result.succeeded ? 'true' : 'false');

  if (!result.succeeded) {
    core.warning(`Wrapped action failed: ${result.error}`);
  }
}

run();
