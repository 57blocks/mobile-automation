/** Timeouts, in one place. Page objects take their waits from here; never hardcode one. */

/** A new screen: a navigation, a transition, a load. */
export const SCREEN_TIMEOUT = 15000;

/** An element already expected on the current screen. */
export const ELEMENT_TIMEOUT = 10000;

/**
 * Probing settled system UI (alerts, payment sheets). Short on purpose: the control is
 * either in the tree now or never, and the wait is paid on every miss.
 */
export const SYSTEM_UI_PROBE_TIMEOUT = 1000;

/** Polling interval for `waitUntil` loops that drive a webdriver command each tick. */
export const POLL_INTERVAL = 500;
