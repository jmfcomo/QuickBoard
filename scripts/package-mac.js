#!/usr/bin/env node
/**
 * Mac-specific packaging script using @electron/packager.
 * - On macOS 26+: uses both .icns (legacy) and the Icon Composer .icon bundle
 *   for the new dynamic/adaptive icon feature (requires Xcode 26 + actool).
 * - On macOS < 26: uses .icns only, falling back gracefully.
 * After packaging, wraps each .app in a .dmg using hdiutil.
 * Run via: npm run electron:build:mac
 */
const { packager } = require('@electron/packager');
const { execSync, spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const { version } = require('../package.json');

function getMacOSMajorVersion() {
  const result = spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' });
  if (result.status === 0 && result.stdout) {
    return parseInt(result.stdout.trim().split('.')[0], 10);
  }
  return 0;
}

const macOSVersion = getMacOSMajorVersion();
const supportsIconComposer = macOSVersion >= 26;

console.log(
  supportsIconComposer
    ? `macOS ${macOSVersion} — including Icon Composer (.icon) for dynamic icon support.`
    : `macOS ${macOSVersion} — using .icns only (.icon compilation requires macOS 26+).`,
);

// Always pass the .icns to packager — it expects a single file path.
// The .icon bundle (Icon Composer) is handled separately after packaging.
const icon = path.join(root, 'branding', 'QuickBoard_icon_macOSLegacy.icns');

packager({
  dir: root,
  out: path.join(root, 'release'),
  platform: 'darwin',
  arch: ['x64', 'arm64'],
  appBundleId: 'com.quickboard.app',
  appCategoryType: 'public.app-category.productivity',
  name: 'QuickBoard',
  icon,
  ignore: [
    /^\/src\/(?!electron)/,
    /^\/branding/,
    /^\/scripts/,
    /^\/android/,
    /^\/ios/,
    /^\/build/,
    /^\/docs/,
    /^\/github-pages/,
    /^\/public/,
    /^\/release/,
    /^\/\.git/,
    /^\/angular\.json/,
    /^\/eslint\.config\.js/,
    /^\/capacitor\.config\.ts/,
    /^\/tsconfig.*\.json/,
    /^\/README\.md/,
    /^\/exportOptions\.plist/,
    /^\/patch-literallycanvas\.js/,
    /node_modules\/.cache/,
  ],
  overwrite: true,
})
  .then((appPaths) => {
    console.log('Packaged .app bundles:', appPaths.join(', '));

    // On macOS 26+, copy the Icon Composer (.icon) bundle into each .app's
    // Resources directory for dynamic/adaptive icon support, then re-sign
    // so the ad-hoc code signature stays valid (required for arm64).
    if (supportsIconComposer) {
      const iconBundleSrc = path.join(root, 'branding', 'QuickBoard_icon_macOS.icon');
      for (const appDir of appPaths) {
        const appBundle = path.join(appDir, 'QuickBoard.app');
        const resourcesDir = path.join(appBundle, 'Contents', 'Resources');
        console.log(`Copying .icon bundle into ${path.basename(appDir)}...`);
        execSync(`cp -R "${iconBundleSrc}" "${resourcesDir}/"`, { stdio: 'inherit' });
        console.log(`Re-signing ${path.basename(appDir)}...`);
        execSync(`codesign --force --deep --sign - "${appBundle}"`, { stdio: 'inherit' });
      }
    }

    // Wrap each .app bundle in a .dmg so CI artifacts match expected output.
    // appPaths entries look like: release/QuickBoard-darwin-x64
    const releaseDir = path.join(root, 'release');
    for (const appDir of appPaths) {
      const archMatch = path.basename(appDir).match(/darwin-(\w+)$/);
      if (!archMatch) continue;
      const arch = archMatch[1];
      const dmgPath = path.join(releaseDir, `quickboard-mac-${arch}.dmg`);
      console.log(`Creating ${path.basename(dmgPath)}...`);
      execSync(
        `hdiutil create -volname "QuickBoard" -srcfolder "${appDir}" -ov -format UDZO "${dmgPath}"`,
        { stdio: 'inherit' },
      );
      console.log(`Created ${dmgPath}`);
    }
  })
  .catch((err) => {
    console.error('Packaging failed:', err);
    process.exit(1);
  });
