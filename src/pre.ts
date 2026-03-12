import * as core from '@actions/core';
import { getInputs, setCommitStatus } from './status-api';

async function run(): Promise<void> {
  try {
    const inputs = getInputs();

    await setCommitStatus({
      token: inputs.token,
      owner: inputs.owner,
      repo: inputs.repo,
      sha: inputs.sha,
      state: 'pending',
      context: inputs.context,
      description: inputs.descriptionPending,
      targetUrl: inputs.targetUrl,
    });
  } catch (error) {
    // pre 단계 실패는 job을 중단하지 않음 — warning만 출력
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to set pending status: ${message}`);
  }
}

run();
