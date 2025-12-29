import { ClientFunction } from 'testcafe';

export const findMessageByPrompt = ClientFunction((seed: string) => {
    const messages = Array.from(document.querySelectorAll('[id^="chat-messages-"]'));
    console.log(`Scanning ${messages.length} messages`);

    // Verbesserte Nachrichtenerkennung
    for (const msg of messages) {
        const content = msg.textContent || '';
        const messageContent = msg.querySelector('[id^="message-content-"]');
        const replyContent = msg.querySelector('.repliedTextContent_c19a55');

        // Prüfe sowohl Hauptnachricht als auch Antworten
        if ((messageContent?.textContent || '').includes(seed) ||
          (replyContent?.textContent || '').includes(seed)) {

            return {
                id: msg.id,
                content: content,
                hasReply: !!replyContent,
                isError: content.includes('error') || content.includes('Internal error')
            };
        }
    }

    return null;
});

export const getButtonsFromMessage = ClientFunction((messageID: string) => {
    const message = document.querySelector(`#${messageID}`);
    if (!message) return [];

    const buttons = Array.from(message.querySelectorAll('button'));
    const normalize = (text: string | null | undefined) =>
        (text || '').replace(/\s+/g, '').toUpperCase();

    // Robustere Button-Erkennung: nutze Label-Klasse, aria-label oder Button-Text
    const upscaleButtons = buttons
        .map(button => {
            const label = button.querySelector('.label__57f77');
            const text = label?.textContent?.trim()
                || button.getAttribute('aria-label')
                || button.textContent
                || '';
            const normalized = normalize(text);
            return /^U[1-4]$/.test(normalized) ? normalized : null;
        })
        .filter((val): val is string => Boolean(val));

    // Duplikate entfernen, Reihenfolge beibehalten
    return Array.from(new Set(upscaleButtons));
});
