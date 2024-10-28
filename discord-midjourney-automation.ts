import { ClientFunction, Selector, t } from 'testcafe';
import * as dotenv from 'dotenv';
import axios from 'axios';

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

const maxConcurrentRenderings: number = 3;
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

const fetchPendingPrompts = async (limit: number = 10): Promise<Prompt[]> => {
    try {
        const response = await fetch(`${apiBase}/prompts/pending?limit=${limit}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch prompts: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        throw new Error(`Error fetching pending prompts: ${(error as Error).message}`);
    }
};

const validatePrompts = (prompts: Prompt[]): boolean => {
    return prompts.every(prompt => typeof prompt.prompt === 'string' && prompt.prompt.length > 0);
};

const generateSeed = (): number => {
    return Math.floor(1000000000 + Math.random() * 9000000000);
};

const incrementSuccessfulRuns = async (id: string): Promise<void> => {
    const response = await fetch(`${apiBase}/prompts/${id}/increment-success`, {
        method: 'PUT'
    });

    const errorText = await response.text();
    if (!response.ok) {
        throw new Error(`Failed to increment successful runs: ${errorText}`);
    }
};

async function createLogEntry(prompt_id: string, status: string, details: string, error_message: string | null = null) {
    try {
        await axios.post(`${apiBase}/log`, {
            prompt_id,
            status,
            error_message,
            details
        });
    } catch (err) {
        console.error('Fehler beim Erstellen des Log-Eintrags:', err);
    }
}

async function clearTextField(t: TestController, selector: Selector): Promise<void> {
    await t
      .click(selector)
      .pressKey('ctrl+a delete');
}

async function slowTypeText(t: TestController, selector: Selector, text: string, delay: number = 50): Promise<void> {
    await clearTextField(t, selector);

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
    await universalLog(message);
}

const findMessageByPrompt = ClientFunction((seed: string) => {
    const messages = Array.from(document.querySelectorAll('li[id^="chat-messages-"]'));
    const message = messages.find(msg => msg.textContent?.includes(seed));
    if (!message) {
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

// Globales Flag zur Steuerung der exklusiven Abschnitte
let isJobBusy = false;

async function executePrompt(t: TestController, prompt: Prompt): Promise<void> {
    const seed = generateSeed();
    const promptWithSeed = `${prompt.prompt} --seed ${seed}`;

    // --- Kritischer Abschnitt für die Texteingabe ---
    while (isJobBusy) {
        await t.wait(500); // Warten, bis der kritische Abschnitt frei wird
    }

    isJobBusy = true;
    try {
        await clearTextField(t, textInputSelector);
        await slowTypeText(t, textInputSelector, '/im', 500);
        await t.click(dropdownOptionSelector.nth(0));
        await pasteText(t, textInputSelector, promptWithSeed);
        await t.pressKey('enter');
    } finally {
        isJobBusy = false; // Freigeben des kritischen Abschnitts
    }
    // --- Ende des kritischen Abschnitts für die Texteingabe ---

    // Wartezeit für das Rendering (Simulation)
    await t.wait(2000);

    const timeoutDuration = 600000;
    const startTime = new Date().getTime();
    let lastError: string | null = null;

    let status_waiting: boolean = false;
    let status_render: boolean = false;
    let status_finished: boolean = false;
    let status_clicked_all: boolean = false;

    // Warte-Schleife, um das Rendering zu überwachen und auf Buttons zu reagieren
    while (new Date().getTime() - startTime < timeoutDuration) {
        await log('Checking message container');
        await updateInfoOverlay(
          totalRuns,
          completedRuns,
          prompt.prompt,
          'Checking message container...',
          lastError
        );

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
            await updateInfoOverlay(
              totalRuns,
              completedRuns,
              prompt.prompt,
              'Waiting for rendering to start...',
              lastError
            );

            if (!status_waiting) {
                await createLogEntry(prompt.id, 'waiting', 'Waiting to start');
                status_waiting = true;
            }

        } else if (message.content.includes('%')) {
            const renderProgress = await ClientFunction((message: { content: string }) => {
                const match = message.content ? message.content.match(/(\d+)%/) : null;
                return match ? match[1] : null;
            })(message);

            await log(`Render by ${renderProgress}% for prompt: ${promptWithSeed}`);
            await updateInfoOverlay(
              totalRuns,
              completedRuns,
              prompt.prompt,
              `Rendering in progress... ${renderProgress}%`,
              lastError
            );

            if (!status_render) {
                await createLogEntry(prompt.id, 'render', 'Rendering prompt has started');
                status_render = true;
            }
        } else {
            const buttonTexts = await getButtonsFromMessage(message.id);

            if (!status_finished) {
                await createLogEntry(prompt.id, 'finished', 'Rendering prompt has finished');
                status_finished = true;
            }

            if (buttonTexts.length === 4) {
                while (isJobBusy) {
                    await t.wait(500); // Warten, bis der kritische Abschnitt frei wird
                }

                isJobBusy = true;
                try {
                    for (let text of buttonTexts) {
                        await log(`Processing button: ${text}`);
                        const finishedMessage = Selector(`#${message.id}`);
                        const button = finishedMessage.find('button').withText(text!);

                        if (await button.exists) {
                            await t.click(button);
                            await log(`Clicked button with text: ${text}`);

                            await updateInfoOverlay(
                              totalRuns,
                              completedRuns,
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
                                      totalRuns,
                                      completedRuns,
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
                } finally {
                    isJobBusy = false; // Freigeben des kritischen Abschnitts für das Button-Handling
                }
                // --- Ende des kritischen Abschnitts für das Button-Handling ---

                if (!status_clicked_all) {
                    await createLogEntry(prompt.id, 'clicked_all', 'All buttons have been clicked.');
                    status_clicked_all = true;
                    break;
                }
            } else {
                await log(`Upscale buttons not found for prompt: ${promptWithSeed}`);
            }
        }

        await t.wait(checkInterval);
    }

    await log('Timeout reached for current prompt execution.');

    await updateInfoOverlay(
      totalRuns,
      completedRuns,
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

const updateInfoOverlay = ClientFunction((total: number, completed: number, currentPrompt: string, currentStatus: string, lastError: string | null) => {
    const overlay = document.getElementById('info-overlay');
    if (overlay) {
        overlay.innerHTML = `
            <h3>Automation Status</h3>
            <p><strong>Prompts to render:</strong> ${total}</p>
            <p><strong>Prompts rendered:</strong> ${completed}</p>
            <p><strong>Current Prompt:</strong> ${currentPrompt.substring(0, 30)}</p>
            <p><strong>Status:</strong> ${currentStatus}</p>
            <p><strong>Last Error:</strong> ${lastError || 'None'}</p>
            <div style="background-color: #555; width: 100%; height: 20px; border-radius: 5px; margin-top: 10px;">
                <div style="background-color: #4caf50; width: ${(completed / total) * 100}%; height: 100%; border-radius: 5px;"></div>
            </div>
        `;
    }
});

let currentRenderings: number = 0;

function incrementRenderings() {
    currentRenderings++;
}

function decrementRenderings() {
    currentRenderings--;
}

function getRenderingsCount() {
    return currentRenderings;
}

// Globales Set zur Reservierung von Prompts
const reservedPrompts = new Set<string>();

// Optimierter Test mit klarer Verwaltung der aktiven Renderings
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

    totalRuns = prompts.reduce((sum, prompt) => sum + (prompt.expected_runs - prompt.successful_runs), 0);
    await createInfoOverlay();
    await ClientFunction(() => { window.currentRenderings = 0; })();

    await updateInfoOverlay(totalRuns, completedRuns, 'Starting automation...', 'Starting automation...', null);

    let activeRenderings: Promise<void>[] = [];

    while (completedRuns < totalRuns) {
        // Suche nach einem verfügbaren Prompt
        const prompt = prompts.find(p => !reservedPrompts.has(p.id) && p.successful_runs < p.expected_runs);

        if (!prompt) {
            // Wenn keine weiteren Prompts zu rendern sind, warte auf Abschluss eines aktiven Renderings
            await Promise.race(activeRenderings);
            continue;
        }

        // Stelle sicher, dass die maximale Anzahl an Renderings nicht überschritten wird
        if (activeRenderings.length >= maxConcurrentRenderings) {
            await Promise.race(activeRenderings);
            continue;
        }

        // Reserviere den Prompt
        reservedPrompts.add(prompt.id);

        const rendering = (async () => {
            incrementRenderings();
            try {
                await executePrompt(t, prompt);

                // Erst nach erfolgreichem Datenbank-Inkrement erhöhen wir den lokalen Zähler
                await incrementSuccessfulRuns(prompt.id);
                prompt.successful_runs++;
                completedRuns++;

                await updateInfoOverlay(totalRuns, completedRuns, '', 'Prompt erfolgreich gerendert.', null);
            } catch (error) {
                await log(`Error during execution of prompt: ${prompt.prompt}, Error: ${(error as Error).message}`);
            } finally {
                decrementRenderings();
                reservedPrompts.delete(prompt.id); // Reservierung nach Abschluss entfernen
            }
        })();

        activeRenderings.push(rendering);

        // Sofortige Bereinigung der abgeschlossenen Promises
        rendering.finally(() => {
            activeRenderings = activeRenderings.filter(r => r !== rendering);
        });
    }

    await Promise.all(activeRenderings);
    console.log('Alle Prompts wurden erfolgreich verarbeitet.');
});


