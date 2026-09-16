import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

process.env.SWIMS_TABLE = 'lapcat-swims-test';

const dynamoMock = mockClient(DynamoDBDocumentClient);

import { handler } from '../lambda/swims/list';

function event(sub: string | undefined): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: { authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('GET /swims', () => {
  beforeEach(() => {
    dynamoMock.reset();
  });

  it('rejects an unauthenticated caller', async () => {
    const res = (await handler(event(undefined))) as { statusCode: number };
    expect(res.statusCode).toBe(401);
  });

  it('returns swims sorted newest startDate first, with userId stripped', async () => {
    dynamoMock.on(QueryCommand).resolves({
      Items: [
        { userId: 'user-1', swimId: 'a', startDate: '2026-09-01T00:00:00.000Z' },
        { userId: 'user-1', swimId: 'b', startDate: '2026-09-10T00:00:00.000Z' },
      ],
    });

    const res = (await handler(event('user-1'))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const { swims } = JSON.parse(res.body);
    expect(swims.map((s: { swimId: string }) => s.swimId)).toEqual(['b', 'a']);
    expect(swims[0].userId).toBeUndefined();
  });

  it('paginates fully before sorting', async () => {
    dynamoMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [{ userId: 'user-1', swimId: 'a', startDate: '2026-09-01T00:00:00.000Z' }],
        LastEvaluatedKey: { userId: 'user-1', swimId: 'a' },
      })
      .resolvesOnce({
        Items: [{ userId: 'user-1', swimId: 'b', startDate: '2026-09-10T00:00:00.000Z' }],
      });

    const res = (await handler(event('user-1'))) as { statusCode: number; body: string };
    const { swims } = JSON.parse(res.body);
    expect(swims.map((s: { swimId: string }) => s.swimId)).toEqual(['b', 'a']);
    expect(dynamoMock.commandCalls(QueryCommand)).toHaveLength(2);
  });

  it('returns an empty list when the caller has no swims', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] });
    const res = (await handler(event('user-1'))) as { statusCode: number; body: string };
    expect(JSON.parse(res.body)).toEqual({ swims: [] });
  });
});
