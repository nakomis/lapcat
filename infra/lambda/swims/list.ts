// GET /swims — list the caller's swims, newest startDate first. Queries the
// caller's own partition only and paginates fully before sorting.

import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { log } from '../shared/logger';
import { SwimSummary } from '../shared/swim';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SWIMS_TABLE = process.env.SWIMS_TABLE!;

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!userId) {
    log.warn('swims:list_unauthorised');
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'unauthorised' }) };
  }

  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const res = await dynamo.send(new QueryCommand({
      TableName: SWIMS_TABLE,
      KeyConditionExpression: '#userId = :userId',
      ExpressionAttributeNames: { '#userId': 'userId' },
      ExpressionAttributeValues: { ':userId': userId },
      ExclusiveStartKey: exclusiveStartKey,
    }));
    items.push(...((res.Items ?? []) as Record<string, unknown>[]));
    exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const swims: SwimSummary[] = items
    .map(({ userId: _userId, ...rest }) => rest as unknown as SwimSummary)
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));

  log.info('swims:list', { userId, count: swims.length });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ swims }),
  };
}
