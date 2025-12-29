import { Selector, t } from 'testcafe';

export async function clearTextField(t: TestController, selector: Selector): Promise<void> {
    await t
      .click(selector)
      .pressKey('ctrl+a delete');
}

export async function slowTypeText(t: TestController, selector: Selector, text: string, delay: number = 50): Promise<void> {
    await clearTextField(t, selector);

    for (const char of text) {
        await t.typeText(selector, char, { speed: 1.0 });
        await t.wait(delay);
    }
}

export async function pasteText(t: TestController, selector: Selector, text: string): Promise<void> {
    await t.typeText(selector, text, { paste: true });
}