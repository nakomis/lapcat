// Hosted zone IDs shared across all nakomis projects.
export const HOSTED_ZONES = {
  sandbox: { hostedZoneId: 'Z03586633NXU18LFL0JTL', zoneName: 'sandbox.nakomis.com' },
  prod:    { hostedZoneId: 'Z019437529YGFB53BDUGR', zoneName: 'nakomis.com' },
} as const;

/** The web portal's domain: lapcat.{zoneName}. */
export function webDomain(deployEnv: 'sandbox' | 'prod'): string {
  return `lapcat.${HOSTED_ZONES[deployEnv].zoneName}`;
}
