#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CertStack } from '../lib/cert-stack';
import { DataStack } from '../lib/data-stack';
import { ApiStack } from '../lib/api-stack';
import { GithubCiStack } from '../lib/github-ci-stack';
import { WebCertStack } from '../lib/web-cert-stack';
import { WebStack } from '../lib/web-stack';

const npmEnvironment = process.env.NPM_ENVIRONMENT;
if (!npmEnvironment) {
  throw new Error('NPM_ENVIRONMENT is not set. Use `npm run deploy-sandbox` or `npm run deploy-prod`.');
}
if (npmEnvironment !== 'sandbox' && npmEnvironment !== 'prod') {
  throw new Error(`Unknown NPM_ENVIRONMENT "${npmEnvironment}". Must be "sandbox" or "prod".`);
}

const deployEnv = npmEnvironment as 'sandbox' | 'prod';
const isProd = deployEnv === 'prod';

const sandboxAccountId = '975050268859';
const prodAccountId    = '637423226886';
const accountId        = isProd ? prodAccountId : sandboxAccountId;

const londonEnv = { env: { account: accountId, region: 'eu-west-2' } };
const githubOidcProviderArn = `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`;

const app = new cdk.App();

const certStack = new CertStack(app, 'LapcatCertStack', {
  ...londonEnv,
  deployEnv,
  description: `ACM certificate for api.lapcat.${isProd ? 'nakomis.com' : 'sandbox.nakomis.com'} (${deployEnv})`,
});

const dataStack = new DataStack(app, 'LapcatDataStack', {
  ...londonEnv,
  deployEnv,
  description: `Lapcat S3 bucket and DynamoDB table (${deployEnv})`,
});

const apiStack = new ApiStack(app, 'LapcatApiStack', {
  ...londonEnv,
  deployEnv,
  swimsTable: dataStack.swimsTable,
  swimsBucket: dataStack.swimsBucket,
  certificate: certStack.certificate,
  zone: certStack.zone,
  appDomain: certStack.appDomain,
  description: `Lapcat API Gateway, Lambda functions, and Cognito client (${deployEnv})`,
});
apiStack.addDependency(certStack);
apiStack.addDependency(dataStack);

// CloudFront only accepts certificates from us-east-1.
const webCertStack = new WebCertStack(app, 'LapcatWebCertStack', {
  env: { account: accountId, region: 'us-east-1' },
  deployEnv,
  crossRegionReferences: true,
  description: `ACM certificate for lapcat.${isProd ? 'nakomis.com' : 'sandbox.nakomis.com'} (us-east-1, for CloudFront) (${deployEnv})`,
});

const webStack = new WebStack(app, 'LapcatWebStack', {
  ...londonEnv,
  deployEnv,
  certificate: webCertStack.certificate,
  crossRegionReferences: true,
  description: `Lapcat web portal: S3 + CloudFront hosting and Cognito web client (${deployEnv})`,
});

// ApiStack's JWT authoriser reads the web client ID that WebStack publishes to
// SSM (/lapcat/{env}/web/client-id), so WebStack must deploy before ApiStack.
// Reading it by parameter name rather than passing the construct keeps the
// dependency one-way, with no cross-stack export between them.
apiStack.addDependency(webStack);

new GithubCiStack(app, 'LapcatGithubCiStack', {
  ...londonEnv,
  deployEnv,
  githubOidcProviderArn,
  description: `GitHub Actions OIDC role for lapcat CI (${deployEnv})`,
});

cdk.Tags.of(app).add('MH-Project', 'lapcat');
cdk.Tags.of(app).add('MH-Environment', deployEnv);
