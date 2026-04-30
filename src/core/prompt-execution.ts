import { Selector, t } from 'testcafe';
import { selectors, checkInterval, timeoutDuration } from '../config/constants';
import { log, generateSeed } from '../utils/helpers';
import { createJobOverlay, updateJobOverlay, removeJobOverlay, appendOverlayLog } from '../ui/overlay';
import { findMessageByPrompt, getButtonsFromMessage } from './message-handling';
import { slowTypeText, pasteText } from './text-input';
import { Prompt } from '../types';
import { NeuroVaultReporter, NeuroVaultStepKey } from '../integrations/neurovault/reporter';
import { createHash } from 'node:crypto';

export let isJobBusy = false;

export interface PromptExecutionContext {
    workerKey: string;
    attempt: number;
    reporter: NeuroVaultReporter;
    runId: string;
    promptSource: 'api' | 'file';
}

export async function executePrompt(t: TestController, prompt: Prompt, context: PromptExecutionContext): Promise<void> {
    const jobId = prompt.id.toString();
    const { reporter, workerKey, attempt, runId, promptSource } = context;
    const overlayKey = `${jobId}-${runId}-${attempt}`;
    await createJobOverlay(jobId, prompt.prompt, overlayKey);

    let overlayRemoved = false;
    const safeRemoveOverlay = async () => {
        if (overlayRemoved) return;
        overlayRemoved = true;
        await removeJobOverlay(overlayKey);
    };

    let lastStatus = '';
    let lastProgress = -1;
    let lastStep: NeuroVaultStepKey | null = null;
    let lastSubstep = '';
    const lastProgressByChannel = new Map<string, number>();
    let failureReported = false;
    let warningCount = 0;
    let renderGateReached = false;
    const promptLabel = prompt.title?.trim() || prompt.prompt.trim();
    const promptHash = createHash('sha1').update(prompt.prompt).digest('hex').slice(0, 12);
    const startedAtMs = Date.now();

    const updateJobState = async (status: string, progress: number) => {
        const normalized = Math.max(0, Math.min(progress, 100));
        if (status !== lastStatus || normalized !== lastProgress) {
            await updateJobOverlay(overlayKey, status, normalized);
            lastStatus = status;
            lastProgress = normalized;
        }
    };

    const emitStep = async (
        stepKey: NeuroVaultStepKey,
        progress: number,
        phase: string,
        message: string,
        substep?: string,
        payload?: Record<string, unknown>
    ) => {
        if (lastStep === stepKey && lastSubstep === (substep ?? '')) {
            return;
        }
        lastStep = stepKey;
        lastSubstep = substep ?? '';
        await reporter.emitStepUpdate({
            workerKey,
            stepKey,
            progress,
            message,
            phase,
            substep,
            payload: {
                run_id: runId,
                prompt_id: prompt.id,
                prompt_title: promptLabel,
                prompt_hash: promptHash,
                source: promptSource,
                ...(payload ?? {})
            },
            attempt,
            jobId
        });
    };

    const emitProgress = async (
        stepKey: NeuroVaultStepKey,
        progress: number,
        phase: string,
        message: string,
        substep?: string,
        payload?: Record<string, unknown>
    ) => {
        const rounded = Number(progress.toFixed(3));
        const channelKey = `${stepKey}:${substep ?? 'unspecified'}`;
        const previous = lastProgressByChannel.get(channelKey);
        if (typeof previous === 'number' && Math.abs(rounded - previous) < 0.001) {
            return;
        }
        lastProgressByChannel.set(channelKey, rounded);
        await reporter.emitProgressUpdate({
            workerKey,
            stepKey,
            progress: rounded,
            message,
            phase,
            substep,
            payload: {
                run_id: runId,
                prompt_id: prompt.id,
                prompt_title: promptLabel,
                prompt_hash: promptHash,
                source: promptSource,
                ...(payload ?? {})
            },
            attempt,
            jobId
        });
    };

    const emitFailure = async (code: string, message: string, substep: string, payload?: Record<string, unknown>) => {
        if (failureReported) {
            return;
        }
        failureReported = true;
        await reporter.emitError({
            workerKey,
            stepKey: 'FAILED',
            progress: 0,
            message,
            phase: 'failed',
            substep,
            payload: {
                run_id: runId,
                prompt_id: prompt.id,
                prompt_title: promptLabel,
                prompt_hash: promptHash,
                source: promptSource,
                duration_until_fail_seconds: Math.round((Date.now() - startedAtMs) / 1000),
                failed_phase: substep,
                last_known_step: lastStep ?? 'UNKNOWN',
                retry_planned: true,
                ...(payload ?? {})
            },
            attempt,
            code,
            jobId
        });
        await emitStep('FAILED', 0, 'failed', message, substep, {
            duration_until_fail_seconds: Math.round((Date.now() - startedAtMs) / 1000),
            failed_phase: substep,
            last_known_step: lastStep ?? 'UNKNOWN',
            retry_planned: true
        });
    };

    await updateJobState('Rendering started', 0);

    const seed = generateSeed();
    const promptWithSeed = `${prompt.prompt} --seed ${seed}`;

    try {
        while (isJobBusy) {
            await t.wait(500);
        }

        isJobBusy = true;
        try {
            const textInput = Selector(selectors.textInput);
            await t.click(textInput);
            await t.wait(250);
            await slowTypeText(t, textInput, '/im', 500);
            await t.wait(250);
            await t.click(Selector(selectors.dropdownOption).nth(0));
            await t.wait(250);
            await pasteText(t, textInput, promptWithSeed);
            await t.wait(250);
            await t.pressKey('enter');
        } finally {
            isJobBusy = false;
        }

        await emitStep('PROMPT_SUBMITTED', 0.05, 'prompt_submitted', 'Prompt submitted to Discord', 'send', {
            seed,
            source: promptSource
        });
        await appendOverlayLog(`Prompt #${prompt.id} sent to Midjourney (seed ${seed}).`, 'info');

        const startTime = Date.now();
        let lastError: string | null = null;
        let waitingLogged = false;
        const progressMilestones = new Set<number>();
        let buttonsTriggered = 0;
        let buttonsFailed = 0;
        const failedButtons: string[] = [];
        const waitForButtonActivation = async (buttonSelector: Selector, label: string): Promise<boolean> => {
            const maxAttempts = 8;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const className = await buttonSelector.getAttribute('class');
                if (className && className.includes('colorBrand_')) {
                    return true;
                }
                await t.wait(700);
            }
            return false;
        };
        const buttonCooldownMs = 1000;

        while (Date.now() - startTime < timeoutDuration) {
            const seedStr = `--seed ${seed}`;
            const message = await findMessageByPrompt(seedStr);
            const queueAgeSeconds = Math.round((Date.now() - startTime) / 1000);

            if (!message) {
                lastError = `No message found for prompt: ${promptWithSeed}`;
                if (!renderGateReached) {
                    if (!waitingLogged) {
                        await appendOverlayLog(`Prompt #${prompt.id} waiting for first response.`, 'info');
                        waitingLogged = true;
                    }
                    await updateJobState('Waiting for first response...', Math.max(lastProgress, 0));
                } else {
                    await updateJobState('Waiting for final buttons...', Math.max(lastProgress, 95));
                }
                await t.wait(checkInterval);
                continue;
            }

            if (message.content.includes('Waiting') && !renderGateReached) {
                await log(`Waiting container found: ${promptWithSeed}`);
                await emitStep('WAITING', 0, 'waiting', 'Prompt is queued in Midjourney', 'queue', {
                    wait_reason: 'queue',
                    queue_age_seconds: queueAgeSeconds,
                    discord_message_id: message.id
                });
                await updateJobState('Queued in Midjourney', Math.max(lastProgress, 0));
                await t.wait(checkInterval);
                continue;
            } else if (message.content.includes('%')) {
                const match = message.content.match(/(\d+)%/);
                const progress = match ? parseInt(match[1]) : 0;
                const progressRatio = Math.max(0, Math.min(1, progress / 100));
                const elapsedSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
                const etaSeconds = progress > 0
                    ? Math.max(0, Math.round((elapsedSeconds * (100 - progress)) / progress))
                    : undefined;
                const milestone = Math.floor(progress / 25) * 25;
                await log(`Render progress ${progress}% for prompt: ${promptWithSeed}`);
                await emitStep('RENDERING', progressRatio, 'rendering', 'Rendering in progress', 'percent', {
                    render_percent: progress,
                    milestone: milestone >= 25 ? milestone : undefined,
                    eta_seconds: etaSeconds
                });
                await emitProgress('RENDERING', progressRatio, 'rendering', `Rendering ${progress}%`, 'percent', {
                    render_percent: progress,
                    milestone: milestone >= 25 ? milestone : undefined,
                    eta_seconds: etaSeconds
                });
                if (progress >= 100 || progressRatio >= 1) {
                    renderGateReached = true;
                }
                await updateJobState(`Rendering in progress (${progress}%)`, progress);

                if (milestone >= 25 && !progressMilestones.has(milestone)) {
                    progressMilestones.add(milestone);
                    await appendOverlayLog(
                        `Prompt #${prompt.id} reached ${milestone}% progress.`,
                        'info'
                    );
                }

                await t.wait(checkInterval);
                continue;
            } else {
                const buttonTexts = await getButtonsFromMessage(message.id);
                const upscaleButtons = ['U1', 'U2', 'U3', 'U4'].filter(label => buttonTexts.includes(label));

                if (upscaleButtons.length === 4) {
                    while (isJobBusy) {
                        await t.wait(500);
                    }

                    isJobBusy = true;
                    try {
                        if (!renderGateReached) {
                            // Discord can expose upscale buttons before a visible 100% message.
                            await emitStep('RENDERING', 1, 'rendering', 'Rendering complete', 'percent', {
                                render_percent: 100,
                                inferred_from_buttons: true
                            });
                            await emitProgress('RENDERING', 1, 'rendering', 'Rendering 100%', 'percent', {
                                render_percent: 100,
                                inferred_from_buttons: true
                            });
                            renderGateReached = true;
                        }

                        await emitStep('UPSCALE', 1, 'upscale', 'Postprocessing started', 'buttons_detected', {
                            buttons_expected: 4
                        });
                        await updateJobState('Upscaling in progress', 100);
                        let allButtonsSucceeded = true;
                        for (let index = 0; index < upscaleButtons.length; index++) {
                            const text = upscaleButtons[index];
                            const buttonSelector = Selector(`#${message.id}`).find('button').withText(text);
                            if (await buttonSelector.exists) {
                                await appendOverlayLog(`Prompt #${prompt.id}: triggering ${text}.`, 'info');
                                await t.wait(300);
                                await t.click(buttonSelector);
                                buttonsTriggered++;
                                await emitProgress(
                                    'UPSCALE',
                                    buttonsTriggered / 4,
                                    'upscale',
                                    `Upscale ${text}`,
                                    'button_click',
                                    {
                                        button: text,
                                        buttons_triggered: buttonsTriggered,
                                        buttons_expected: 4,
                                        button_result: 'clicked'
                                    }
                                );
                                await log(`Clicked button: ${text}`);
                                const activated = await waitForButtonActivation(buttonSelector, text);
                                if (!activated) {
                                    lastError = `Button ${text} did not activate for prompt: ${promptWithSeed}`;
                                    allButtonsSucceeded = false;
                                    warningCount++;
                                    buttonsFailed++;
                                    failedButtons.push(text);
                                    await reporter.emitError({
                                        workerKey,
                                        stepKey: 'UPSCALE',
                                        progress: buttonsTriggered / 4,
                                        message: `Upscale button ${text} did not activate`,
                                        phase: 'upscale',
                                        substep: 'activation_timeout',
                                        code: 'BUTTON_NOT_ACTIVE',
                                        attempt,
                                        jobId,
                                        payload: {
                                            run_id: runId,
                                            prompt_id: prompt.id,
                                            prompt_title: promptLabel,
                                            prompt_hash: promptHash,
                                            source: promptSource,
                                            button: text,
                                            buttons_triggered: buttonsTriggered,
                                            buttons_expected: 4
                                        }
                                    });
                                    await appendOverlayLog(
                                        `Prompt #${prompt.id}: ${text} did not activate in time.`,
                                        'warn'
                                    );
                                }
                            } else {
                                lastError = `Button ${text} not found for prompt: ${promptWithSeed}`;
                                allButtonsSucceeded = false;
                                warningCount++;
                                buttonsFailed++;
                                failedButtons.push(text);
                                await reporter.emitError({
                                    workerKey,
                                    stepKey: 'UPSCALE',
                                    progress: buttonsTriggered / 4,
                                    message: `Upscale button ${text} not found`,
                                    phase: 'upscale',
                                    substep: 'button_missing',
                                    code: 'BUTTON_NOT_FOUND',
                                    attempt,
                                    jobId,
                                    payload: {
                                        run_id: runId,
                                        prompt_id: prompt.id,
                                        prompt_title: promptLabel,
                                        prompt_hash: promptHash,
                                        source: promptSource,
                                        button: text,
                                        buttons_triggered: buttonsTriggered,
                                        buttons_expected: 4
                                    }
                                });
                                await appendOverlayLog(
                                    `Prompt #${prompt.id}: ${text} button not found.`,
                                    'warn'
                                );
                            }
                            if (index < upscaleButtons.length - 1) {
                                await t.wait(buttonCooldownMs);
                            }
                        }
                        await t.wait(500);
                        const finalStatus = allButtonsSucceeded
                            ? 'Upscaling completed'
                            : 'Upscaling completed (warnings)';
                        await updateJobState(finalStatus, 100);
                        await appendOverlayLog(
                            allButtonsSucceeded
                                ? `Prompt #${prompt.id} upscale buttons completed.`
                                : `Prompt #${prompt.id} upscale buttons completed with warnings.`,
                            allButtonsSucceeded ? 'success' : 'warn'
                        );
                        await emitStep(
                            'COMPLETED',
                            1,
                            'completed',
                            allButtonsSucceeded
                                ? 'Prompt completed successfully'
                                : 'Prompt completed with warnings',
                            'finish',
                            {
                                duration_seconds: Math.round((Date.now() - startedAtMs) / 1000),
                                warnings_count: warningCount,
                                buttons_expected: 4,
                                buttons_triggered: buttonsTriggered,
                                buttons_failed: buttonsFailed,
                                failed_buttons: failedButtons
                            }
                        );
                        await safeRemoveOverlay();
                        return;
                    } finally {
                        isJobBusy = false;
                    }
                }

                lastError = `Unexpected message state for prompt: ${promptWithSeed}`;
                await updateJobState('Waiting for final buttons...', Math.max(lastProgress, 95));
            }

            await t.wait(checkInterval);
        }

        await updateJobState('Timeout - no response', Math.max(lastProgress, 0));
        await emitFailure(
            'TIMEOUT',
            'Timeout while waiting for Midjourney response',
            'timeout',
            {
                last_error: lastError ?? 'No message found',
                timeout_ms: timeoutDuration
            }
        );
        await appendOverlayLog(
            `Timeout for prompt #${prompt.id}. Last message: ${lastError ?? 'No message found.'} - will retry.`,
            'warn'
        );
        await safeRemoveOverlay();
        throw new Error(`Timeout reached for prompt: ${promptWithSeed}`);
    } catch (error) {
        if (!failureReported) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await emitFailure('UNKNOWN_STATE', `Prompt execution failed: ${errorMessage}`, 'exception');
        }
        await safeRemoveOverlay();
        throw error;
    }
}
