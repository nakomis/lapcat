import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { HOSTED_ZONES, webDomain } from './hosted-zones';

export interface WebCertStackProps extends cdk.StackProps {
  deployEnv: 'sandbox' | 'prod';
}

/**
 * ACM certificate for the web portal (lapcat.{zoneName}). CloudFront only
 * accepts certificates from us-east-1, so this stack must be deployed there;
 * WebStack (eu-west-2) consumes it via crossRegionReferences.
 */
export class WebCertStack extends cdk.Stack {
  readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: WebCertStackProps) {
    super(scope, id, props);

    const { deployEnv } = props;
    const { hostedZoneId, zoneName } = HOSTED_ZONES[deployEnv];

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId,
      zoneName,
    });

    this.certificate = new acm.Certificate(this, 'Cert', {
      domainName: webDomain(deployEnv),
      validation: acm.CertificateValidation.fromDns(zone),
    });
  }
}
