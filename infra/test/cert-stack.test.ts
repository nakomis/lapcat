import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CertStack } from '../lib/cert-stack';

function makeStack(deployEnv: 'sandbox' | 'prod' = 'sandbox') {
  const app = new cdk.App();
  const stack = new CertStack(app, 'TestCertStack', {
    env: { account: '123456789012', region: 'eu-west-2' },
    deployEnv,
  });
  return { stack, template: Template.fromStack(stack) };
}

describe('CertStack — sandbox', () => {
  test('appDomain is api.lapcat.sandbox.nakomis.com', () => {
    const { stack } = makeStack('sandbox');
    expect(stack.appDomain).toBe('api.lapcat.sandbox.nakomis.com');
  });

  test('creates a DNS-validated ACM certificate for appDomain', () => {
    const { template } = makeStack('sandbox');
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'api.lapcat.sandbox.nakomis.com',
      ValidationMethod: 'DNS',
    });
  });

  test('outputs AppDomain', () => {
    const { template } = makeStack('sandbox');
    template.hasOutput('AppDomain', {});
  });
});

describe('CertStack — prod', () => {
  test('appDomain is api.lapcat.nakomis.com', () => {
    const { stack } = makeStack('prod');
    expect(stack.appDomain).toBe('api.lapcat.nakomis.com');
  });

  test('creates a certificate for the prod domain', () => {
    const { template } = makeStack('prod');
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'api.lapcat.nakomis.com',
    });
  });
});
