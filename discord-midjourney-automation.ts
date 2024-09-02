import { ClientFunction, Selector, t } from 'testcafe';
import * as dotenv from 'dotenv';

dotenv.config();

declare global {
    interface Window {
        currentRenderings: number;
    }

    namespace globalThis {
        let currentRenderings: number;
    }
}

fixture `Discord Midjourney Automation`
  .page `https://discord.com/login`;

const email: string = process.env.EMAIL || '';
const password: string = process.env.PASSWORD || '';
const apiBase: string = process.env.API || '';

const maxConcurrentRenderings: number = 2;
const checkInterval: number = 2000;

const loginUsernameSelector = '.inputDefault_f8bc55.input_f8bc55.inputField_cc6ddd';
const loginPasswordSelector = '#uid_9';
const loginButtonSelector = 'button[type="submit"]';
const textInputSelector = Selector('div').withAttribute('role', 'textbox');
const dropdownOptionSelector = Selector('div').withAttribute('role', 'option');

interface Prompt {
    id: string;
    prompt: string;
    expected_runs: number;
    successful_runs: number;
}

let messageIDs: Record<string, { id: string }> = {};
let totalRuns: number = 0;
let completedRuns: number = 0;

const fetchPendingPrompts = async (): Promise<Prompt[]> => {
    const response = await fetch(`${apiBase}/prompts/pending`);
    if (!response.ok) {
        throw new Error('Failed to fetch prompts');
    }
    return await response.json();
};

const validatePrompts = (prompts: Prompt[]): boolean => {
    return prompts.every(prompt => typeof prompt.prompt === 'string' && prompt.prompt.length > 0);
};

const generateSeed = (): number => {
    return Math.floor(1000000000 + Math.random() * 9000000000);
};

const incrementSuccessfulRuns = async (id: string): Promise<void> => {
    console.log(`Incrementing successful runs for prompt ID: ${id}`);

    const response = await fetch(`${apiBase}/prompts/${id}/increment-success`, {
        method: 'PUT'
    });

    const errorText = await response.text();
    if (!response.ok) {
        throw new Error(`Failed to increment successful runs: ${errorText}`);
    }

    console.log(`Successfully incremented successful runs for prompt ID: ${id}`);
};

async function slowTypeText(t: TestController, selector: Selector, text: string, delay: number = 50): Promise<void> {
    for (const char of text) {
        await t.typeText(selector, char, { speed: 1.0 });
        await t.wait(delay);
    }
}

async function pasteText(t: TestController, selector: Selector, text: string): Promise<void> {
    await t.typeText(selector, text + ' --ar 8:3', { paste: true });
}

const universalLog = ClientFunction((message: string) => {
    console.log(message);
});

async function log(message: string): Promise<void> {
    console.log(message);
    await universalLog(message);
}

const findMessageByPrompt = ClientFunction((seed: string) => {
    const messages = Array.from(document.querySelectorAll('li[id^="chat-messages-"]'));
    const message = messages.find(msg => msg.textContent?.includes(seed));
    if (!message) {
        console.log(`No message found for seed: ${seed}`);
        return null;
    }
    return {
        id: message.id,
        content: (message.querySelector('[class^="markup_"][class*="messageContent_"]') as HTMLElement)?.textContent || ''
    };
});

const getButtonsFromMessage = ClientFunction((messageID: string) => {
    const message = document.querySelector(`#${messageID}`);
    if (!message) {
        console.log(`Message not found for ID: ${messageID}`);
        return [];
    }

    const buttons = Array.from(message.querySelectorAll('button'));
    if (buttons.length === 0) {
        console.log(`No buttons found for message ID: ${messageID}`);
    }

    return buttons.filter(button => {
        const label = button.querySelector('.label_acadc1');
        return label && ['U1', 'U2', 'U3', 'U4'].includes(label.textContent || '');
    }).map(button => button.textContent);
});

async function executePrompt(t: TestController, prompt: Prompt): Promise<void> {
    const seed = generateSeed();
    const promptWithSeed = `${prompt.prompt} --seed ${seed}`;

    await slowTypeText(t, textInputSelector, '/im', 200);
    await t.click(dropdownOptionSelector.nth(0));
    await pasteText(t, textInputSelector, promptWithSeed);
    await t.pressKey('enter');

    await t.wait(15000);

    const timeoutDuration = 600000; // Erhöht auf 10 Minuten
    const startTime = new Date().getTime();
    let lastError: string | null = null;

    while (new Date().getTime() - startTime < timeoutDuration) {
        await log('Checking message container');

        await updateInfoOverlay(
          completedRuns,
          totalRuns,
          totalRuns - completedRuns,
          await manageRenderings('get'),
          prompt.prompt,
          'Checking message container...',
          lastError
        );

        const seedStr = `--seed ${seed}`;
        const message = await findMessageByPrompt(seedStr);

        if (!message) {
            lastError = `No message found for prompt: ${promptWithSeed}`;
            await log(lastError);
            await t.wait(checkInterval); // Warte bevor ein neuer Versuch gestartet wird
            continue; // Versuche erneut die Nachricht zu finden
        }

        if (message.content.includes('Waiting')) {
            await log(`Waiting container found: ${promptWithSeed}`);

            await updateInfoOverlay(
              completedRuns,
              totalRuns,
              totalRuns - completedRuns,
              await manageRenderings('get'),
              prompt.prompt,
              'Waiting for rendering to start...',
              lastError
            );
        } else if (message.content.includes('%')) {
            const renderProgress = await ClientFunction((message: { content: string }) => {
                const match = message.content ? message.content.match(/(\d+)%/) : null;
                return match ? match[1] : null;
            })(message);

            await log(`Render by ${renderProgress}% for prompt: ${promptWithSeed}`);

            await updateInfoOverlay(
              completedRuns,
              totalRuns,
              totalRuns - completedRuns,
              await manageRenderings('get'),
              prompt.prompt,
              `Rendering in progress... ${renderProgress}%`,
              lastError
            );
        } else {
            const buttonTexts = await getButtonsFromMessage(message.id);

            if (buttonTexts.length === 4) {
                for (let text of buttonTexts) {
                    await log(`Processing button: ${text}`);
                    const finishedMessage = Selector(`#${message.id}`);
                    const button = finishedMessage.find('button').withText(text!);

                    if (await button.exists) {
                        await t.click(button);
                        await log(`Clicked button with text: ${text}`);

                        await updateInfoOverlay(
                          completedRuns,
                          totalRuns,
                          totalRuns - completedRuns,
                          await manageRenderings('get'),
                          prompt.prompt,
                          `Button clicked: ${text}`,
                          lastError
                        );

                        let isButtonActivated = false;
                        let retries = 0;

                        while (!isButtonActivated && retries < 20) {
                            const finishedMessageNew = Selector(`#${message.id}`);
                            await t.wait(checkInterval);
                            const updatedButton = finishedMessageNew.find('button').withText(text!);

                            const buttonClass = await updatedButton.getAttribute('class');
                            if (buttonClass?.includes('colorBrand_')) {
                                await log(`Button with text: ${text} is activated`);

                                await updateInfoOverlay(
                                  completedRuns,
                                  totalRuns,
                                  totalRuns - completedRuns,
                                  await manageRenderings('get'),
                                  prompt.prompt,
                                  `Button activated: ${text}`,
                                  lastError
                                );

                                isButtonActivated = true;
                            } else {
                                await log(`Waiting for button with text: ${text} to activate`);
                            }
                            retries++;
                        }

                        if (!isButtonActivated) {
                            await log(`Button with text: ${text} did not activate after 20 attempts. Skipping this button and moving to the next.`);
                            break;
                        }
                    } else {
                        await log(`Button with text "${text}" not found`);
                    }
                }

                await incrementSuccessfulRuns(prompt.id);

                prompt.successful_runs++;

                break;
            } else {
                await log(`Upscale buttons not found for prompt: ${promptWithSeed}`);
            }
        }

        await t.wait(checkInterval);
    }

    await log('Timeout reached for current prompt execution.');

    await updateInfoOverlay(
      completedRuns,
      totalRuns,
      totalRuns - completedRuns,
      await manageRenderings('get'),
      prompt.prompt,
      'Timeout reached',
      lastError
    );
}

const createInfoOverlay = ClientFunction(() => {
    const overlay = document.createElement('div');
    overlay.id = 'info-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '10px';
    overlay.style.right = '10px';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    overlay.style.color = '#fff';
    overlay.style.padding = '10px';
    overlay.style.zIndex = '10000';
    overlay.style.fontSize = '14px';
    document.body.appendChild(overlay);
});

const updateInfoOverlay = ClientFunction((completed: number, total: number, remaining: number, currentRenderings: number, currentPrompt: string, currentStatus: string, lastError: string | null) => {
    const overlay = document.getElementById('info-overlay');
    if (overlay) {
        overlay.innerHTML = `
            <p><strong>Completed Runs:</strong> ${completed}</p>
            <p><strong>Total Runs:</strong> ${total}</p>
            <p><strong>Remaining Runs:</strong> ${remaining}</p>
            <p><strong>Current Renderings:</strong> ${currentRenderings}</p>
            <p><strong>Current Prompt:</strong> ${currentPrompt}</p>
            <p><strong>Status:</strong> ${currentStatus}</p>
            <p><strong>Last Error:</strong> ${lastError || 'None'}</p>
        `;
    }
});

const manageRenderings = ClientFunction((action: 'increment' | 'decrement' | 'get'): number => {
    if (action === 'increment') {
        window.currentRenderings++;
    } else if (action === 'decrement') {
        window.currentRenderings--;
    } else if (action === 'get') {
        return window.currentRenderings;
    }
    return window.currentRenderings;
});

test('Automate Midjourney Prompts', async t => {
    await t.expect(Selector('#app-mount').exists).ok('Ziel-Element existiert nicht');
    await t
      .typeText(loginUsernameSelector, email)
      .typeText(loginPasswordSelector, password)
      .click(loginButtonSelector);

    if (process.env.SERVER) {
        await t.navigateTo(process.env.SERVER);
    } else {
        throw new Error('SERVER environment variable is not defined');
    }

    const prompts: Prompt[] = await fetchPendingPrompts();
    if (!validatePrompts(prompts)) throw new Error('Invalid prompts data');

    totalRuns = prompts.reduce((sum, prompt) => sum + prompt.expected_runs, 0);
    completedRuns = prompts.reduce((sum, prompt) => sum + prompt.successful_runs, 0);

    await createInfoOverlay();

    await ClientFunction(() => {
        window.currentRenderings = 0;
    })();

    await updateInfoOverlay(
      completedRuns,
      totalRuns,
      totalRuns - completedRuns,
      await manageRenderings('get'),
      'current prompt',
      'current status',
      null
    );

    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        while (prompt.successful_runs < prompt.expected_runs) {
            while (await manageRenderings('get') >= maxConcurrentRenderings) {
                await t.wait(checkInterval);
            }

            await manageRenderings('increment');

            try {
                await executePrompt(t, prompt);
                completedRuns++; // Erhöhe completedRuns nach jedem erfolgreichen Prompt
            } catch (error) {
                await log(`Error during execution of prompt: ${prompt.prompt}, Error: ${(error as Error).message}`);
                await manageRenderings('decrement');
                continue;
            }

            await manageRenderings('decrement');

            await updateInfoOverlay(
              completedRuns,
              totalRuns,
              totalRuns - completedRuns,
              await manageRenderings('get'),
              'current prompt',
              'current status',
              null
            );
        }
    }

    await log('Aktueller Status der Prompts und deren Container-IDs:');

    for (const prompt in messageIDs) {
        await log(`Prompt: ${prompt}, Nachrichten-ID: ${messageIDs[prompt].id}`);
    }
});
