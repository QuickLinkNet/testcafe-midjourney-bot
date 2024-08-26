import { ClientFunction, Selector } from 'testcafe';
import dotenv from 'dotenv';

dotenv.config();

fixture `Discord Midjourney Automation`
    .page `https://discord.com/login`;

const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const apiBase = process.env.API;

const maxConcurrentRenderings = 2;
const checkInterval = 2000;

const loginUsernameSelector = '.inputDefault_f8bc55.input_f8bc55.inputField_cc6ddd';
const loginPasswordSelector = '#uid_9';
const loginButtonSelector = 'button[type="submit"]';
const textInputSelector = Selector('div').withAttribute('role', 'textbox');
const dropdownOptionSelector = Selector('div').withAttribute('role', 'option');

let messageIDs = {};

const fetchPendingPrompts = async () => {
    const response = await fetch(`${apiBase}/prompts/pending`);
    if (!response.ok) {
        throw new Error('Failed to fetch prompts');
    }
    return await response.json();
};

const validatePrompts = (prompts) => {
    return prompts.every(prompt => typeof prompt.prompt === 'string' && prompt.prompt.length > 0);
};

const generateSeed = () => {
    return Math.floor(1000000000 + Math.random() * 9000000000);
};

const incrementSuccessfulRuns = async (id) => {
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


async function slowTypeText(t, selector, text, delay = 50) {
    for (const char of text) {
        await t.typeText(selector, char, { speed: 1.0 });
        await t.wait(delay);
    }
}

async function pasteText(t, selector, text) {
    await t.typeText(selector, text + ' --ar 8:3', { paste: true });
}

const universalLog = ClientFunction((message) => {
    console.log(message);
});

async function log(message) {
    console.log(message);
    await universalLog(message);
}

const findMessageByPrompt = ClientFunction((prompt) => {
    const messages = Array.from(document.querySelectorAll('li[id^="chat-messages-"]'));
    const message = messages.find(msg => msg.textContent.includes(prompt));
    if (!message) {
        console.log(`No message found for prompt: ${prompt}`);
        return null;
    }
    return {
        id: message.id,
        content: message.querySelector('[class^="markup_"][class*="messageContent_"]').textContent
    };
});

const getButtonsFromMessage = ClientFunction((messageID) => {
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
        return label && ['U1', 'U2', 'U3', 'U4'].includes(label.textContent);
    }).map(button => button.textContent);
});

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms));

async function executePrompt(t, prompt) {
    const seed = generateSeed();
    const promptWithSeed = `${prompt.prompt} --seed ${seed}`;

    await slowTypeText(t, textInputSelector, '/im', 200);
    await t.click(dropdownOptionSelector.nth(0));
    await pasteText(t, textInputSelector, promptWithSeed);
    await t.pressKey('enter');

    await t.wait(15000);

    const timeoutDuration = 60000; // 60 seconds
    const startTime = new Date().getTime();

    while (new Date().getTime() - startTime < timeoutDuration) {
        await log('Checking message container');

        const message = await findMessageByPrompt(promptWithSeed);

        if (!message) continue;

        if (message.content.includes('Waiting')) {
            await log(`Waiting container found: ${promptWithSeed}`);
        } else if (message.content.includes('%')) {
            const renderProgress = await ClientFunction((message) => {
                const match = message.content ? message.content.match(/(\d+)%/) : null;
                return match ? match[1] : null;
            })(message);

            await log(`Render by ${renderProgress}% for prompt: ${promptWithSeed}`);
        } else {
            const buttonTexts = await getButtonsFromMessage(message.id);

            if (buttonTexts.length === 4) {
                for (let text of buttonTexts) {
                    await log(`Processing button: ${text}`);
                    const finishedMessage = await Selector(`#${message.id}`);
                    const button = finishedMessage.find('button').withText(text);

                    if (await button.exists) {
                        await t.click(button);
                        await log(`Clicked button with text: ${text}`);

                        let isButtonActivated = false;
                        let retries = 0;

                        while (!isButtonActivated && retries < 20) {
                            const finishedMessageNew = await Selector(`#${message.id}`);
                            await t.wait(checkInterval);
                            const updatedButton = await finishedMessageNew.find('button').withText(text);

                            const buttonClass = await updatedButton.getAttribute('class');
                            if (buttonClass.includes('colorBrand_')) {
                                await log(`Button with text: ${text} is activated`);
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

const updateInfoOverlay = ClientFunction((completed, total, remaining, currentRenderings) => {
    const overlay = document.getElementById('info-overlay');
    overlay.innerHTML = `
        <p>Completed Runs: ${completed}</p>
        <p>Total Runs: ${total}</p>
        <p>Remaining Runs: ${remaining}</p>
        <p>Current Renderings: ${currentRenderings}</p>
    `;
});

const manageRenderings = ClientFunction((action) => {
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

    await t.navigateTo(process.env.SERVER);

    const prompts = await fetchPendingPrompts();
    if (!validatePrompts(prompts)) throw new Error('Invalid prompts data');

    await createInfoOverlay();

    await ClientFunction(() => {
        window.currentRenderings = 0;
    })();

    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        while (prompt.successful_runs < prompt.expected_runs) {
            const currentRenderings = await manageRenderings('get');

            await updateInfoOverlay(prompt.successful_runs, prompt.expected_runs, prompt.expected_runs - prompt.successful_runs, currentRenderings);

            while (await manageRenderings('get') >= maxConcurrentRenderings) {
                await t.wait(checkInterval);
            }

            await manageRenderings('increment');

            try {
                await executePrompt(t, prompt);
            } catch (error) {
                await log(`Error during execution of prompt: ${prompt.prompt}, Error: ${error.message}`);
                await manageRenderings('decrement');
                continue;
            }

            await manageRenderings('decrement');

            const completed = prompt.successful_runs;
            const total = prompt.expected_runs;
            const remaining = total - completed;

            await log(`Completed runs for current prompt: ${completed} of ${total}. Remaining: ${remaining}.`);
        }
    }

    await log('Aktueller Status der Prompts und deren Container-IDs:');

    for (const prompt in messageIDs) {
        await log(`Prompt: ${prompt}, Nachrichten-ID: ${messageIDs[prompt].id}`);
    }
});
