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

    // Verbesserte Button-Erkennung
    return buttons
      .filter(button => {
          const label = button.querySelector('.label__57f77');
          return label && /U[1-4]/.test(label.textContent || '');
      })
      .map(button => {
          const label = button.querySelector('.label__57f77');
          return label?.textContent || '';
      });
});