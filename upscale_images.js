import { ClientFunction, Selector } from 'testcafe';
import dotenv from 'dotenv';

dotenv.config();

fixture `Discord Midjourney Upscale Automation`
    .page `https://discord.com/login`;

const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const checkInterval = 2500;

const loginUsernameSelector = '.inputDefault_f8bc55.input_f8bc55.inputField_cc6ddd';
const loginPasswordSelector = '#uid_9';
const loginButtonSelector = 'button[type="submit"]';

async function log(message) {
    console.log(message);
}

const scrollUp = ClientFunction(() => {
    window.scrollBy(0, -2000);
});

const getButtonsFromMessage = ClientFunction((messageID) => {
    const message = document.querySelector(`#${messageID}`);
    if (!message) return [];
    const buttons = Array.from(message.querySelectorAll('button'));
    const filteredButtons = buttons.filter(button => {
        const label = button.querySelector('.label_acadc1');
        return label && ['U1', 'U2', 'U3', 'U4'].includes(label.textContent);
    });
    return filteredButtons.map(button => ({
        text: button.textContent,
        class: button.getAttribute('class')
    }));
});

const findMessageContainers = ClientFunction(() => {
    const messages = Array.from(document.querySelectorAll('li[id^="chat-messages-"]'));
    return messages.map(msg => ({
        id: msg.id,
        content: msg.querySelector('[class^="markup_"][class*="messageContent_"]').textContent
    }));
});

async function upscaleAllButtons(t) {
    while (true) {
        const messageContainers = await findMessageContainers();
        if (messageContainers.length === 0) break;

        for (const message of messageContainers) {
            const buttons = await getButtonsFromMessage(message.id);
            const inactiveButtons = buttons.filter(button => button.class.includes('colorPrimary_'));

            if (inactiveButtons.length > 0) {
                for (let button of inactiveButtons) {
                    await log(`Processing button: ${button.text}`);
                    const buttonSelector = Selector(`#${message.id}`).find('button').withText(button.text);

                    if (await buttonSelector.exists) {
                        await t.click(buttonSelector);
                        await log(`Clicked button with text: ${button.text}`);

                        let isButtonActivated = false;
                        let retries = 0;

                        for (let retries = 0; retries < 10 && !isButtonActivated; retries++) {
                            await t.wait(checkInterval);
                            const updatedButton = Selector(`#${message.id}`).find('button').withText(button.text);

                            const buttonClass = await updatedButton.getAttribute('class');
                            if (buttonClass.includes('colorBrand_')) {
                                await log(`Button with text: ${button.text} is activated`);
                                isButtonActivated = true;
                            } else {
                                await log(`Waiting for button with text: ${button.text} to activate`);
                            }
                            retries++;
                        }

                        if (!isButtonActivated) {
                            await log(`Button with text: ${button.text} did not activate after 10 attempts. Moving to the next prompt.`);
                            break;
                        }
                    } else {
                        await log(`Button with text "${button.text}" not found`);
                    }
                }
            }
        }
        await scrollUp();
        await t.wait(checkInterval);
    }
}

test('Upscale All Midjourney Images', async t => {
    await t.typeText(loginUsernameSelector, email)
        .typeText(loginPasswordSelector, password)
        .click(loginButtonSelector);

    await t.navigateTo('https://discord.com/channels/1084714846290984990/1084714846290984993');
    await t.wait(10000); // Warte, bis die Seite vollständig geladen ist

    await upscaleAllButtons(t);
});
