import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.SavannahWalters.QuickBoard',
  //okay this obviously isn't ideal but this is what Apple is looking for during builds
  appName: 'QuickBoard',
  webDir: 'dist/browser',
  server: {
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
