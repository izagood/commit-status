import * as core from '@actions/core';

function run(): void {
  core.saveState('main_completed', 'true');
  core.info('CommitState: main step completed. Final status will be set in post step.');
}

run();
