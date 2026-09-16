// POST /swims/{swimId} — confirm an upload. Reads the blob just PUT to S3,
// validates it, and writes (or overwrites) the DynamoDB index row. Idempotent:
// re-confirming the same swim simply overwrites the row and returns 200.

import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { log } from '../shared/logger';
import { isValidUuid, swimKey, validateSwimBlob, toSummary, SwimBlob } from '../shared/swim';

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SWIMS_BUCKET = process.env.SWIMS_BUCKET!;
const SWIMS_TABLE = process.env.SWIMS_TABLE!;

async function streamToString(body: unknown): Promise<string> {
  // The AWS SDK v3 S3 GetObject body is a Node Readable in Lambda.
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!userId) {
    log.warn('swims:confirm_unauthorised');
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'unauthorised' }) };
  }

  const swimId = event.pathParameters?.swimId;
  if (!isValidUuid(swimId)) {
    log.warn('swims:confirm_invalid_swim_id', { userId, swimId });
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'invalid_swim_id' }) };
  }

  const key = swimKey(userId, swimId);

  let bodyText: string;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: SWIMS_BUCKET, Key: key }));
    bodyText = await streamToString(obj.Body);
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'NoSuchKey' || name === 'NotFound') {
      log.warn('swims:confirm_not_uploaded', { userId, swimId });
      return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'not_uploaded' }) };
    }
    log.error('swims:confirm_s3_error', { userId, swimId, message: (err as Error).message });
    throw err;
  }

  let blob: unknown;
  try {
    blob = JSON.parse(bodyText);
  } catch {
    log.warn('swims:confirm_invalid_json', { userId, swimId });
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'invalid_swim', detail: 'body is not valid JSON' }) };
  }

  const result = validateSwimBlob(blob, swimId);
  if (!result.valid) {
    log.warn('swims:confirm_invalid_swim', { userId, swimId, detail: result.detail });
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'invalid_swim', detail: result.detail }) };
  }

  const uploadedAt = new Date().toISOString();
  const summary = toSummary(blob as SwimBlob, key, uploadedAt);

  await dynamo.send(new PutCommand({
    TableName: SWIMS_TABLE,
    Item: { userId, ...summary },
  }));

  log.info('swims:confirm', { userId, swimId });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(summary),
  };
}
