import * as core from '@actions/core';
import * as github from '@actions/github';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse as parseYaml } from 'yaml';

const execFileAsync = promisify(execFile);

interface ParsedActionRef {
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

interface ActionDefinition {
  name?: string;
  runs: {
    using: string;
    main?: string;
    steps?: CompositeStep[];
  };
  inputs?: Record<string, { default?: string }>;
}

interface CompositeStep {
  name?: string;
  run?: string;
  shell?: string;
  uses?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
}

export interface RunResult {
  succeeded: boolean;
  error?: string;
}

export function parseActionRef(actionInput: string): ParsedActionRef {
  // 형식: owner/repo@ref 또는 owner/repo/path@ref
  const atIndex = actionInput.lastIndexOf('@');
  if (atIndex === -1) {
    throw new Error(
      `Invalid action reference: '${actionInput}'. Expected format: owner/repo@ref or owner/repo/path@ref`
    );
  }

  const ref = actionInput.substring(atIndex + 1);
  const repoPath = actionInput.substring(0, atIndex);

  const parts = repoPath.split('/');
  if (parts.length < 2) {
    throw new Error(
      `Invalid action reference: '${actionInput}'. Must include owner/repo`
    );
  }

  const owner = parts[0];
  const repo = parts[1];
  const actionPath = parts.length > 2 ? parts.slice(2).join('/') : '';

  return { owner, repo, path: actionPath, ref };
}

async function downloadAction(
  token: string,
  parsed: ParsedActionRef
): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-status-action-'));
  const tarPath = path.join(tmpDir, 'action.tar.gz');

  const octokit = github.getOctokit(token);

  const { url } = await octokit.rest.repos.downloadTarballArchive({
    owner: parsed.owner,
    repo: parsed.repo,
    ref: parsed.ref,
    request: { redirect: 'manual' },
  });

  // url이 redirect URL인 경우 직접 다운로드
  const response = await fetch(url as string);
  if (!response.ok) {
    throw new Error(`Failed to download action tarball: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tarPath, buffer);

  // tarball 압축 해제
  const extractDir = path.join(tmpDir, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });
  await execFileAsync('tar', ['xzf', tarPath, '-C', extractDir, '--strip-components=1']);

  // action path가 있으면 하위 디렉토리 반환
  if (parsed.path) {
    const actionDir = path.join(extractDir, parsed.path);
    if (!fs.existsSync(actionDir)) {
      throw new Error(`Action path '${parsed.path}' not found in ${parsed.owner}/${parsed.repo}@${parsed.ref}`);
    }
    return actionDir;
  }

  return extractDir;
}

function readActionYml(actionDir: string): ActionDefinition {
  // action.yml 또는 action.yaml 파싱
  for (const name of ['action.yml', 'action.yaml']) {
    const filePath = path.join(actionDir, name);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return parseYaml(content) as ActionDefinition;
    }
  }
  throw new Error(`No action.yml or action.yaml found in ${actionDir}`);
}

function buildEnv(
  actionWith: Record<string, string>,
  actionDef: ActionDefinition,
  stepEnv?: Record<string, string>
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // action inputs의 기본값 적용
  if (actionDef.inputs) {
    for (const [key, config] of Object.entries(actionDef.inputs)) {
      if (config.default !== undefined && config.default !== '') {
        env[`INPUT_${key.toUpperCase()}`] = config.default;
      }
    }
  }

  // 사용자 지정 inputs 적용 (기본값보다 우선)
  for (const [key, value] of Object.entries(actionWith)) {
    env[`INPUT_${key.toUpperCase()}`] = value;
  }

  // step-level env 적용
  if (stepEnv) {
    for (const [key, value] of Object.entries(stepEnv)) {
      env[key] = value;
    }
  }

  return env;
}

async function runNodeAction(
  actionDir: string,
  entryPoint: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  const scriptPath = path.join(actionDir, entryPoint);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Entry point not found: ${entryPoint}`);
  }

  core.info(`Executing Node.js action: ${entryPoint}`);
  const { stdout, stderr } = await execFileAsync('node', [scriptPath], {
    env,
    cwd: process.env['GITHUB_WORKSPACE'] || process.cwd(),
    maxBuffer: 50 * 1024 * 1024, // 50MB
  });

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

async function runCompositeAction(
  actionDir: string,
  steps: CompositeStep[],
  env: NodeJS.ProcessEnv
): Promise<void> {
  for (const step of steps) {
    if (step.name) {
      core.info(`Running step: ${step.name}`);
    }

    if (step.run && step.shell) {
      const stepEnv = buildEnv({}, { runs: { using: 'composite' } }, step.env);
      const mergedEnv = { ...env, ...stepEnv };

      const shell = step.shell === 'bash' ? 'bash' : step.shell;
      core.info(`Executing: ${shell} -c ...`);
      const { stdout, stderr } = await execFileAsync(shell, ['-c', step.run], {
        env: mergedEnv,
        cwd: process.env['GITHUB_WORKSPACE'] || process.cwd(),
        maxBuffer: 50 * 1024 * 1024,
      });

      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    } else if (step.uses) {
      core.warning(`Nested 'uses' in composite action is not supported: ${step.uses}. Skipping step.`);
    } else if (step.run && !step.shell) {
      // shell이 지정되지 않은 경우 bash를 기본으로 사용
      const stepEnv = buildEnv({}, { runs: { using: 'composite' } }, step.env);
      const mergedEnv = { ...env, ...stepEnv };

      core.info('Executing: bash -c ...');
      const { stdout, stderr } = await execFileAsync('bash', ['-c', step.run], {
        env: mergedEnv,
        cwd: process.env['GITHUB_WORKSPACE'] || process.cwd(),
        maxBuffer: 50 * 1024 * 1024,
      });

      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    }
  }
}

export async function runAction(
  token: string,
  actionInput: string,
  actionWith: Record<string, string>
): Promise<RunResult> {
  try {
    core.info(`Wrapping action: ${actionInput}`);

    const parsed = parseActionRef(actionInput);
    core.info(`Downloading ${parsed.owner}/${parsed.repo}@${parsed.ref}...`);

    const actionDir = await downloadAction(token, parsed);
    const actionDef = readActionYml(actionDir);

    core.info(`Action '${actionDef.name || actionInput}' loaded (type: ${actionDef.runs.using})`);

    const env = buildEnv(actionWith, actionDef);

    const using = actionDef.runs.using;

    if (using.startsWith('node')) {
      // Node.js action (node12, node16, node20, node24)
      if (!actionDef.runs.main) {
        throw new Error(`Node.js action '${actionInput}' has no 'main' entry point`);
      }
      await runNodeAction(actionDir, actionDef.runs.main, env);
    } else if (using === 'composite') {
      // Composite action
      if (!actionDef.runs.steps || actionDef.runs.steps.length === 0) {
        throw new Error(`Composite action '${actionInput}' has no steps`);
      }
      await runCompositeAction(actionDir, actionDef.runs.steps, env);
    } else if (using === 'docker') {
      throw new Error(`Docker actions are not supported yet: ${actionInput}`);
    } else {
      throw new Error(`Unsupported action type '${using}' for ${actionInput}`);
    }

    core.info(`Action '${actionInput}' completed successfully`);
    return { succeeded: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.error(`Action '${actionInput}' failed: ${message}`);
    return { succeeded: false, error: message };
  }
}
