import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { GithubCiStack } from '../lib/github-ci-stack';

const OIDC_ARN = 'arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com';

function makeStack(deployEnv: 'sandbox' | 'prod' = 'sandbox') {
  const app = new cdk.App();
  const stack = new GithubCiStack(app, 'TestGithubCiStack', {
    env: { account: '123456789012', region: 'eu-west-2' },
    deployEnv,
    githubOidcProviderArn: OIDC_ARN,
  });
  return Template.fromStack(stack);
}

describe('GithubCiStack', () => {
  let sandboxTemplate: Template;

  beforeAll(() => {
    sandboxTemplate = makeStack('sandbox');
  });

  test('creates the CI role with the expected name', () => {
    sandboxTemplate.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nakomis-lapcat-github-ci-sandbox',
    });
  });

  test('trust policy accepts both immutable-id and legacy repo subjects', () => {
    sandboxTemplate.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Federated: OIDC_ARN },
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              },
              StringLike: {
                'token.actions.githubusercontent.com:sub': [
                  'repo:nakomis@1488244/lapcat@1373129133:*',
                  'repo:nakomis/lapcat:*',
                ],
              },
            },
          }),
        ]),
      },
    });
  });

  test('role has CdkDeploy inline policy with sts:AssumeRole on CDK bootstrap roles', () => {
    sandboxTemplate.hasResourceProperties('AWS::IAM::Role', {
      Policies: Match.arrayWith([
        Match.objectLike({
          PolicyName: 'CdkDeploy',
          PolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Action: 'sts:AssumeRole',
                Resource: Match.stringLikeRegexp('cdk-hnb659fds-\\*'),
              }),
            ]),
          },
        }),
      ]),
    });
  });

  test('role has SsmRead policy scoped to the lapcat parameter namespace', () => {
    sandboxTemplate.hasResourceProperties('AWS::IAM::Role', {
      Policies: Match.arrayWith([
        Match.objectLike({
          PolicyName: 'SsmRead',
          PolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Action: Match.arrayWith(['ssm:GetParameter', 'ssm:GetParameters']),
                Resource: Match.stringLikeRegexp('parameter/lapcat/sandbox/\\*'),
              }),
            ]),
          },
        }),
      ]),
    });
  });

  test('role may publish only its own environment version parameter', () => {
    sandboxTemplate.hasResourceProperties('AWS::IAM::Role', {
      Policies: Match.arrayWith([
        Match.objectLike({
          PolicyName: 'VersionPublish',
          PolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Action: 'ssm:PutParameter',
                Resource: Match.stringLikeRegexp('parameter/lapcat/sandbox/version$'),
              }),
            ]),
          },
        }),
      ]),
    });
  });

  test('role may upload the web portal and invalidate CloudFront', () => {
    sandboxTemplate.hasResourceProperties('AWS::IAM::Role', {
      Policies: Match.arrayWith([
        Match.objectLike({
          PolicyName: 'WebDeploy',
          PolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Action: ['s3:PutObject', 's3:DeleteObject'],
                Resource: 'arn:aws:s3:::lapcat-web-123456789012-sandbox/*',
              }),
              Match.objectLike({
                Action: 's3:ListBucket',
                Resource: 'arn:aws:s3:::lapcat-web-123456789012-sandbox',
              }),
              Match.objectLike({
                Action: 'cloudfront:CreateInvalidation',
                Resource: '*',
              }),
            ]),
          },
        }),
      ]),
    });
  });

  test('outputs the role ARN', () => {
    sandboxTemplate.hasOutput('CiRoleArn', {});
  });

  test('prod uses prod suffix in role name', () => {
    const prodTemplate = makeStack('prod');
    prodTemplate.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nakomis-lapcat-github-ci-prod',
    });
  });
});
