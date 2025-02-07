import { ClientFunction, Selector, t } from 'testcafe';
import * as dotenv from 'dotenv';

dotenv.config();

const email: string = process.env.EMAIL || '';
const password: string = process.env.PASSWORD || '';
const checkInterval: number = 2000;

const loginUsernameSelector = '.inputDefault__0f084.input__0f084.inputField_d64f22';
const loginPasswordSelector = '#uid_34';
const loginButtonSelector = 'button[type="submit"]';

const findMessagesWithInactiveButtons = ClientFunction(() => {
  const messages = Array.from(document.querySelectorAll('li[id^="chat-messages-"]'));
  return messages
    .filter(msg => {
      const buttons = msg.querySelectorAll('button');
      const hasInactiveUpscaleButtons = Array.from(buttons).some(button => {
        const label = button.querySelector('.label__57f77');
        const isUpscaleButton = label && ['U1', 'U2', 'U3', 'U4'].includes(label.textContent || '');
        const isInactive = !button.className.includes('colorBrand_');
        return isUpscaleButton && isInactive;
      });
      return hasInactiveUpscaleButtons;
    })
    .map(msg => msg.id);
});

async function clickButton(messageID: string, buttonText: string): Promise<boolean> {
  const message = Selector(`#${messageID}`);
  const buttonElement = message.find('button').withText(buttonText);

  if (await buttonElement.exists) {
    await t.click(buttonElement);
    await t.wait(1000);

    // Wait for button to activate or timeout
    for (let i = 0; i < 20; i++) {
      const updatedButton = message.find('button').withText(buttonText);
      const buttonClass = await updatedButton.getAttribute('class');

      if (buttonClass?.includes('colorBrand_')) {
        return true;
      }
      await t.wait(2000);
    }
  }
  return false;
}

const getInactiveButtonsFromMessage = ClientFunction((messageID: string) => {
  const message = document.querySelector(`#${messageID}`);
  if (!message) return [];

  const buttons = Array.from(message.querySelectorAll('button'));
  return buttons
    .filter(button => {
      const label = button.querySelector('.label__57f77');
      const isUpscaleButton = label && ['U1', 'U2', 'U3', 'U4'].includes(label.textContent || '');
      const isInactive = !button.className.includes('colorBrand_');
      return isUpscaleButton && isInactive;
    })
    .map(button => ({
      text: button.textContent || '',
      isActive: button.className.includes('colorBrand_')
    }));
});

fixture`Discord Button Watcher`
  .page`https://discord.com/login`;

test('Watch and Click Inactive Buttons', async t => {
  // Login
  await t.expect(Selector('#app-mount').exists).ok('Target element does not exist');
  await t
    .typeText(loginUsernameSelector, email)
    .typeText(loginPasswordSelector, password)
    .click(loginButtonSelector);

  if (process.env.SERVER) {
    await t.navigateTo(process.env.SERVER);
  } else {
    throw new Error('SERVER environment variable is not defined');
  }

  // Continuous watching and clicking
  while (true) {
    const messageIDs = await findMessagesWithInactiveButtons();

    if (messageIDs.length === 0) {
      await t.wait(checkInterval);
      continue;
    }

    for (const messageID of messageIDs) {
      const buttons = await getInactiveButtonsFromMessage(messageID);
      for (const button of buttons) {
        await clickButton(messageID, button.text);
      }
    }

    await t.wait(checkInterval);
  }
});
