import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/vue';
import { afterEach, vi } from 'vitest';

// jsdom has <dialog> but not its modal methods; these give it the open/close
// state the components rely on (no focus trapping, which E2E covers in a browser)
// (Server tests run in Node, without a DOM.)
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

// jsdom has no ResizeObserver, which the charts' autoresize uses. Charts in jsdom
// have no size anyway; E2E checks them in a browser
if (typeof window !== 'undefined' && typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// jsdom doesn't scroll (it reports window.scrollTo as not implemented); the router's
// scroll behaviour calls it on every navigation
if (typeof window !== 'undefined') window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
