import { Selector, t } from 'testcafe';
import { selectors, checkInterval, timeoutDuration } from '../config/constants';
import { log, generateSeed } from '../utils/helpers';
import { createJobOverlay, updateJobOverlay, removeJobOverlay } from '../ui/overlay';
import { findMessageByPrompt, getButtonsFromMessage } from './message-handling';
import { clearTextField, slowTypeText, pasteText } from './text-input';
import { Prompt } from '../types';

export let isJobBusy = false;

export async function executePrompt(t: TestController, prompt: Prompt): Promise<void> {
    await createJobOverlay(prompt.id.toString(), prompt.prompt);
    await updateJobOverlay(prompt.id.toString(), 'Rendering gestartet', 0);
    const seed = generateSeed();
    const promptWithSeed = `${prompt.prompt} --seed ${seed}`;

    while (isJobBusy) {
        await t.wait(500);
    }

    isJobBusy = true;
    try {
        await t.click(Selector(selectors.textInput));
        await t.wait(250);
        await slowTypeText(t, Selector(selectors.textInput), '/im', 500);
        await t.wait(250);
        await t.click(Selector(selectors.dropdownOption).nth(0));
        await t.wait(250);
        await pasteText(t, Selector(selectors.textInput), promptWithSeed);
        await t.wait(250);
        await t.pressKey('enter');
    } finally {
        isJobBusy = false;
    }

    const startTime = new Date().getTime();
    let lastError: string | null = null;

    while (new Date().getTime() - startTime < timeoutDuration) {
        await log('Checking message container');
        await updateJobOverlay(prompt.id.toString(), 'Checking message Container', 0);

        const seedStr = `--seed ${seed}`;
        const message = await findMessageByPrompt(seedStr);

        if (!message) {
            lastError = `No message found for prompt: ${promptWithSeed}`;
            await log(lastError);
            await t.wait(checkInterval);
            continue;
        }

        if (message.content.includes('Waiting')) {
            await log(`Waiting container found: ${promptWithSeed}`);
            await updateJobOverlay(prompt.id.toString(), 'Waiting for rendering to start...', 25);
        } else if (message.content.includes('%')) {
            const match = message.content.match(/(\d+)%/);
            const progress = match ? parseInt(match[1]) : 0;
            await log(`Render progress ${progress}% for prompt: ${promptWithSeed}`);
            await updateJobOverlay(prompt.id.toString(), `Rendering in progress...`, progress);
        } else {
            const buttonTexts = await getButtonsFromMessage(message.id);

            if (buttonTexts.length === 4) {
                while (isJobBusy) {
                    await t.wait(500);
                }

                isJobBusy = true;
                try {
                    for (let text of buttonTexts) {
                        const button = Selector(`#${message.id}`).find('button').withText(text);
                        if (await button.exists) {
                            await t.click(button);
                            await log(`Clicked button: ${text}`);
                            await updateJobOverlay(prompt.id.toString(), `Button clicked: ${text}`, 100);
                            await t.wait(2000);
                        }
                    }
                    await removeJobOverlay(prompt.id.toString());
                    return;
                } finally {
                    isJobBusy = false;
                }
            }
        }

        await t.wait(checkInterval);
    }

    throw new Error(`Timeout reached for prompt: ${promptWithSeed}`);
}