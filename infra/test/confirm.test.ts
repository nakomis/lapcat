import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Readable } from 'stream';
import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

process.env.SWIMS_BUCKET = 'lapcat-swims-test';
process.env.SWIMS_TABLE = 'lapcat-swims-test';

const s3Mock = mockClient(S3Client);
const dynamoMock = mockClient(DynamoDBDocumentClient);

import { handler } from '../lambda/swims/confirm';

const SWIM_ID = '550e8400-e29b-41d4-a716-446655440000';

function event(sub: string | undefined, swimId: string | undefined): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    pathParameters: swimId ? { swimId } : undefined,
    requestContext: { authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function bodyStream(obj: unknown): Readable {
  return Readable.from([Buffer.from(JSON.stringify(obj))]);
}

const validBlob = {
  schemaVersion: 1,
  swimId: SWIM_ID,
  startDate: '2026-09-16T10:00:00.000Z',
  endDate: '2026-09-16T10:30:00.000Z',
  poolLength: { value: 25, unit: 'm' },
  totals: { lapCount: 40, distanceMetres: 1000, activeDurationSeconds: 1500, elapsedDurationSeconds: 1800 },
};

describe('POST /swims/{swimId} (confirm)', () => {
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

  it('returns 404 not_uploaded when the object is missing', async () => {
    s3Mock.on(GetObjectCommand).rejects(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    const res = (await handler(event('user-1', SWIM_ID))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'not_uploaded' });
  });

  it('rethrows an unexpected S3 error', async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error('boom'));
    await expect(handler(event('user-1', SWIM_ID))).rejects.toThrow('boom');
  });

  it('returns 400 invalid_swim when the body is not valid JSON', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: Readable.from([Buffer.from('not json')]) as never });
    const res = (await handler(event('user-1', SWIM_ID))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_swim');
  });

  it('returns 400 invalid_swim when validation fails', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyStream({ ...validBlob, schemaVersion: 2 }) as never });
    const res = (await handler(event('user-1', SWIM_ID))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('invalid_swim');
    expect(body.detail).toBe('schemaVersion must be 1');
  });

  it('writes the index row and returns the summary on success', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyStream(validBlob) as never });
    dynamoMock.on(PutCommand).resolves({});

    const res = (await handler(event('user-1', SWIM_ID))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const summary = JSON.parse(res.body);
    expect(summary.swimId).toBe(SWIM_ID);
    expect(summary.lapCount).toBe(40);
    expect(summary.s3Key).toBe(`users/user-1/swims/${SWIM_ID}.json`);
    expect(summary.uploadedAt).toBeDefined();

    const putCalls = dynamoMock.commandCalls(PutCommand);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].args[0].input.Item).toMatchObject({ userId: 'user-1', swimId: SWIM_ID });
  });

  it('is idempotent — re-confirming overwrites and returns 200', async () => {
    // A fresh stream per call — a Readable can only be consumed once, and this
    // handler is invoked twice against the same mocked object.
    s3Mock.on(GetObjectCommand).callsFake(async () => ({ Body: bodyStream(validBlob) as never }));
    dynamoMock.on(PutCommand).resolves({});

    const first = (await handler(event('user-1', SWIM_ID))) as { statusCode: number };
    const second = (await handler(event('user-1', SWIM_ID))) as { statusCode: number };
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(2);
  });
});
