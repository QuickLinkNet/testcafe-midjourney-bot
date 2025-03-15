import { Selector, t } from 'testcafe';
import * as dotenv from 'dotenv';
import { selectors, maxConcurrentRenderings } from './src/config/constants';
import { fetchPendingPrompts, incrementSuccessfulRuns } from './src/utils/api';
import { validatePrompts, log } from './src/utils/helpers';
import { createMainOverlay, updateMainOverlay } from './src/ui/overlay';
import { executePrompt } from './src/core/prompt-execution';
import { Prompt } from './src/types';
import { overlayStyles } from './src/ui/overlay';

dotenv.config();

const email: string = process.env.EMAIL || '';
const password: string = process.env.PASSWORD || '';

let totalRuns: number = 0;
let completedRuns: number = 0;
const reservedPrompts = new Set<number>();

fixture `Discord Midjourney Automation`
  .page `https://discord.com/login`;

test('Automate Midjourney Prompts', async t => {
  await t.expect(Selector('#app-mount').exists).ok('Ziel-Element existiert nicht');
  await t
    .typeText(selectors.loginUsername, email)
    .typeText(selectors.loginPassword, password)
    .click(selectors.loginButton);

  // Warte nach dem Login für 5 Sekunden
  await t.wait(5000);

  // Prüfe auf das "Discord-App erkannt" Fenster
  const discordAppDialog = Selector('h1').withText('Discord-App erkannt');
  const browserContinueButton = Selector('button').withText('Im Browser fortfahren');

  if (await discordAppDialog.exists && await browserContinueButton.exists) {
    await t
      .expect(browserContinueButton.visible).ok()
      .click(browserContinueButton);

    // Warte kurz nach dem Klick
    await t.wait(2000);
  }

  if (!process.env.SERVER) {
    throw new Error('SERVER environment variable is not defined');
  }
  await t.navigateTo(process.env.SERVER);

  const prompts: Prompt[] = await fetchPendingPrompts();
  if (!validatePrompts(prompts)) throw new Error('Invalid prompts data');

  totalRuns = prompts.reduce((sum, prompt) => sum + (prompt.expected_runs - prompt.successful_runs), 0);
  await createMainOverlay(overlayStyles);
  await updateMainOverlay(completedRuns, totalRuns);

  let activeRenderings: Promise<void>[] = [];

  while (completedRuns < totalRuns) {
    const prompt = prompts.find(p => !reservedPrompts.has(p.id) && p.successful_runs < p.expected_runs);

    if (!prompt || activeRenderings.length >= maxConcurrentRenderings) {
      await Promise.race(activeRenderings);
      continue;
    }

    reservedPrompts.add(prompt.id);
    const rendering = executePrompt(t, prompt)
      .then(async () => {
        await incrementSuccessfulRuns(prompt.id.toString());
        prompt.successful_runs++;
        completedRuns++;
        await updateMainOverlay(completedRuns, totalRuns);
      })
      .catch(async error => {
        await log(`Error during execution of prompt: ${prompt.prompt}, Error: ${error.message}`);
      })
      .finally(() => {
        reservedPrompts.delete(prompt.id);
        activeRenderings = activeRenderings.filter(r => r !== rendering);
      });

    activeRenderings.push(rendering);
  }

  await Promise.all(activeRenderings);
  console.log('Alle Prompts wurden erfolgreich verarbeitet.');
});