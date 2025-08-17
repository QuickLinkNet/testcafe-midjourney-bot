// Konfigurationskonstanten
export const maxConcurrentRenderings: number = 1;
export const checkInterval: number = 2000;
export const timeoutDuration: number = 600000;

import { Selector } from 'testcafe';

// Selektoren – stabil statt dynamischer IDs
export const selectors = {
    // Login E-Mail-Feld – nutzt name oder aria-label
    loginUsername: Selector('input[name="email"], input[aria-label="E-Mail oder Telefonnummer"]').filterVisible(),

    // Login Passwort-Feld
    loginPassword: Selector('input[name="password"], input[aria-label="Passwort"]').filterVisible(),

    // Login-Button (DE & EN kompatibel)
    loginButton: Selector('button[type="submit"]').withText(/Anmelden|Log in/i).filterVisible(),

    // Text-Eingabefeld in Channels
    textInput: Selector('div[role="textbox"]').filterVisible(),

    // Dropdown-Option in Menüs
    dropdownOption: Selector('div[role="option"]').filterVisible(),

    // Dialog "Discord-App erkannt"
    discordAppDialog: Selector('h1, h2').withText(/Discord-App erkannt|Discord app detected/i),

    // Button "Im Browser fortfahren"
    browserContinueButton: Selector('button').withText(/Im Browser fortfahren|Continue in browser/i).filterVisible(),
} as const;