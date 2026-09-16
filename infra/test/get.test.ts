import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

process.env.SWIMS_BUCKET = 'lapcat-swims-test';
process.env.SWIMS_TABLE = 'lapcat-swims-test';

const s3Mock = mockClient(S3Client);
const dynamoMock = mockClient(DynamoDBDocumentClient);

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async (_client, cmd) => `https://signed.example/get/${cmd.input.Key}`),
}));

import { handler } from '../lambda/swims/get';

const SWIM_ID = '550e8400-e29b-41d4-a716-446655440000';

function event(sub: string | undefined, swimId: string | undefined): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    pathParameters: swimId ? { swimId } : undefined,
    requestContext: { authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('GET /swims/{swimId}', () => {
  beforeEach(() => {
    s3Mock.reset();
    dynamoMock.reset();
  });

  it('rejects an unauthenticated caller', async () => {
    const res = (await handler(event(undefined, SWIM_ID))) as { statusCode: number };
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed swimId', async () => {
    const res = (await handler(event('user-1', 'nope'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'invalid_swim_id' });
  });

  it('returns 404 not_found when the row is missing', async () => {
    dynamoMock.on(GetCommand).resolves({});
    const res = (await handler(event('user-1', SWIM_ID))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'not_found' });
  });

  it('returns the summary and a presigned download URL', async () => {
    dynamoMock.on(GetCommand).resolves({
      Item: {
        userId: 'user-1',
        swimId: SWIM_ID,
        startDate: '2026-09-16T10:00:00.000Z',
        endDate: '2026-09-16T10:30:00.000Z',
        poolLength: { value: 25, unit: 'm' },
        lapCount: 40,
        distanceMetres: 1000,
        activeDurationSeconds: 1500,
        elapsedDurationSeconds: 1800,
        s3Key: `users/user-1/swims/${SWIM_ID}.json`,
        uploadedAt: '2026-09-16T10:31:00.000Z',
      },
    });

    const res = (await handler(event('user-1', SWIM_ID))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.swim.swimId).toBe(SWIM_ID);
    expect(body.swim.userId).toBeUndefined();
    expect(body.downloadUrl).toBe(`https://signed.example/get/users/user-1/swims/${SWIM_ID}.json`);
  });
});
