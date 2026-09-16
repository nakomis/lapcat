import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { HOSTED_ZONES } from './hosted-zones';

export interface CertStackProps extends cdk.StackProps {
  deployEnv: 'sandbox' | 'prod';
}

export class CertStack extends cdk.Stack {
  readonly certificate: acm.Certificate;
  readonly zone: route53.IHostedZone;
  readonly appDomain: string;

  constructor(scope: Construct, id: string, props: CertStackProps) {
    super(scope, id, props);

    const { deployEnv } = props;
    const { hostedZoneId, zoneName } = HOSTED_ZONES[deployEnv];

    // api.lapcat.{zoneName}. The web portal's lapcat.{zoneName} cert lives in
    // WebCertStack, because CloudFront needs it in us-east-1.
    this.appDomain = `api.lapcat.${zoneName}`;

    this.zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId,
      zoneName,
    });

    // API Gateway regional custom domains need a cert in the same region (eu-west-2).
    this.certificate = new acm.Certificate(this, 'Cert', {
      domainName: this.appDomain,
      validation: acm.CertificateValidation.fromDns(this.zone),
    });

    new cdk.CfnOutput(this, 'AppDomain', { value: this.appDomain });
  }
}
