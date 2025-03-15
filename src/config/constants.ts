// Konfigurationskonstanten
export const maxConcurrentRenderings: number = 1;
export const checkInterval: number = 2000;
export const timeoutDuration: number = 600000;

// Selektoren
export const selectors = {
    loginUsername: '#uid_32',
    loginPassword: '#uid_34',
    loginButton: 'button[type="submit"]',
    textInput: 'div[role="textbox"]',
    dropdownOption: 'div[role="option"]'
} as const;