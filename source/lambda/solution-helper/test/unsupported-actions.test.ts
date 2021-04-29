// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Mock axios
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { StatusTypes } from '../custom-resource-utils';

// Mock axios
const mockAdapter = new MockAdapter(axios);
mockAdapter.onPut('https://mock-responseurl.com').reply(200);

// Mock Lambda context
const mockLambdaContext = {
  getRemainingTimeInMillis: function () { return 1; },
  functionName: 'mock-function-name',
  functionVersion: '1',
  invokedFunctionArn: 'mock-function-arn',
  memoryLimitInMB: 128,
  awsRequestId: 'mock-request-id',
  logGroupName: 'mock-log-group-name',
  logStreamName: 'mock-log-stream-name',
  identity: {},
  clientContext: {},
  callbackWaitsForEmptyEventLoop: false
};

const index = require('../index');

describe('Unsupported action', () => {
  test('If action is not specified, it fails', async () => {
    // PREPARE
    const mockOtherEvent: any = {
      ResponseURL: 'https://mock-responseurl.com',
      ResourceProperties: {}
    };

    // WHEN
    const response = await index.handler(mockOtherEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'Custom Resource Action was not supplied' }
    });
  });

  test('If action is not suppored, it fails', async () => {
    // PREPARE
    const mockOtherEvent: any = {
      ResponseURL: 'https://mock-responseurl.com',
      ResourceProperties: {
        Action: 'Unsupported'
      }
    };

    // WHEN
    const response = await index.handler(mockOtherEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: `Unknown Custom Resource Action: ${mockOtherEvent.ResourceProperties.Action}` }
    });
  });
});