import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DataStack } from '../lib/data-stack';
import { ApiStack } from '../lib/api-stack';

function makeStack(deployEnv: 'sandbox' | 'prod' = 'sandbox') {
  const app = new cdk.App();
  const env = { account: '123456789012', region: 'eu-west-2' };
  const dataStack = new DataStack(app, 'DataStack', { env, deployEnv });
  const certHolder = new cdk.Stack(app, 'CertHolderStack', { env });
  const certificate = acm.Certificate.fromCertificateArn(
    certHolder, 'Cert', 'arn:aws:acm:eu-west-2:123456789012:certificate/abc-123',
  );
  const zone = route53.HostedZone.fromHostedZoneAttributes(certHolder, 'Zone', {
    hostedZoneId: 'Z0123456789',
    zoneName: deployEnv === 'prod' ? 'nakomis.com' : 'sandbox.nakomis.com',
  });
  const appDomain = `api.lapcat.${deployEnv === 'prod' ? 'nakomis.com' : 'sandbox.nakomis.com'}`;

  const stack = new ApiStack(app, 'ApiStack', {
    env,
    deployEnv,
    swimsTable: dataStack.swimsTable,
    swimsBucket: dataStack.swimsBucket,
    certificate,
    zone,
    appDomain,
  });
  return Template.fromStack(stack);
}

describe('ApiStack — sandbox', () => {
  let template: Template;

  beforeAll(() => {
    template = makeStack('sandbox');
  });

  test('creates an HTTP API named lapcat-api-sandbox', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'lapcat-api-sandbox',
    });
  });

  test('creates a Cognito JWT authorizer', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
    });
  });

  test('creates four Lambda functions for the API handlers', () => {
    template.resourceCountIs('AWS::Lambda::Function', 4);
  });

  test('Lambda functions use the arm64 architecture', () => {
    const fns = template.findResources('AWS::Lambda::Function');
    for (const fn of Object.values(fns) as { Properties: { Architectures?: string[] } }[]) {
      expect(fn.Properties.Architectures).toEqual(['arm64']);
    }
  });

  test('creates POST /swims/{swimId}/upload-url route', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /swims/{swimId}/upload-url',
    });
  });

  test('creates POST /swims/{swimId} route (confirm)', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /swims/{swimId}',
    });
  });

  test('creates GET /swims route', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /swims',
    });
  });

  test('creates GET /swims/{swimId} route', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /swims/{swimId}',
    });
  });

  test('authoriser accepts both the iOS client and the web portal client', () => {
    const authorizers = template.findResources('AWS::ApiGatewayV2::Authorizer');
    const [authorizer] = Object.values(authorizers) as {
      Properties: { JwtConfiguration: { Audience: unknown[] } };
    }[];
    const audience = authorizer.Properties.JwtConfiguration.Audience;
    expect(audience).toHaveLength(2);
    // iOS client: a Ref to the UserPoolClient in this stack.
    const [iosClientLogicalId] = Object.keys(template.findResources('AWS::Cognito::UserPoolClient'));
    expect(audience).toContainEqual({ Ref: iosClientLogicalId });
    // Web client: resolved from SSM by name (published by WebStack).
    const params = template.toJSON().Parameters as Record<string, { Default?: string }>;
    const webParam = Object.entries(params).find(([, p]) => p.Default === '/lapcat/sandbox/web/client-id');
    expect(webParam).toBeDefined();
    expect(audience).toContainEqual({ Ref: webParam![0] });
  });

  test('routes are protected by the JWT authorizer', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /swims',
      AuthorizationType: 'JWT',
      AuthorizerId: Match.anyValue(),
    });
  });

  test('creates the lapcat-sandbox Cognito app client with PKCE (no secret)', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'lapcat-sandbox',
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
      CallbackURLs: ['com.nakomis.lapcat://callback'],
      LogoutURLs: ['com.nakomis.lapcat://logout'],
      AllowedOAuthScopes: Match.arrayWith(['openid', 'email', 'profile']),
    });
  });

  test('creates a managed login branding resource', () => {
    template.resourceCountIs('AWS::Cognito::ManagedLoginBranding', 1);
  });

  test('publishes the client ID, API URL, and Cognito domain SSM parameters', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/lapcat/sandbox/cognito/client-id',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/lapcat/sandbox/api/url',
      Value: 'https://api.lapcat.sandbox.nakomis.com',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/lapcat/sandbox/cognito/domain',
    });
  });

  test('outputs the API URL and Cognito client ID', () => {
    template.hasOutput('ApiUrl', { Value: 'https://api.lapcat.sandbox.nakomis.com' });
    template.hasOutput('CognitoClientId', {});
  });

  test('CORS allows the sandbox web portal and localhost, GET/POST/OPTIONS with Authorization', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: {
        AllowOrigins: Match.arrayWith(['https://lapcat.sandbox.nakomis.com', 'http://localhost:3000']),
        AllowMethods: Match.arrayWith(['GET', 'POST', 'OPTIONS']),
        AllowHeaders: Match.arrayWith(['Authorization', 'Content-Type']),
      },
    });
  });
});

describe('ApiStack — prod', () => {
  let template: Template;

  beforeAll(() => {
    template = makeStack('prod');
  });

  test('uses the prod domain and client name', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'lapcat-prod',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/lapcat/prod/api/url',
      Value: 'https://api.lapcat.nakomis.com',
    });
  });

  test('CORS on prod allows only the prod web portal, not localhost', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['https://lapcat.nakomis.com'],
      }),
    });
  });
});
