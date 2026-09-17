import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { SPA_REWRITE_FUNCTION_CODE, WebStack } from '../lib/web-stack';

const MOCK_CERT_ARN = 'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000';

function makeTemplate(deployEnv: 'sandbox' | 'prod') {
  const app = new cdk.App();
  const certStack = new cdk.Stack(app, 'CertStack', { env: { account: '123456789012', region: 'us-east-1' } });
  const certificate = acm.Certificate.fromCertificateArn(certStack, 'MockCert', MOCK_CERT_ARN);
  const stack = new WebStack(app, 'TestWebStack', {
    env: { account: '123456789012', region: 'eu-west-2' },
    deployEnv,
    certificate,
    crossRegionReferences: true,
  });
  return Template.fromStack(stack);
}

type CfRequest = { uri: string };
// Evaluate the inline CloudFront Function source exactly as it is deployed.
const rewrite = new Function(`${SPA_REWRITE_FUNCTION_CODE}; return handler;`)() as (
  event: { request: CfRequest },
) => CfRequest;

describe('SPA rewrite function', () => {
  test.each([
    ['/', '/index.html'],
    ['/loggedin', '/index.html'],
    ['/logout', '/index.html'],
    ['/swims/abc-123', '/index.html'],
    ['/index.html', '/index.html'],
    ['/assets/index-abc123.js', '/assets/index-abc123.js'],
    ['/favicon.png', '/favicon.png'],
  ])('%s → %s', (uri, expected) => {
    expect(rewrite({ request: { uri } }).uri).toBe(expected);
  });
});

describe('WebStack — sandbox', () => {
  let template: Template;

  beforeAll(() => {
    template = makeTemplate('sandbox');
  });

  test('creates a private S3 bucket for the SPA', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'lapcat-web-123456789012-sandbox',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('sandbox bucket is destroyed with the stack', () => {
    const buckets = template.findResources('AWS::S3::Bucket');
    expect((Object.values(buckets)[0] as { DeletionPolicy?: string }).DeletionPolicy).toBe('Delete');
  });

  test('uses an origin access control, not a legacy OAI', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.resourceCountIs('AWS::CloudFront::CloudFrontOriginAccessIdentity', 0);
  });

  test('distribution serves lapcat.sandbox.nakomis.com with the us-east-1 certificate', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['lapcat.sandbox.nakomis.com'],
        DefaultRootObject: 'index.html',
        PriceClass: 'PriceClass_100',
        ViewerCertificate: Match.objectLike({ AcmCertificateArn: MOCK_CERT_ARN, SslSupportMethod: 'sni-only' }),
      }),
    });
  });

  test('has NO distribution-wide CustomErrorResponses (SPA routing uses a CloudFront Function)', () => {
    const dists = template.findResources('AWS::CloudFront::Distribution');
    const [dist] = Object.values(dists) as { Properties: { DistributionConfig: Record<string, unknown> } }[];
    expect(dist.Properties.DistributionConfig.CustomErrorResponses).toBeUndefined();
  });

  test('default behaviour attaches the rewrite function on viewer-request', () => {
    template.hasResourceProperties('AWS::CloudFront::Function', {
      Name: 'lapcat-web-spa-rewrite-sandbox',
      FunctionConfig: Match.objectLike({ Runtime: 'cloudfront-js-2.0' }),
      FunctionCode: SPA_REWRITE_FUNCTION_CODE,
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
          FunctionAssociations: [{ EventType: 'viewer-request', FunctionARN: Match.anyValue() }],
        }),
      }),
    });
  });

  test('creates A and AAAA aliases for lapcat.sandbox.nakomis.com', () => {
    for (const Type of ['A', 'AAAA']) {
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: 'lapcat.sandbox.nakomis.com.',
        Type,
        HostedZoneId: 'Z03586633NXU18LFL0JTL',
      });
    }
  });

  test('creates the lapcat-web-sandbox Cognito client: code + PKCE, no secret', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'lapcat-web-sandbox',
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
      AllowedOAuthScopes: Match.arrayWith(['openid', 'email', 'profile']),
      CallbackURLs: ['https://lapcat.sandbox.nakomis.com/loggedin', 'http://localhost:3000/loggedin'],
      LogoutURLs: ['https://lapcat.sandbox.nakomis.com/logout', 'http://localhost:3000/logout'],
    });
  });

  test('creates One Dark managed login branding for the web client', () => {
    template.hasResourceProperties('AWS::Cognito::ManagedLoginBranding', {
      UseCognitoProvidedValues: false,
      ClientId: Match.anyValue(),
      Settings: Match.objectLike({
        categories: { global: Match.objectLike({ colorSchemeMode: 'DARK' }) },
        components: Match.objectLike({ pageBackground: Match.objectLike({ darkMode: { color: '282c34ff' } }) }),
      }),
    });
  });

  test.each([
    '/lapcat/sandbox/web/client-id',
    '/lapcat/sandbox/web/user-pool-id',
    '/lapcat/sandbox/web/login-domain',
    '/lapcat/sandbox/web/bucket',
    '/lapcat/sandbox/web/distribution-id',
  ])('publishes SSM parameter %s', (Name) => {
    template.hasResourceProperties('AWS::SSM::Parameter', { Name, Type: 'String' });
  });

  test('does not claim any of the iOS client SSM parameters', () => {
    const params = template.findResources('AWS::SSM::Parameter');
    const names = Object.values(params).map((p) => (p as { Properties: { Name: string } }).Properties.Name);
    expect(names.filter((n) => n.includes('/cognito/'))).toEqual([]);
  });

  test('outputs the web URL', () => {
    template.hasOutput('WebUrl', { Value: 'https://lapcat.sandbox.nakomis.com' });
  });
});

describe('WebStack — prod', () => {
  let template: Template;

  beforeAll(() => {
    template = makeTemplate('prod');
  });

  test('serves lapcat.nakomis.com', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: ['lapcat.nakomis.com'] }),
    });
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'lapcat.nakomis.com.',
      HostedZoneId: 'Z019437529YGFB53BDUGR',
    });
  });

  test('prod bucket is retained', () => {
    template.hasResourceProperties('AWS::S3::Bucket', { BucketName: 'lapcat-web-123456789012-prod' });
    const buckets = template.findResources('AWS::S3::Bucket');
    expect((Object.values(buckets)[0] as { DeletionPolicy?: string }).DeletionPolicy).toBe('Retain');
  });

  test('prod client uses prod URLs and SSM path', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'lapcat-web-prod',
      CallbackURLs: Match.arrayWith(['https://lapcat.nakomis.com/loggedin']),
      LogoutURLs: Match.arrayWith(['https://lapcat.nakomis.com/logout']),
    });
    template.hasResourceProperties('AWS::SSM::Parameter', { Name: '/lapcat/prod/web/client-id' });
  });
});
