/*
 * The one address printed anywhere in the app.
 *
 * App Store guideline 1.2 asks for published contact information from anything
 * that shows user-generated content, and friends now shows photographs, names
 * and messages other people wrote. It lives here rather than being typed into
 * a component so that the app, the community rules page, the privacy policy and
 * the App Store listing cannot end up naming four different addresses.
 *
 * **This has to be a mailbox somebody actually reads.** The rules page promises
 * a reply within a day, and a promise on a public page that nobody is behind is
 * worse than not making it. `public/rules.html` and `public/privacy.html` are
 * static files and carry their own copy of this string, so change all three
 * together.
 */
export const SUPPORT_EMAIL = 'support@bibley.app';
