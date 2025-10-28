import { Selector, t } from 'testcafe';
import { selectors, checkInterval, timeoutDuration } from '../config/constants';
import { log, generateSeed } from '../utils/helpers';
import { createJobOverlay, updateJobOverlay, removeJobOverlay, appendOverlayLog } from '../ui/overlay';
import { findMessageByPrompt, getButtonsFromMessage } from './message-handling';
import { slowTypeText, pasteText } from './text-input';
import { Prompt } from '../types';

export let isJobBusy = false;

export async function executePrompt(t: TestController, prompt: Prompt): Promise<void> {
    const jobId = prompt.id.toString();
    await createJobOverlay(jobId, prompt.prompt);

    let lastStatus = '';
    let lastProgress = -1;

    const updateJobState = async (status: string, progress: number) => {
        const normalized = Math.max(0, Math.min(progress, 100));
        if (status !== lastStatus || normalized !== lastProgress) {
            await updateJobOverlay(jobId, status, normalized);
            lastStatus = status;
            lastProgress = normalized;
        }
    };

    await updateJobState('Rendering started', 0);

    const seed = generateSeed();
    const promptWithSeed = `${prompt.prompt} --seed ${seed}`;

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

    await appendOverlayLog(`Prompt #${prompt.id} sent to Midjourney (seed ${seed}).`, 'info');

    const startTime = new Date().getTime();
    let lastError: string | null = null;
    let waitingLogged = false;
    const progressMilestones = new Set<number>();
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

    while (new Date().getTime() - startTime < timeoutDuration) {
        const seedStr = `--seed ${seed}`;
        const message = await findMessageByPrompt(seedStr);

        if (!message) {
            lastError = `No message found for prompt: ${promptWithSeed}`;
            if (!waitingLogged) {
                await appendOverlayLog(`Prompt #${prompt.id} waiting for first response.`, 'info');
                waitingLogged = true;
            }
            await updateJobState('Waiting for first response...', Math.max(lastProgress, 0));
            await t.wait(checkInterval);
            continue;
        }

        if (message.content.includes('Waiting')) {
            await log(`Waiting container found: ${promptWithSeed}`);
            await updateJobState('Queued in Midjourney', Math.max(lastProgress, 10));
            await t.wait(checkInterval);
            continue;
        } else if (message.content.includes('%')) {
            const match = message.content.match(/(\d+)%/);
            const progress = match ? parseInt(match[1]) : 0;
            await log(`Render progress ${progress}% for prompt: ${promptWithSeed}`);
            await updateJobState(`Rendering in progress (${progress}%)`, progress);

            const milestone = Math.floor(progress / 25) * 25;
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

            if (buttonTexts.length === 4) {
                while (isJobBusy) {
                    await t.wait(500);
                }

                isJobBusy = true;
                try {
                    await updateJobState('Triggering upscale buttons', Math.max(lastProgress, 95));
                    let allButtonsSucceeded = true;
                    for (let index = 0; index < buttonTexts.length; index++) {
                        const text = buttonTexts[index];
                        const buttonSelector = Selector(`#${message.id}`).find('button').withText(text);
                        if (await buttonSelector.exists) {
                            await appendOverlayLog(`Prompt #${prompt.id}: triggering ${text}.`, 'info');
                            await t.wait(300);
                            await t.click(buttonSelector);
                            await log(`Clicked button: ${text}`);
                            const activated = await waitForButtonActivation(buttonSelector, text);
                            if (!activated) {
                                lastError = `Button ${text} did not activate for prompt: ${promptWithSeed}`;
                                allButtonsSucceeded = false;
                                await appendOverlayLog(
                                    `Prompt #${prompt.id}: ${text} did not activate in time.`,
                                    'warn'
                                );
                            }
                        } else {
                            lastError = `Button ${text} not found for prompt: ${promptWithSeed}`;
                            allButtonsSucceeded = false;
                            await appendOverlayLog(
                                `Prompt #${prompt.id}: ${text} button not found.`,
                                'warn'
                            );
                        }
                        if (index < buttonTexts.length - 1) {
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
                    await removeJobOverlay(jobId);
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
    await appendOverlayLog(
        `Timeout for prompt #${prompt.id}. Last message: ${lastError ?? 'No message found.'}`,
        'warn'
    );
    throw new Error(`Timeout reached for prompt: ${promptWithSeed}`);
}
