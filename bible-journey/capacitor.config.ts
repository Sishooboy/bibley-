import type { CapacitorConfig } from '@capacitor/cli';

/*
 * The native shell around the web app. It bundles `dist` into the binary, so
 * the shell runs the build it shipped with: a push to main updates Vercel and
 * nothing else, and the app only changes when a new binary is installed. See
 * "The iOS shell" in CLAUDE.md before changing anything here.
 */
const config: CapacitorConfig = {
  /*
   * PLACEHOLDER. Not registered with Apple and not meant to be. `example.com` is
   * the domain reserved for examples, so this reads as a stand-in wherever it
   * appears and is not ours to register. Pick the real one when the
   * paid account exists, then change it here and in the Xcode project
   * (`PRODUCT_BUNDLE_IDENTIFIER` in ios/App/App.xcodeproj/project.pbxproj),
   * since `cap sync` does not rewrite it. The App Group, the URL scheme and the
   * widget's identifier will all be derived from the real one, which is why it
   * has to be settled before any of them is built.
   */
  appId: 'com.example.bibley',
  appName: 'Bibley',
  webDir: 'dist',
  /*
   * Ink, the colour of the top of every screen in both schemes. It is what
   * shows behind the page while the web view loads and at the edges of a
   * rotation, so cream here would flash a pale frame under a dark header.
   */
  backgroundColor: '#1a1512',
  ios: {
    /*
     * The page already pads itself for the notch through `viewport-fit=cover`
     * and safe-area insets, so the web view must not add its own on top.
     * This is Capacitor's default, written down so nobody flips it to fix a
     * symptom and doubles every inset.
     */
    contentInset: 'never',
  },
};

export default config;
