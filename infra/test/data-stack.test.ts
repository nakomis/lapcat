import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DataStack } from '../lib/data-stack';

function makeStack(deployEnv: 'sandbox' | 'prod' = 'sandbox') {
  const app = new cdk.App();
  const stack = new DataStack(app, 'TestDataStack', {
    env: { account: '123456789012', region: 'eu-west-2' },
    deployEnv,
  });
  return Template.fromStack(stack);
}

describe('DataStack — sandbox', () => {
  let template: Template;

  beforeAll(() => {
    template = makeStack('sandbox');
  });

  test('creates the swims table with correct name', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'lapcat-swims-sandbox',
    });
  });

  test('swims table has userId partition key and swimId sort key', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'swimId', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'userId', AttributeType: 'S' },
        { AttributeName: 'swimId', AttributeType: 'S' },
      ]),
    });
  });

  test('swims table uses on-demand billing', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('swims table has point-in-time recovery enabled', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  test('sandbox table and bucket use DESTROY removal policy', () => {
    const tables = template.findResources('AWS::DynamoDB::Table');
    for (const t of Object.values(tables) as { DeletionPolicy?: string }[]) {
      expect(t.DeletionPolicy).toBe('Delete');
    }
    const buckets = template.findResources('AWS::S3::Bucket');
    for (const b of Object.values(buckets) as { DeletionPolicy?: string }[]) {
      expect(b.DeletionPolicy).toBe('Delete');
    }
  });

  test('creates the swims bucket blocking all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'lapcat-swims-123456789012-sandbox',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('swims bucket has versioning enabled', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  test('swims bucket uses S3-managed encryption', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }),
        ]),
      },
    });
  });

  test('swims bucket enforces SSL via bucket policy', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  test('outputs bucket and table names', () => {
    template.hasOutput('SwimsBucketName', { Value: Match.anyValue() });
    template.hasOutput('SwimsTableName', { Value: Match.anyValue() });
  });

  test('swims bucket allows GET/HEAD from the sandbox web portal and localhost', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedMethods: Match.arrayWith(['GET', 'HEAD']),
            AllowedOrigins: Match.arrayWith(['https://lapcat.sandbox.nakomis.com', 'http://localhost:3000']),
          }),
        ]),
      },
    });
  });
});

describe('DataStack — prod', () => {
  let template: Template;

  beforeAll(() => {
    template = makeStack('prod');
  });

  test('uses prod suffix in names', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', { TableName: 'lapcat-swims-prod' });
    template.hasResourceProperties('AWS::S3::Bucket', { BucketName: 'lapcat-swims-123456789012-prod' });
  });

  test('prod table and bucket use RETAIN removal policy', () => {
    const tables = template.findResources('AWS::DynamoDB::Table');
    for (const t of Object.values(tables) as { DeletionPolicy?: string }[]) {
      expect(t.DeletionPolicy).toBe('Retain');
    }
    const buckets = template.findResources('AWS::S3::Bucket');
    for (const b of Object.values(buckets) as { DeletionPolicy?: string }[]) {
      expect(b.DeletionPolicy).toBe('Retain');
    }
  });

  test('prod swims bucket CORS allows only the prod web portal, not localhost', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedOrigins: ['https://lapcat.nakomis.com'],
          }),
        ]),
      },
    });
  });
});
