import configJson from './config.json';

export interface LapcatConfig {
  env: string;
  aws: { region: string };
  cognito: {
    authority: string;
    userPoolId: string;
    userPoolClientId: string;
    cognitoDomain: string;
    redirectUri: string;
    logoutUri: string;
  };
  api: { apiUrl: string };
}

/**
 * Runtime configuration, baked in at build time.
 *
 * `config.json` is gitignored: `scripts/set-config.sh <env>` writes it from SSM
 * before a real build/deploy, and CI's test job seeds it from the committed
 * `config.json.template` so the import below type-checks without AWS access.
 */
const Config = configJson as LapcatConfig;

export default Config;
