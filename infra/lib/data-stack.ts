import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  deployEnv: 'sandbox' | 'prod';
}

export class DataStack extends cdk.Stack {
  readonly swimsBucket: s3.Bucket;
  readonly swimsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { deployEnv } = props;
    const isProd = deployEnv === 'prod';
    const removalPolicy = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // Raw swim JSON blobs, one object per swim: users/{sub}/swims/{swimId}.json.
    // No CORS — the iPhone app uploads/downloads natively, not from a browser.
    this.swimsBucket = new s3.Bucket(this, 'SwimsBucket', {
      bucketName: `lapcat-swims-${this.account}-${deployEnv}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy,
      autoDeleteObjects: !isProd,
    });

    // Index of confirmed swims: userId (PK) + swimId (SK). One row per swim,
    // written by POST /swims/{swimId} (confirm) once the blob is validated.
    this.swimsTable = new dynamodb.Table(this, 'SwimsTable', {
      tableName: `lapcat-swims-${deployEnv}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'swimId', type: dynamodb.AttributeType.STRING },
      billingMode:  dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy,
    });

    new cdk.CfnOutput(this, 'SwimsBucketName', { value: this.swimsBucket.bucketName });
    new cdk.CfnOutput(this, 'SwimsTableName', { value: this.swimsTable.tableName });
  }
}
