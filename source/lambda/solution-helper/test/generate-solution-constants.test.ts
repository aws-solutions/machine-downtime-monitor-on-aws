// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Mock axios
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { CustomResourceActions, StatusTypes, IGenerateUUIDRequest } from '../custom-resource-utils';

// Mock UUID
jest.mock('uuid', () => {
  return {
    v4: jest.fn(() => 'mock-uuid')
  };
});

// Mock axios
const mockAdapter = new MockAdapter(axios);
mockAdapter.onPut('https://mock-responseurl.com').reply(200);

// Mock Lambda event and context
const mockEvent: IGenerateUUIDRequest = {
  RequestType: 'Create',
  ServiceToken: 'arn:of:solution-helper-lambda',
  ResponseURL: 'https://mock-responseurl.com',
  StackId: 'arn:of:cloudformation',
  RequestId: '1391fc39-700a-4531-aee0-ce433168ac57',
  LogicalResourceId: 'TestGenerateUUID',
  PhysicalResourceId: 'TestGenerateUUID',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  ResourceProperties: {
    Action: CustomResourceActions.GENERATE_SOLUTION_CONSTANTS
  }
};
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

process.env.STACK_NAME = 'MOCK-Stack-Name';
const index = require('../index');

test('Create UUID and lower case stack name', async () => {
  // WHEN
  const response = await index.handler(mockEvent, mockLambdaContext);

  // THEN
  expect(response).toEqual({
    Status: StatusTypes.Success,
    Data: {
      AnonymousDataUUID: 'mock-uuid',
      LowerCaseStackName: process.env.STACK_NAME.toLowerCase()
    }
  });
});

test('Create nothing', async () => {
  // PREPARE
  mockEvent.RequestType = 'Update';

  // WHEN
  const response = await index.handler(mockEvent, mockLambdaContext);

  // THEN
  expect(response).toEqual({
    Status: StatusTypes.Success,
    Data: { Message: `No action needed for ${mockEvent.ResourceProperties.Action}` }
  });
});