/**
 * Verzió-információ: a Vite a buildkor injektálja a package.json
 * verzióját és a build időpontját (__APP_VERSION__ / __BUILD_ID__).
 * A belső build-ID minden buildnél változik → a live oldalon az
 *onnani érték alapján azonnal látszik, friss deployt látunk-e.
 */

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_ID: string = __BUILD_ID__;

declare global {
  interface Window {
    /** DevToolsból: window.ELEMLAB.version / .buildId */
    ELEMLAB?: { version: string; buildId: string };
  }
}
