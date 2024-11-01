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
    await createJobOverlay(prompt.id, prompt.prompt);
    await updateJobOverlay(prompt.id, 'Rendering gestartet', 0); // Anfangszustand
    const seed = generateSeed();
    const promptWithSeed = `${prompt.prompt} --seed ${seed}`;

    // --- Kritischer Abschnitt für die Texteingabe ---
    while (isJobBusy) {
        await t.wait(500); // Warten, bis der kritische Abschnitt frei wird
    }

    isJobBusy = true;
    try {
        await t.click(textInputSelector);
        await t.wait(250);  // ⬅️ Neu: Warten auf Eingabebereitschaft
        await slowTypeText(t, textInputSelector, '/im', 500);
        await t.wait(250); // ⬅️ Neu: Warten auf Dropdown
        await t.click(dropdownOptionSelector.nth(0));
        await t.wait(250); // ⬅️ Neu: Warten vor dem Einfügen des Prompts
        await pasteText(t, textInputSelector, promptWithSeed);
        await t.wait(250); // ⬅️ Neu: Warten vor dem Absenden
        await t.pressKey('enter');
    } finally {
        isJobBusy = false;
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
        await updateJobOverlay(prompt.id, 'Checking message Container', 0);

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
            await updateJobOverlay(prompt.id, 'Waiting for rendering to start...', 0);

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
            await updateJobOverlay(prompt.id, `Rendering in progress... ${renderProgress}%`, parseInt(renderProgress));

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

                            await updateJobOverlay(prompt.id, `Button clicked: ${text}%`, 100);

                            let isButtonActivated = false;
                            let retries = 0;

                            while (!isButtonActivated && retries < 20) {
                                const finishedMessageNew = Selector(`#${message.id}`);
                                await t.wait(checkInterval);
                                const updatedButton = finishedMessageNew.find('button').withText(text!);

                                const buttonClass = await updatedButton.getAttribute('class');
                                if (buttonClass?.includes('colorBrand_')) {
                                    await log(`Button with text: ${text} is activated`);
                                    await updateJobOverlay(prompt.id, `Button activated: ${text}`, 100);

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

    await removeJobOverlay(prompt.id);
    await log('Timeout reached for current prompt execution.');
    await updateJobOverlay(prompt.id, `Timeout reached`, 100);

}

// --- Hauptfortschritt-Overlay erstellen ---
const createMainOverlay = ClientFunction(() => {
    const overlay = document.createElement('div');
    overlay.id = 'main-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '10px';
    overlay.style.right = '10px';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    overlay.style.color = '#fff';
    overlay.style.padding = '10px';
    overlay.style.width = '250px';
    overlay.style.borderRadius = '8px';
    overlay.style.zIndex = '10000';
    overlay.innerHTML = `
        <h3>Gesamtfortschritt</h3>
        <div id="progress-bar" style="background-color: #555; height: 20px; border-radius: 5px;">
            <div id="progress-fill" style="background-color: #4caf50; width: 0%; height: 100%; border-radius: 5px;"></div>
        </div>
        <p id="progress-text">0 / 0 Prompts abgeschlossen</p>
    `;
    document.body.appendChild(overlay);
});

// --- Hauptfortschritt-Overlay aktualisieren ---
const updateMainOverlay = ClientFunction((completed: number, total: number) => {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    if (progressFill && progressText) {
        const progressPercentage = (completed / total) * 100;
        progressFill.style.width = `${progressPercentage}%`;
        progressText.textContent = `${completed} / ${total} Prompts abgeschlossen`;
    }
});

// --- Einzelne Rendering-Overlays erstellen ---
const createJobOverlay = ClientFunction((promptId: string, promptText: string) => {
    const overlay = document.createElement('div');
    overlay.id = `job-overlay-${promptId}`;
    overlay.style.position = 'absolute'; // Dynamische Positionierung
    overlay.style.bottom = `${10 + 80 * (parseInt(promptId) % 5)}px`; // Platzierung alle 5 in einer neuen Zeile
    overlay.style.right = '10px';
    overlay.style.backgroundColor = 'rgba(30, 30, 30, 0.9)';
    overlay.style.color = '#fff';
    overlay.style.padding = '10px';
    overlay.style.width = '250px';
    overlay.style.borderRadius = '8px';
    overlay.style.zIndex = `${10000 + parseInt(promptId)}`; // Erhöhen des z-Index je nach Prompt-ID
    overlay.innerHTML = `
        <h4>Prompt ${promptId}</h4>
        <p>${promptText}</p>
        <p id="job-status-${promptId}">Status: Gestartet</p>
        <div style="background-color: #555; height: 10px; border-radius: 5px;">
            <div id="job-progress-${promptId}" style="background-color: #4caf50; width: 0%; height: 100%; border-radius: 5px;"></div>
        </div>
    `;
    document.body.appendChild(overlay);
});

// --- Einzelne Rendering-Overlays aktualisieren ---
const updateJobOverlay = ClientFunction((promptId: string, status: string, progress: number) => {
    const jobStatus = document.getElementById(`job-status-${promptId}`);
    const jobProgress = document.getElementById(`job-progress-${promptId}`);
    if (jobStatus && jobProgress) {
        jobStatus.textContent = `Status: ${status}`;
        jobProgress.style.width = `${progress}%`;
    }
});

// --- Einzelne Rendering-Overlays entfernen ---
const removeJobOverlay = ClientFunction((promptId: string) => {
    const overlay = document.getElementById(`job-overlay-${promptId}`);
    if (overlay) {
        overlay.remove();
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

fixture `Discord Midjourney Automation`
  .page `https://discord.com/login`;

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
    await createMainOverlay();
    await updateMainOverlay(completedRuns, totalRuns);
    await ClientFunction(() => { window.currentRenderings = 0; })();

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

                await updateMainOverlay(completedRuns, totalRuns);
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
