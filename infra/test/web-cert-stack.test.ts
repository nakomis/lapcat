import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { WebCertStack } from '../lib/web-cert-stack';

function makeTemplate(deployEnv: 'sandbox' | 'prod') {
  const app = new cdk.App();
  const stack = new WebCertStack(app, 'TestWebCertStack', {
    env: { account: '123456789012', region: 'us-east-1' },
    deployEnv,
  });
  return Template.fromStack(stack);
}

describe('WebCertStack', () => {
  test('sandbox: DNS-validated certificate for lapcat.sandbox.nakomis.com', () => {
    makeTemplate('sandbox').hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'lapcat.sandbox.nakomis.com',
      ValidationMethod: 'DNS',
    });
  });

  test('prod: certificate for lapcat.nakomis.com', () => {
    makeTemplate('prod').hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'lapcat.nakomis.com',
    });
  });
});
