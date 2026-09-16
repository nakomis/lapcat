import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GithubCiStackProps extends cdk.StackProps {
  deployEnv: 'sandbox' | 'prod';
  /** ARN of the GitHub OIDC provider, which already exists in both accounts. */
  githubOidcProviderArn: string;
}

/**
 * The role GitHub Actions assumes to deploy Lapcat. Deliberately narrow: it may
 * assume the CDK bootstrap roles and read this project's own SSM parameters, and
 * nothing else. Everything a deploy actually does happens through the bootstrap
 * roles.
 */
export class GithubCiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GithubCiStackProps) {
    super(scope, id, props);

    const { deployEnv, githubOidcProviderArn } = props;

    const githubOidc = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this, 'GithubOidc', githubOidcProviderArn,
    );

    const role = new iam.Role(this, 'LapcatCiRole', {
      roleName: `nakomis-lapcat-github-ci-${deployEnv}`,
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidc.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          // Both the immutable-id subject GitHub emits today and the legacy
          // name-only one are accepted (a list is an OR).
          StringLike: {
            'token.actions.githubusercontent.com:sub': [
              'repo:nakomis@1488244/lapcat@1373129133:*',
              'repo:nakomis/lapcat:*',
            ],
          },
        },
      ),
      description: `Assumed by lapcat GitHub Actions CI (${deployEnv})`,
      inlinePolicies: {
        CdkDeploy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['sts:AssumeRole'],
              resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`],
            }),
          ],
        }),
        // The deploy step doesn't itself need to read SSM (params are consumed by
        // the iOS build, not CI), but future workflow steps (e.g. a post-deploy
        // smoke test) may need to read this project's own params back out.
        SsmRead: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ssm:GetParameter', 'ssm:GetParameters'],
              resources: [
                `arn:aws:ssm:${this.region}:${this.account}:parameter/lapcat/${deployEnv}/*`,
              ],
            }),
          ],
        }),
        // CI publishes the version it just deployed (from the shared deployment
        // tracker) so a local `fastlane beta` can stamp the same version on the
        // TestFlight build — the tracker API itself only admits CI roles.
        VersionPublish: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ssm:PutParameter'],
              resources: [
                `arn:aws:ssm:${this.region}:${this.account}:parameter/lapcat/${deployEnv}/version`,
              ],
            }),
          ],
        }),
      },
    });

    new cdk.CfnOutput(this, 'CiRoleArn', {
      value: role.roleArn,
      description: `IAM role for lapcat GitHub Actions CI (${deployEnv})`,
    });
  }
}
