// GET /swims/{swimId} — a single swim's index row plus a presigned download URL
// for its full JSON blob.

import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { log } from '../shared/logger';
import { isValidUuid, SwimSummary } from '../shared/swim';

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SWIMS_BUCKET = process.env.SWIMS_BUCKET!;
const SWIMS_TABLE = process.env.SWIMS_TABLE!;
const EXPIRES_IN = 900;

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!userId) {
    log.warn('swims:get_unauthorised');
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'unauthorised' }) };
  }

  const swimId = event.pathParameters?.swimId;
  if (!isValidUuid(swimId)) {
    log.warn('swims:get_invalid_swim_id', { userId, swimId });
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'invalid_swim_id' }) };
  }

  const res = await dynamo.send(new GetCommand({
    TableName: SWIMS_TABLE,
    Key: { userId, swimId },
  }));

  if (!res.Item) {
    log.warn('swims:get_not_found', { userId, swimId });
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'not_found' }) };
  }

  const { userId: _userId, ...swim } = res.Item as Record<string, unknown>;
  const summary = swim as unknown as SwimSummary;

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: SWIMS_BUCKET, Key: summary.s3Key }),
    { expiresIn: EXPIRES_IN },
  );

  log.info('swims:get', { userId, swimId });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ swim: summary, downloadUrl }),
  };
}
