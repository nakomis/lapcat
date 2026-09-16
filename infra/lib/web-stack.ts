import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { HOSTED_ZONES, webDomain } from './hosted-zones';
import { webLoginBrandingSettings } from './login-branding';

export interface WebStackProps extends cdk.StackProps {
  deployEnv: 'sandbox' | 'prod';
  /** us-east-1 certificate for lapcat.{zoneName} (from WebCertStack). */
  certificate: acm.ICertificate;
}

/**
 * Viewer-request function for SPA client-side routing: any path whose final
 * segment has no file extension (`/`, `/loggedin`, `/logout`, …) is served
 * `/index.html`; real assets (`/assets/index-abc.js`, `/favicon.png`) pass
 * through untouched.
 *
 * Deliberately NOT `errorResponses` — those are distribution-wide and would
 * rewrite every genuine 403/404 into a 200 with index.html, including any
 * behaviour added later (e.g. an API origin).
 */
export const SPA_REWRITE_FUNCTION_CODE = `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}`;

export class WebStack extends cdk.Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
  readonly webClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const { deployEnv, certificate } = props;
    const isProd = deployEnv === 'prod';
    const removalPolicy = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
    const { hostedZoneId, zoneName } = HOSTED_ZONES[deployEnv];
    const appDomain = webDomain(deployEnv);

    // ── Cognito web client on the shared pool ─────────────────────────────────
    const userPoolId = ssm.StringParameter.valueForStringParameter(
      this, `/nakomis-infra/${deployEnv}/cognito/user-pool-id`,
    );
    const userPool = cognito.UserPool.fromUserPoolId(this, 'SharedPool', userPoolId);
    const loginDomain = ssm.StringParameter.valueForStringParameter(
      this, `/nakomis-infra/${deployEnv}/cognito/login-domain`,
    );

    // Browser SPA: authorisation code + PKCE, so no client secret.
    this.webClient = new cognito.UserPoolClient(this, 'WebClient', {
      userPoolClientName: `lapcat-web-${deployEnv}`,
      userPool,
      authFlows: { userSrp: true },
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: [`https://${appDomain}/loggedin`, 'http://localhost:3000/loggedin'],
        logoutUrls:   [`https://${appDomain}/logout`,   'http://localhost:3000/logout'],
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
      },
    });

    // Managed Login v2 needs a branding resource per client, or the hosted page
    // serves "Login pages unavailable".
    const branding = new cognito.CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: this.webClient.userPoolClientId,
      useCognitoProvidedValues: false,
      settings: webLoginBrandingSettings,
    });
    branding.node.addDependency(this.webClient);

    // ── S3 + CloudFront ───────────────────────────────────────────────────────
    this.bucket = new s3.Bucket(this, 'SpaBucket', {
      bucketName: `lapcat-web-${this.account}-${deployEnv}`,
      removalPolicy,
      autoDeleteObjects: !isProd,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      originAccessControlName: `lapcat-web-${deployEnv}`,
    });

    const spaRewrite = new cloudfront.Function(this, 'SpaRewriteFunction', {
      functionName: `lapcat-web-spa-rewrite-${deployEnv}`,
      comment: 'Rewrite extensionless paths to /index.html for SPA routing',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(SPA_REWRITE_FUNCTION_CODE),
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `lapcat web portal (${deployEnv})`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, { originAccessControl: oac }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      defaultRootObject: 'index.html',
      // No errorResponses — see SPA_REWRITE_FUNCTION_CODE.
      domainNames: [appDomain],
      certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // ── DNS ───────────────────────────────────────────────────────────────────
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId,
      zoneName,
    });
    const target = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(this.distribution));
    new route53.ARecord(this, 'WebAliasA', { zone, recordName: appDomain, target });
    new route53.AaaaRecord(this, 'WebAliasAaaa', { zone, recordName: appDomain, target });

    // ── SSM: read by scripts/set-config.sh, CI deploys and ApiStack ──────────
    // The web config is read entirely from /lapcat/{env}/*, which is the only
    // namespace the CI role may read — hence republishing the pool id and
    // login domain here rather than having set-config.sh read /nakomis-infra.
    new ssm.StringParameter(this, 'WebClientIdParam', {
      parameterName: `/lapcat/${deployEnv}/web/client-id`,
      stringValue: this.webClient.userPoolClientId,
      description: `Lapcat web portal Cognito app client ID (${deployEnv})`,
    });
    new ssm.StringParameter(this, 'WebUserPoolIdParam', {
      parameterName: `/lapcat/${deployEnv}/web/user-pool-id`,
      stringValue: userPoolId,
      description: `Shared Cognito user pool ID used by the Lapcat web portal (${deployEnv})`,
    });
    new ssm.StringParameter(this, 'WebLoginDomainParam', {
      parameterName: `/lapcat/${deployEnv}/web/login-domain`,
      stringValue: loginDomain,
      description: `Cognito managed login domain used by the Lapcat web portal (${deployEnv})`,
    });
    new ssm.StringParameter(this, 'WebBucketParam', {
      parameterName: `/lapcat/${deployEnv}/web/bucket`,
      stringValue: this.bucket.bucketName,
      description: `Lapcat web portal S3 bucket (${deployEnv})`,
    });
    new ssm.StringParameter(this, 'WebDistributionIdParam', {
      parameterName: `/lapcat/${deployEnv}/web/distribution-id`,
      stringValue: this.distribution.distributionId,
      description: `Lapcat web portal CloudFront distribution ID (${deployEnv})`,
    });

    new cdk.CfnOutput(this, 'WebUrl', { value: `https://${appDomain}` });
    new cdk.CfnOutput(this, 'DistributionDomainName', { value: this.distribution.domainName });
    new cdk.CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    new cdk.CfnOutput(this, 'WebClientId', { value: this.webClient.userPoolClientId });
  }
}
