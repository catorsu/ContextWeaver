import { Logger } from '@contextweaver/shared';
import { UIManager } from '../../uiManager';

type Theme = 'light' | 'dark';

/**
 * Manages the application's theme (light/dark mode).
 */
export class ThemeService {
    private logger = new Logger('ThemeService');
    private uiManager: UIManager;
    private currentTheme: Theme = 'dark'; // Default theme

    constructor(uiManager: UIManager) {
        this.uiManager = uiManager;
    }

    /**
     * Initializes theme detection and sets up theme change listener.
     */
    public initialize(): void {
        // Detect initial theme
        const detectedTheme = this.detectBrowserTheme();
        this.updateTheme(detectedTheme);

        // Listen for theme changes
        if (window.matchMedia) {
            const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

            // Modern browsers support addEventListener
            if (darkModeMediaQuery.addEventListener) {
                darkModeMediaQuery.addEventListener('change', (e) => {
                    const newTheme = e.matches ? 'dark' : 'light';
                    this.updateTheme(newTheme);
                });
            } else if (darkModeMediaQuery.addListener) {
                // Fallback for older browsers
                darkModeMediaQuery.addListener((e) => {
                    const newTheme = e.matches ? 'dark' : 'light';
                    this.updateTheme(newTheme);
                });
            }
        }

        // Also check for stored theme preference
        chrome.storage.local.get(['theme'], (result) => {
            if (result.theme && (result.theme === 'light' || result.theme === 'dark')) {
                this.updateTheme(result.theme);
            }
        });
        this.logger.info('Theme detection initialized.');
    }

    /**
     * Detects the current browser theme using prefers-color-scheme media query.
     * @returns The detected theme ('light' or 'dark').
     */
    private detectBrowserTheme(): Theme {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    /**
     * Updates the theme for the extension UI.
     * @param theme The theme to apply ('light' or 'dark').
     */
    private updateTheme(theme: Theme): void {
        this.currentTheme = theme;
        this.logger.debug(`Theme updated to: ${theme}`);

        // Apply theme to body for global components like modals
        document.body.setAttribute('data-theme', theme);

        this.uiManager.setTheme(theme);

        chrome.storage.local.set({ theme });
    }
}