// POST /swims/{swimId}/upload-url — issue a presigned PUT so the app can upload
// the swim's JSON blob straight to S3 (bytes never pass through Lambda or API
// Gateway). The key is derived from the caller's Cognito sub, so a user can only
// ever write into their own prefix.

import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { log } from '../shared/logger';
import { isValidUuid, swimKey } from '../shared/swim';

const s3 = new S3Client({});
const SWIMS_BUCKET = process.env.SWIMS_BUCKET!;
const EXPIRES_IN = 900;

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!userId) {
    log.warn('swims:upload_url_unauthorised');
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'unauthorised' }) };
  }

  const swimId = event.pathParameters?.swimId;
  if (!isValidUuid(swimId)) {
    log.warn('swims:upload_url_invalid_swim_id', { userId, swimId });
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'invalid_swim_id' }) };
  }

  const key = swimKey(userId, swimId);
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: SWIMS_BUCKET, Key: key, ContentType: 'application/json' }),
    { expiresIn: EXPIRES_IN },
  );

  log.info('swims:upload_url', { userId, swimId });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadUrl, key, expiresIn: EXPIRES_IN }),
  };
}
