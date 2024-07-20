import { ClientFunction, Selector } from 'testcafe';
import dotenv from 'dotenv';
import * as path from "path";
import * as fs from "fs";

// Lade die Umgebungsvariablen
dotenv.config();

fixture `Discord Midjourney Automation`
    .page `https://discord.com/login`;

const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const maxConcurrentRenderings = 1;
const checkInterval = 2000;
const repetitions = 5;

const loginUsernameSelector = '.inputDefault_f8bc55.input_f8bc55.inputField_cc6ddd';
const loginPasswordSelector = '#uid_9';
const loginButtonSelector = 'button[type="submit"]';
const textInputSelector = Selector('div').withAttribute('role', 'textbox');
const dropdownOptionSelector = Selector('div').withAttribute('role', 'option');

let messageIDs = {};

// Funktion zum Lesen und Validieren der Prompts
const readPromptsFromFile = (filePath) => {
    const absolutePath = path.resolve(filePath);
    const data = fs.readFileSync(absolutePath, 'utf8');
    return JSON.parse(data);
};

const validatePrompts = (prompts) => {
    return prompts.every(prompt => typeof prompt.prompt === 'string' && prompt.prompt.length > 0);
};

const generateSeed = () => {
    return Math.floor(1000000000 + Math.random() * 9000000000);
};

async function slowTypeText(t, selector, text, delay = 50) {
    for (const char of text) {
        await t.typeText(selector, char, { speed: 1.0 });
        await t.wait(delay);
    }
}

async function pasteText(t, selector, text) {
    await t.typeText(selector, text, { paste: true });
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
    await slowTypeText(t, textInputSelector, '/im', 200);
    await t.click(dropdownOptionSelector.nth(0));
    await pasteText(t, textInputSelector, prompt);
    await t.pressKey('enter');
    await t.wait(5000);

    const message = await findMessageByPrompt(prompt);

    if(!message) {
        throw new Error(`No message found with prompt: ${prompt}`)
    }

    await log(`Message found. ID: ${message.id}`);


    let waitingContainerFound = false;
    let renderContainerFound = false;
    let finishedContainerFound = false;

    while (1 !== 2) {
        await log('Checking message container');

        await log(`waiting: ${waitingContainerFound} | render: ${renderContainerFound} | finished: ${finishedContainerFound}`);

        const message = await findMessageByPrompt(prompt);

        if (message.content.includes('Waiting to start')) {
            if(!waitingContainerFound) {
                await log(`Found waiting message for prompt: ${prompt}`)
                waitingContainerFound = true;
            } else {
                await log(`Still waiting for prompt: ${prompt}`)
            }
        } else if(waitingContainerFound && message.content.includes('%')) {
            if(!renderContainerFound) {
                await log(`Found render message for prompt: ${prompt}`)
                renderContainerFound = true;
            } else {
                const renderProgress = await ClientFunction((message) => {
                    const match = message.content ? message.content.match(/(\d+)%/) : null;
                    return match ? match[1] : null;
                })(message);

                await log(`Render by ${renderProgress}% for prompt: ${prompt}`)
            }
        } else if (waitingContainerFound && renderContainerFound) {
            const buttonTexts = await getButtonsFromMessage(message.id);
            const finishedMessage = await Selector(`#${message.id}`)

            if (buttonTexts.length === 4) {
                for (let text of buttonTexts) {
                    await log(`Processing button: ${text}`);
                    const finishedMessage = await Selector(`#${message.id}`)
                    const button = finishedMessage.find('button').withText(text);

                    if (await button.exists) {
                        await t.click(button);
                        await log(`Clicked button with text: ${text}`);

                        let isButtonActivated = false;
                        let retries = 0;

                        while (!isButtonActivated && retries < 100) {
                            const finishedMessageNew = await Selector(`#${message.id}`)
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
                            await log(`Button with text: ${text} did not activate in time`);
                            throw new Error(`Button with text: ${text} did not activate`);
                        }
                    } else {
                        await log(`Button with text "${text}" not found`);
                    }
                }
                break;
            } else {
                await log(`Upscale buttons not found for prompt: ${prompt}`);
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

    await t.navigateTo('https://discord.com/channels/1084714846290984990/1084714846290984993');

    const promptsFilePath = './prompts.json';
    const prompts = readPromptsFromFile(promptsFilePath);

    if (!validatePrompts(prompts)) {
        throw new Error('Invalid prompts data');
    }

    let currentRenderings = 0;

    /**
     * @desc Iterate over prompts
     */
    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        for (let j = 0; j < repetitions; j++) {
            while (currentRenderings >= maxConcurrentRenderings) {
                await t.wait(checkInterval);
                currentRenderings = await t.eval(() => window.currentRenderings);
            }

            currentRenderings++;

            const seed = generateSeed();
            const promptWithSeed = `${prompt.prompt} --seed ${seed}`;

            await executePrompt(t, promptWithSeed);

            currentRenderings--;
        }
    }

    await log('Aktueller Status der Prompts und deren Container-IDs:');

    for (const prompt in messageIDs) {
        await log(`Prompt: ${prompt}, Nachrichten-ID: ${messageIDs[prompt].id}`);
    }
});
