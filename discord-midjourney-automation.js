import { ClientFunction, Selector } from 'testcafe';
import dotenv from 'dotenv';

dotenv.config();

fixture `Discord Midjourney Automation`
    .page `https://discord.com/login`;

const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const apiBase = process.env.API;

const maxConcurrentRenderings = 1;
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
    return message ? {
        id: message.id,
        content: message.querySelector('[class^="markup_"][class*="messageContent_"]').textContent
    } : null;
});

const getButtonsFromMessage = ClientFunction((messageID) => {
    console.log(`Searching for message with ID: ${messageID}`);
    const message = document.querySelector(`#${messageID}`);
    if (!message) {
        console.log('Message not found');
        return [];
    }
    console.log('Message found, looking for buttons');

    const buttons = Array.from(message.querySelectorAll('button'));
    console.log(`Found ${buttons.length} buttons`);

    const filteredButtons = buttons.filter(button => {
        const label = button.querySelector('.label_acadc1');
        return label && ['U1', 'U2', 'U3', 'U4'].includes(label.textContent);
    });

    console.log(`Filtered upscaled buttons length: ${filteredButtons.length}`);
    return filteredButtons.map(button => button.textContent);
});

async function executePrompt(t, prompt) {
    const seed = generateSeed();
    const promptWithSeed = `${prompt.prompt} --seed ${seed}`;

    await slowTypeText(t, textInputSelector, '/im', 200);
    await t.click(dropdownOptionSelector.nth(0));
    await pasteText(t, textInputSelector, promptWithSeed);
    await t.pressKey('enter');

    await t.wait(15000);

    while (1 !== 2) {
        await log('Checking message container');

        const message = await findMessageByPrompt(promptWithSeed);

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
            await log(`Here we are...`);
        }

        await t.wait(checkInterval);
    }
}

test('Automate Midjourney Prompts', async t => {
    await t.expect(Selector('#app-mount').exists).ok('Ziel-Element existiert nicht');

    await t
        .typeText(loginUsernameSelector, email)
        .typeText(loginPasswordSelector, password)
        .click(loginButtonSelector);

    await t.navigateTo(process.env.SERVER);

    const prompts = await fetchPendingPrompts();

    if (!validatePrompts(prompts)) {
        throw new Error('Invalid prompts data');
    }

    let currentRenderings = 0;

    await ClientFunction(() => {
        window.currentRenderings = 0;
    })();

    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        while (prompt.successful_runs < prompt.expected_runs) {
            while (await ClientFunction(() => window.currentRenderings)() >= maxConcurrentRenderings) {
                await t.wait(checkInterval);
            }

            await ClientFunction(() => {
                window.currentRenderings++;
            })();

            await executePrompt(t, prompt);

            await ClientFunction(() => {
                window.currentRenderings--;
            })();

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
