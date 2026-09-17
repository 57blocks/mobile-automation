/**
 * Selector builders, and the iOS/Android gotchas they encode.
 *
 * Priority — drop a level only when the one above cannot address the element: accessibility
 * id → iOS predicate / Android resource-id → iOS class chain → xpath (last resort).
 */

// --- iOS -------------------------------------------------------------------

/**
 * Matches by identifier, checking both `name` and `label`. iOS reports an accessibility
 * identifier as `name` on some builds and only as `label` on others, and Appium's `~`
 * strategy matches `name` only.
 */
export function iosNameOrLabel(...values: string[]): string {
    const clauses = values.flatMap((value) => [
        `name == "${value}"`,
        `label == "${value}"`,
    ]);
    return `-ios predicate string:${clauses.join(' OR ')}`;
}

/**
 * Matches an element of `type` whose label contains `text`, case-insensitively. Prefer this
 * to equality for copy that may carry a typographic apostrophe: "You're all set" renders
 * with U+2019, which a plain ASCII `'` never matches.
 */
export function iosContainsText(text: string, type = 'XCUIElementTypeStaticText'): string {
    return `-ios predicate string:(label CONTAINS[c] "${text}" OR name CONTAINS[c] "${text}") AND type == "${type}"`;
}

/** Matches a `name` that is missing **or** empty — `nil` is not `""` in an NSPredicate. */
export function iosNameEmptyOrMissing(type = 'XCUIElementTypeButton'): string {
    return `-ios predicate string:(name == nil OR name == "") AND type == "${type}"`;
}

/** A button by exact label. */
export const iosButton = (label: string): string =>
    `-ios predicate string:label == "${label}" AND type == "XCUIElementTypeButton"`;

/**
 * A class chain scoped inside a container — "the field belonging to *this* alert", not "any
 * field on screen", which can match the app behind a modal.
 *
 * Class-chain predicates do not reliably support `OR`; use several selectors in turn.
 */
export function iosChainIn(containerType: string, descendantType: string, predicate?: string): string {
    const leaf = predicate
        ? `${descendantType}[\`${predicate}\`]`
        : descendantType;
    return `-ios class chain:**/${containerType}/**/${leaf}`;
}

// --- Android ---------------------------------------------------------------

/** Matches by resource-id; a bare id is qualified with the app package. */
export function androidId(resourceId: string, appPackage = process.env.ANDROID_APP_PACKAGE): string {
    return resourceId.includes(':id/') ? `id:${resourceId}` : `id:${appPackage}:id/${resourceId}`;
}

/** Matches by exact visible text. */
export const androidText = (text: string): string => `android=new UiSelector().text("${text}")`;

/** Matches by partial visible text — for copy with dynamic segments (dates, counts). */
export const androidTextContains = (text: string): string =>
    `android=new UiSelector().textContains("${text}")`;

/** Matches by content-description (Android's accessibility id). */
export const androidDescription = (description: string): string =>
    `android=new UiSelector().description("${description}")`;

/**
 * Scrolls until an element with `text` is visible, then matches it. UiScrollable scrolls
 * inside the UiAutomator2 server, which beats swiping from the test side.
 */
export const androidScrollToText = (text: string): string =>
    'android=new UiScrollable(new UiSelector().scrollable(true))'
    + `.scrollIntoView(new UiSelector().text("${text}"))`;
