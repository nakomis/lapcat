import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import { Construct } from 'constructs';
import { webDomain } from './hosted-zones';

export interface ApiStackProps extends cdk.StackProps {
  deployEnv: 'sandbox' | 'prod';
  swimsTable: dynamodb.ITable;
  swimsBucket: s3.IBucket;
  certificate: acm.ICertificate;
  zone: route53.IHostedZone;
  appDomain: string;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { deployEnv, swimsTable, swimsBucket, certificate, zone, appDomain } = props;

    // ── Shared Cognito user pool ──────────────────────────────────────────────
    const userPoolId = ssm.StringParameter.valueForStringParameter(
      this, `/nakomis-infra/${deployEnv}/cognito/user-pool-id`,
    );
    const userPool = cognito.UserPool.fromUserPoolId(this, 'SharedPool', userPoolId);
    const loginDomain = ssm.StringParameter.valueForStringParameter(
      this, `/nakomis-infra/${deployEnv}/cognito/login-domain`,
    );

    // Lapcat app client. iOS uses PKCE (no client secret) — Apple Watch app talks
    // through the paired iPhone, so there is only ever one native client.
    const client = new cognito.UserPoolClient(this, 'LapcatClient', {
      userPoolClientName: `lapcat-${deployEnv}`,
      userPool,
      authFlows: { userSrp: true },
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: ['com.nakomis.lapcat://callback'],
        logoutUrls: ['com.nakomis.lapcat://logout'],
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
      },
    });

    // Managed Login v2 requires an explicit branding resource per client.
    // Without it the hosted UI returns "Login pages unavailable". Colour scheme
    // matches the rest of the nakomis estate (One Dark palette, dark-only).
    new cognito.CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: client.userPoolClientId,
      useCognitoProvidedValues: false,
      settings: {
        components: {
          // Colours are defined under `darkMode` only — the Managed Login schema has
          // no light-mode colour properties (setting them fails validation with
          // UnknownProperty). categories.global.colorSchemeMode is DARK below, so
          // this palette is used in all conditions.
          pageBackground: {
            image: { enabled: false },
            darkMode: { color: '282c34ff' },
          },
          pageHeader: {
            backgroundImage: { enabled: false },
            logo: { location: 'START', enabled: false },
            darkMode: { background: { color: '21252bff' }, borderColor: '3e4451ff' },
          },
          pageFooter: {
            backgroundImage: { enabled: false },
            logo: { location: 'START', enabled: false },
            darkMode: { background: { color: '21252bff' }, borderColor: '3e4451ff' },
          },
          form: {
            borderRadius: 8,
            backgroundImage: { enabled: false },
            logo: { location: 'CENTER', position: 'TOP', enabled: false, formInclusion: 'IN' },
            darkMode: { backgroundColor: '2c313aff', borderColor: '3e4451ff' },
          },
          pageText: {
            darkMode: { bodyColor: 'abb2bfff', headingColor: 'ffffffff', descriptionColor: '5c6370ff' },
          },
          primaryButton: {
            darkMode: {
              defaults: { backgroundColor: '2563ebff', textColor: 'ffffffff' },
              hover:    { backgroundColor: '1d4ed8ff', textColor: 'ffffffff' },
              active:   { backgroundColor: '1e40afff', textColor: 'ffffffff' },
              disabled: { backgroundColor: '2c313aff', borderColor: '3e4451ff' },
            },
          },
          secondaryButton: {
            darkMode: {
              defaults: { backgroundColor: '2c313aff', borderColor: '3e4451ff', textColor: 'abb2bfff' },
              hover:    { backgroundColor: '353b45ff', borderColor: '528bffff', textColor: 'ffffffff' },
              active:   { backgroundColor: '21252bff', borderColor: '3e4451ff', textColor: 'ffffffff' },
            },
          },
          alert: {
            borderRadius: 4,
            darkMode: { error: { backgroundColor: '3a1515ff', borderColor: 'e06c75ff' } },
          },
          idpButton: {
            standard: {
              darkMode: {
                defaults: { backgroundColor: '2c313aff', borderColor: '3e4451ff', textColor: 'abb2bfff' },
                hover:    { backgroundColor: '353b45ff', borderColor: '528bffff', textColor: 'ffffffff' },
                active:   { backgroundColor: '21252bff', borderColor: '3e4451ff', textColor: 'ffffffff' },
              },
            },
            custom: {},
          },
          phoneNumberSelector: { displayType: 'TEXT' },
          favicon: { enabledTypes: ['ICO', 'SVG'] },
        },
        // Force the dark colour scheme so the login page is dark even when the
        // device is in light mode. Without this the page falls back to Cognito's
        // default light theme and renders white.
        categories: {
          global: {
            colorSchemeMode: 'DARK',
            spacingDensity: 'REGULAR',
          },
        },
      },
    });

    new ssm.StringParameter(this, 'CognitoClientIdParam', {
      parameterName: `/lapcat/${deployEnv}/cognito/client-id`,
      stringValue: client.userPoolClientId,
      description: `Lapcat Cognito app client ID (${deployEnv})`,
    });

    new ssm.StringParameter(this, 'CognitoDomainParam', {
      parameterName: `/lapcat/${deployEnv}/cognito/domain`,
      stringValue: loginDomain,
      description: `Cognito managed login domain used by the Lapcat app client (${deployEnv})`,
    });

    // ── Lambda shared config ──────────────────────────────────────────────────
    const runtime = lambda.Runtime.NODEJS_24_X;
    const architecture = lambda.Architecture.ARM_64;
    const bundling: nodejs.BundlingOptions = {
      externalModules: [],
      format: nodejs.OutputFormat.CJS,
    };
    const commonEnv = {
      SWIMS_TABLE: swimsTable.tableName,
      SWIMS_BUCKET: swimsBucket.bucketName,
      DEPLOY_ENV: deployEnv,
    };

    // Explicit, predictably-named log group per function (so they're easy to find
    // in the console) with 6-month retention. Without this, Lambda auto-creates a
    // `/aws/lambda/<fn>` group that never expires. Retained on prod, torn down on
    // sandbox alongside the function.
    const logRemoval = deployEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
    const logGroupFor = (id: string, functionName: string) =>
      new logs.LogGroup(this, id, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.SIX_MONTHS,
        removalPolicy: logRemoval,
      });

    // ── Lambda: POST /swims/{swimId}/upload-url ───────────────────────────────
    const uploadUrlFn = new nodejs.NodejsFunction(this, 'UploadUrlFn', {
      functionName: `lapcat-upload-url-${deployEnv}`,
      entry: path.join(__dirname, '../lambda/swims/upload-url.ts'),
      handler: 'handler',
      runtime,
      architecture,
      environment: commonEnv,
      bundling,
      logGroup: logGroupFor('UploadUrlFnLogs', `lapcat-upload-url-${deployEnv}`),
    });
    swimsBucket.grantPut(uploadUrlFn);

    // ── Lambda: POST /swims/{swimId} (confirm) ────────────────────────────────
    const confirmFn = new nodejs.NodejsFunction(this, 'ConfirmFn', {
      functionName: `lapcat-confirm-${deployEnv}`,
      entry: path.join(__dirname, '../lambda/swims/confirm.ts'),
      handler: 'handler',
      runtime,
      architecture,
      environment: commonEnv,
      bundling,
      logGroup: logGroupFor('ConfirmFnLogs', `lapcat-confirm-${deployEnv}`),
    });
    swimsBucket.grantRead(confirmFn);
    swimsTable.grantWriteData(confirmFn);

    // ── Lambda: GET /swims ─────────────────────────────────────────────────────
    const listFn = new nodejs.NodejsFunction(this, 'ListFn', {
      functionName: `lapcat-list-${deployEnv}`,
      entry: path.join(__dirname, '../lambda/swims/list.ts'),
      handler: 'handler',
      runtime,
      architecture,
      environment: commonEnv,
      bundling,
      logGroup: logGroupFor('ListFnLogs', `lapcat-list-${deployEnv}`),
    });
    swimsTable.grantReadData(listFn);

    // ── Lambda: GET /swims/{swimId} ───────────────────────────────────────────
    const getFn = new nodejs.NodejsFunction(this, 'GetFn', {
      functionName: `lapcat-get-${deployEnv}`,
      entry: path.join(__dirname, '../lambda/swims/get.ts'),
      handler: 'handler',
      runtime,
      architecture,
      environment: commonEnv,
      bundling,
      logGroup: logGroupFor('GetFnLogs', `lapcat-get-${deployEnv}`),
    });
    swimsTable.grantReadData(getFn);
    swimsBucket.grantRead(getFn);

    // ── JWT authoriser ────────────────────────────────────────────────────────
    // Accepts ID tokens from both the native iOS client (above) and the web
    // portal client. The web client lives in WebStack and is read back by SSM
    // parameter *name* rather than passed as a construct, so there is no
    // cross-stack export to pin the two stacks together; WebStack must simply
    // deploy first (see apiStack.addDependency(webStack) in bin/lapcat.ts).
    const webClientId = ssm.StringParameter.valueForStringParameter(
      this, `/lapcat/${deployEnv}/web/client-id`,
    );
    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPoolId}`,
      {
        authorizerName: `lapcat-cognito-${deployEnv}`,
        identitySource: ['$request.header.Authorization'],
        jwtAudience: [client.userPoolClientId, webClientId],
      },
    );

    // ── Custom domain ─────────────────────────────────────────────────────────
    const domainName = new apigwv2.DomainName(this, 'ApiDomain', {
      domainName: appDomain,
      certificate,
    });

    // ── HTTP API ──────────────────────────────────────────────────────────────
    // CORS for the web portal (LAPC-12), which fetches /swims and /swims/{id}
    // from the browser. localhost:3000 (the Vite dev server / Cognito's
    // localhost callback) is only allowed on sandbox — never on prod.
    const allowOrigins = [`https://${webDomain(deployEnv)}`];
    if (deployEnv === 'sandbox') {
      allowOrigins.push('http://localhost:3000');
    }
    const api = new apigwv2.HttpApi(this, 'Api', {
      apiName: `lapcat-api-${deployEnv}`,
      defaultAuthorizer: authorizer,
      defaultDomainMapping: { domainName },
      corsPreflight: {
        allowOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Authorization', 'Content-Type'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    api.addRoutes({ path: '/swims/{swimId}/upload-url', methods: [apigwv2.HttpMethod.POST], integration: new HttpLambdaIntegration('UploadUrlInt', uploadUrlFn) });
    api.addRoutes({ path: '/swims/{swimId}',             methods: [apigwv2.HttpMethod.POST], integration: new HttpLambdaIntegration('ConfirmInt',   confirmFn) });
    api.addRoutes({ path: '/swims',                      methods: [apigwv2.HttpMethod.GET],  integration: new HttpLambdaIntegration('ListInt',      listFn) });
    api.addRoutes({ path: '/swims/{swimId}',              methods: [apigwv2.HttpMethod.GET],  integration: new HttpLambdaIntegration('GetInt',       getFn) });

    // ── Access logging ─────────────────────────────────────────────────────────
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/lapcat-api-${deployEnv}`,
      retention: logs.RetentionDays.SIX_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const defaultStage = api.defaultStage!.node.defaultChild as apigwv2.CfnStage;
    defaultStage.accessLogSettings = {
      destinationArn: accessLogGroup.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        time: '$context.requestTime',
        routeKey: '$context.routeKey',
        method: '$context.httpMethod',
        path: '$context.path',
        status: '$context.status',
        integrationStatus: '$context.integrationStatus',
        integrationError: '$context.integrationErrorMessage',
        authorizerError: '$context.authorizer.error',
        userId: '$context.authorizer.claims.sub',
        userAgent: '$context.identity.userAgent',
        responseLatency: '$context.responseLatency',
      }),
    };

    // ── Route53 alias → API Gateway custom domain ─────────────────────────────
    new route53.ARecord(this, 'ApiDnsRecord', {
      zone,
      recordName: 'api.lapcat',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId,
        ),
      ),
    });

    new ssm.StringParameter(this, 'ApiUrlParam', {
      parameterName: `/lapcat/${deployEnv}/api/url`,
      stringValue: `https://${appDomain}`,
      description: `Lapcat API base URL (${deployEnv})`,
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: `https://${appDomain}` });
    new cdk.CfnOutput(this, 'CognitoClientId', { value: client.userPoolClientId });
  }
}
