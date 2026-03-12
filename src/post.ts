import * as core from '@actions/core';
import { getInputs, setCommitStatus } from './status-api';

async function run(): Promise<void> {
  try {
    const inputs = getInputs();

    // 상태 결정 우선순위:
    // 1. needs-result 입력이 있으면 → 파싱하여 판단
    // 2. COMMITSTATE_FAILURE 환경변수 → 명시적 실패 (같은 job 내 escape hatch)
    // 3. core.getState('main_completed') → main 실행 여부로 판단
    let jobSucceeded: boolean;

    if (inputs.needsResult) {
      const results = inputs.needsResult.split(',').map((r) => r.trim());
      jobSucceeded = results.every((r) => r === 'success' || r === 'skipped');
      core.info(`Determined status from needs-result: [${results.join(', ')}] → ${jobSucceeded ? 'success' : 'failure'}`);
    } else if (process.env['COMMITSTATE_FAILURE'] === 'true') {
      jobSucceeded = false;
      core.info('Determined status from COMMITSTATE_FAILURE env: failure');
    } else {
      jobSucceeded = core.getState('main_completed') === 'true';
      core.info(`Determined status from main_completed state: ${jobSucceeded ? 'success' : 'failure'}`);
    }

    const state = jobSucceeded ? 'success' : 'failure';
    const description = jobSucceeded
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
