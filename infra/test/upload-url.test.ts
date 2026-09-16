import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

process.env.SWIMS_BUCKET = 'lapcat-swims-test';

const s3Mock = mockClient(S3Client);

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async (_client, cmd) => `https://signed.example/put/${cmd.input.Key}`),
}));

import { handler } from '../lambda/swims/upload-url';

const SWIM_ID = '550e8400-e29b-41d4-a716-446655440000';

function event(sub: string | undefined, swimId: string | undefined): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    pathParameters: swimId ? { swimId } : undefined,
    requestContext: { authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('POST /swims/{swimId}/upload-url', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('rejects an unauthenticated caller', async () => {
    const res = (await handler(event(undefined, SWIM_ID))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'unauthorised' });
  });

  it('rejects a malformed swimId', async () => {
    const res = (await handler(event('user-1', 'not-a-uuid'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'invalid_swim_id' });
  });

  it('rejects a missing swimId', async () => {
    const res = (await handler(event('user-1', undefined))) as { statusCode: number };
    expect(res.statusCode).toBe(400);
  });

  it('returns a presigned PUT for the caller\'s own key', async () => {
    const res = (await handler(event('user-1', SWIM_ID))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.key).toBe(`users/user-1/swims/${SWIM_ID}.json`);
    expect(body.uploadUrl).toBe(`https://signed.example/put/users/user-1/swims/${SWIM_ID}.json`);
    expect(body.expiresIn).toBe(900);
  });
});
