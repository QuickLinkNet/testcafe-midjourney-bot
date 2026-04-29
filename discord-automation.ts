import { Selector, t } from 'testcafe';
import * as dotenv from 'dotenv';
import { selectors, maxConcurrentRenderings } from './src/config/constants';
import {
  fetchPendingPrompts,
  incrementSuccessfulRuns,
  getPromptSource,
  getPromptsFilePath
} from './src/utils/api';
import { validatePrompts, log } from './src/utils/helpers';
import {
  createMainOverlay,
  updateMainOverlay,
  initOverlayControls,
  setOverlayPauseState,
  isOverlayPaused,
  setOverlayStatusText,
  updateQueueStats,
  appendOverlayLog,
  configureOverlayWorkers,
  getOverlayWorkerCount,
  setOverlayWorkerCount,
  overlayStyles
} from './src/ui/overlay';
import { executePrompt, PromptExecutionContext } from './src/core/prompt-execution';
import { Prompt } from './src/types';
import { createNeuroVaultReporter } from './src/integrations/neurovault/reporter';

dotenv.config();

const email: string = process.env.EMAIL || '';
const password: string = process.env.PASSWORD || '';

const WORKER_MIN = 1;
const WORKER_MAX = 3;

let totalRuns: number = 0;
let completedRuns: number = 0;
const reservedPrompts = new Set<number>();
let currentWorkerLimit = Math.min(Math.max(maxConcurrentRenderings, WORKER_MIN), WORKER_MAX);

fixture`Discord Midjourney Automation`
  .page`https://discord.com/login`;

test('Automate Midjourney Prompts', async t => {
  const reporter = await createNeuroVaultReporter();
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let heartbeatPayload: Record<string, unknown> = { run_id: runId };
  const workerKeys = Array.from({ length: WORKER_MAX }, (_, index) => `mj_w${index + 1}`);
  const syncHeartbeatWorkers = (activeLimit: number) => {
    const activeWorkers = workerKeys.slice(0, Math.max(WORKER_MIN, Math.min(WORKER_MAX, activeLimit)));
    reporter.startHeartbeat(activeWorkers, 45000, heartbeatPayload);
  };
  syncHeartbeatWorkers(currentWorkerLimit);

  await t.setNativeDialogHandler(() => true);

  try {
    await t.expect(Selector('#app-mount').exists).ok('Ziel-Element existiert nicht');
    await t
      .typeText(selectors.loginUsername, email)
      .typeText(selectors.loginPassword, password)
      .click(selectors.loginButton);

    await t.wait(5000);

    const discordAppDialog = Selector('h1').withText('Discord-App erkannt');
    const browserContinueButton = Selector('button').withText('Im Browser fortfahren');

    if (await discordAppDialog.exists && await browserContinueButton.exists) {
      await t
        .expect(browserContinueButton.visible).ok()
        .click(browserContinueButton);
      await t.wait(2000);
    }

    if (!process.env.SERVER) {
      throw new Error('SERVER environment variable is not defined');
    }

    await t.navigateTo(process.env.SERVER);

    await createMainOverlay(overlayStyles);
    await configureOverlayWorkers(currentWorkerLimit, WORKER_MIN, WORKER_MAX);
    await initOverlayControls();
    await setOverlayPauseState(false);
    await setOverlayStatusText('Loading prompts...', 'idle');
    await appendOverlayLog('Login complete. Preparing prompt workload...', 'info');
    await appendOverlayLog(
      `Worker limit set to ${currentWorkerLimit} (min ${WORKER_MIN}, max ${WORKER_MAX}).`,
      'info'
    );

    const promptSourceRaw = getPromptSource();
    const promptSource: 'api' | 'file' = promptSourceRaw === 'api' ? 'api' : 'file';
    heartbeatPayload = { run_id: runId, source: promptSource };
    syncHeartbeatWorkers(currentWorkerLimit);
    if (promptSource === 'api') {
      await appendOverlayLog('Prompt source: remote API (using API, API_SECRET).', 'info');
    } else {
      await appendOverlayLog(
        `Prompt source: local file at ${getPromptsFilePath()}.`,
        'info'
      );
    }

    const prompts: Prompt[] = await fetchPendingPrompts();
    if (!validatePrompts(prompts)) {
      throw new Error('Invalid prompts data');
    }

    reservedPrompts.clear();
    completedRuns = 0;
    totalRuns = prompts.reduce(
      (sum, prompt) => sum + (prompt.expected_runs - prompt.successful_runs),
      0
    );

    let activeRenderings: { promise: Promise<void>; workerKey: string }[] = [];
    let wasPaused = false;
    const promptAttempts = new Map<number, number>();

    const clampWorkerCount = (value: number) =>
      Math.min(WORKER_MAX, Math.max(WORKER_MIN, Math.floor(Number.isFinite(value) ? value : WORKER_MIN)));

    const getRemainingRuns = () =>
      prompts.reduce((sum, prompt) => sum + (prompt.expected_runs - prompt.successful_runs), 0);

    const getQueueDepth = () => Math.max(getRemainingRuns() - activeRenderings.length, 0);

    await reporter.emitSystem({
      workerKey: workerKeys[0],
      stepKey: 'WAITING',
      progress: 0,
      message: 'Automation run started',
      phase: 'system',
      substep: 'run_start',
      jobId: 'system',
      payload: {
        run_id: runId,
        source: promptSource,
        active_workers: activeRenderings.length,
        worker_limit: currentWorkerLimit,
        queue_depth: getQueueDepth(),
        total_runs: totalRuns,
        completed_runs: completedRuns
      }
    });

    await updateMainOverlay(completedRuns, totalRuns);
    await updateQueueStats(0, Math.max(totalRuns - completedRuns, 0), completedRuns);

    if (totalRuns === 0) {
      await setOverlayStatusText('No pending prompts', 'success');
      await appendOverlayLog('Prompt source returned no pending items. Automation finished.', 'info');
      await reporter.emitSystem({
        workerKey: workerKeys[0],
        stepKey: 'WAITING',
        progress: 0,
        message: 'No pending prompts',
        phase: 'system',
        substep: 'no_work',
        jobId: 'system',
        payload: {
          run_id: runId,
          source: promptSource,
          active_workers: activeRenderings.length,
          worker_limit: currentWorkerLimit,
          queue_depth: getQueueDepth(),
          total_runs: totalRuns,
          completed_runs: completedRuns
        }
      });
      return;
    }

    await setOverlayStatusText('Ready', 'running');
    await appendOverlayLog(`Starting automation with ${totalRuns} remaining runs.`, 'info');

    const updateQueueSnapshot = async () => {
      const remaining = getRemainingRuns();
      const active = activeRenderings.length;
      const queued = Math.max(remaining - active, 0);
      await updateQueueStats(active, queued, completedRuns);
    };

    const getAvailableWorkerKey = (): string | null => {
      for (const workerKey of workerKeys) {
        const isBusy = activeRenderings.some(rendering => rendering.workerKey === workerKey);
        if (!isBusy) {
          return workerKey;
        }
      }
      return null;
    };

    while (completedRuns < totalRuns) {
      const overlayWorkerRaw = await getOverlayWorkerCount();
      const normalizedWorker = clampWorkerCount(overlayWorkerRaw);

      if (overlayWorkerRaw !== normalizedWorker) {
        await setOverlayWorkerCount(normalizedWorker);
      }

      if (normalizedWorker !== currentWorkerLimit) {
        currentWorkerLimit = normalizedWorker;
        syncHeartbeatWorkers(currentWorkerLimit);
        await appendOverlayLog(
          `Worker limit adjusted to ${currentWorkerLimit} concurrent job(s).`,
          'info'
        );
        await reporter.emitSystem({
          workerKey: workerKeys[0],
          stepKey: 'WAITING',
          progress: 0,
          message: `Worker limit updated to ${currentWorkerLimit}`,
          phase: 'system',
          substep: 'worker_limit',
          jobId: 'system',
          payload: {
            run_id: runId,
            source: promptSource,
            active_workers: activeRenderings.length,
            worker_limit: currentWorkerLimit,
            queue_depth: getQueueDepth(),
            total_runs: totalRuns,
            completed_runs: completedRuns
          }
        });
        await updateQueueSnapshot();
      }

      if (await isOverlayPaused()) {
        if (!wasPaused) {
          wasPaused = true;
          await appendOverlayLog('Pause enabled. Holding new prompts.', 'warn');
          await setOverlayStatusText('Paused', 'idle');
          await reporter.emitSystem({
            workerKey: workerKeys[0],
            stepKey: 'WAITING',
            progress: 0,
            message: 'Queue paused',
            phase: 'system',
            substep: 'paused',
            jobId: 'system',
            payload: {
              run_id: runId,
              source: promptSource,
              active_workers: activeRenderings.length,
              worker_limit: currentWorkerLimit,
              queue_depth: getQueueDepth(),
              total_runs: totalRuns,
              completed_runs: completedRuns
            }
          });
        }
        await t.wait(600);
        continue;
      } else if (wasPaused) {
        wasPaused = false;
        await appendOverlayLog('Resuming job queue.', 'success');
        await setOverlayStatusText('Active', 'running');
        await reporter.emitSystem({
          workerKey: workerKeys[0],
          stepKey: 'WAITING',
          progress: 0,
          message: 'Queue resumed',
          phase: 'system',
          substep: 'resumed',
          jobId: 'system',
          payload: {
            run_id: runId,
            source: promptSource,
            active_workers: activeRenderings.length,
            worker_limit: currentWorkerLimit,
            queue_depth: getQueueDepth(),
            total_runs: totalRuns,
            completed_runs: completedRuns
          }
        });
        await updateQueueSnapshot();
      }

      const prompt = prompts.find(
        p => !reservedPrompts.has(p.id) && p.successful_runs < p.expected_runs
      );

      if (!prompt) {
        if (activeRenderings.length === 0) {
          break;
        }
        await setOverlayStatusText('Waiting for active renderings...', 'idle');
        if (activeRenderings.length > 0) {
          await Promise.race(activeRenderings.map(rendering => rendering.promise));
        }
        await updateQueueSnapshot();
        continue;
      }

      if (activeRenderings.length >= currentWorkerLimit) {
        await setOverlayStatusText(
          `Worker limit reached (${currentWorkerLimit}) - waiting...`,
          'idle'
        );
        if (activeRenderings.length > 0) {
          await Promise.race(activeRenderings.map(rendering => rendering.promise));
        }
        await updateQueueSnapshot();
        continue;
      }

      const workerKey = getAvailableWorkerKey();
      if (!workerKey) {
        await t.wait(300);
        continue;
      }

      reservedPrompts.add(prompt.id);

      const promptLabel = prompt.title?.trim() || prompt.prompt.trim();
      const readableLabel = promptLabel.length > 80 ? `${promptLabel.slice(0, 77)}...` : promptLabel;
      const attempt = (promptAttempts.get(prompt.id) ?? 0) + 1;
      promptAttempts.set(prompt.id, attempt);

      await setOverlayStatusText(`Starting prompt #${prompt.id}`, 'running');
      await appendOverlayLog(`Starting prompt #${prompt.id}: ${readableLabel}`, 'info');

      const context: PromptExecutionContext = {
        workerKey,
        attempt,
        reporter,
        runId,
        promptSource
      };

      const renderingPromise = executePrompt(t, prompt, context)
        .then(async () => {
          await incrementSuccessfulRuns(prompt.id.toString());
          prompt.successful_runs++;
          completedRuns++;
          await updateMainOverlay(completedRuns, totalRuns);
          await appendOverlayLog(`Prompt #${prompt.id} completed.`, 'success');
        })
        .catch(async error => {
          await log(`Error during execution of prompt: ${prompt.prompt}, Error: ${error.message}`);
          await appendOverlayLog(`Prompt #${prompt.id} failed: ${error.message}`, 'warn');
        })
        .finally(async () => {
          reservedPrompts.delete(prompt.id);
          activeRenderings = activeRenderings.filter(entry => entry.promise !== renderingPromise);
          await updateQueueSnapshot();
        });

      activeRenderings.push({ promise: renderingPromise, workerKey });
      await updateQueueSnapshot();
    }

    await Promise.all(activeRenderings.map(rendering => rendering.promise));
    await updateQueueSnapshot();
    await setOverlayPauseState(false);

    if (completedRuns >= totalRuns) {
      await setOverlayStatusText('All prompts completed', 'success');
      await appendOverlayLog('Automation finished. Nice work!', 'success');
      await reporter.emitSystem({
        workerKey: workerKeys[0],
        stepKey: 'WAITING',
        progress: 0,
        message: 'Automation run completed',
        phase: 'system',
        substep: 'run_complete',
        jobId: 'system',
        payload: {
          run_id: runId,
          source: promptSource,
          active_workers: activeRenderings.length,
          worker_limit: currentWorkerLimit,
          queue_depth: getQueueDepth(),
          total_runs: totalRuns,
          completed_runs: completedRuns
        }
      });
    } else {
      await setOverlayStatusText('Automation stopped', 'idle');
      await appendOverlayLog('Automation stopped before completion.', 'warn');
      await reporter.emitSystem({
        workerKey: workerKeys[0],
        stepKey: 'WAITING',
        progress: 0,
        message: 'Automation run stopped',
        phase: 'system',
        substep: 'run_stopped',
        jobId: 'system',
        payload: {
          run_id: runId,
          source: promptSource,
          active_workers: activeRenderings.length,
          worker_limit: currentWorkerLimit,
          queue_depth: getQueueDepth(),
          total_runs: totalRuns,
          completed_runs: completedRuns
        }
      });
    }
    console.log('Automation run finished.');
  } finally {
    await reporter.shutdown();
  }
});
