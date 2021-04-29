// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { CustomResourceActions, StatusTypes, ISolutionLifecycleMetricRequest } from '../custom-resource-utils';

// Mock metrics as the mock axios inside metrics doesn't work.
jest.mock('../../util/metrics');

// Mock axios
const mockAdapter = new MockAdapter(axios);
mockAdapter.onPut('https://mock-responseurl.com').reply(200);

// Mock Lambda event and context
const mockEvent: ISolutionLifecycleMetricRequest = {
  RequestType: 'Create',
  ServiceToken: 'arn:of:solution-helper-lambda',
  ResponseURL: 'https://mock-responseurl.com',
  StackId: 'arn:of:cloudformation',
  RequestId: '1391fc39-700a-4531-aee0-ce433168ac57',
  LogicalResourceId: 'TestSolutionLifecycleMetric',
  PhysicalResourceId: 'TestSolutionLifecycleMetric',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  ResourceProperties: {
    Action: CustomResourceActions.SOLUTION_LIFECYCLE,
    SolutionParameters: {
      DeployM2C: 'Yes'
    }
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

const index = require('../index');

describe('Solution lifecycle metric', () => {
  test('Success', async () => {
    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Success,
      Data: { Message: `${mockEvent.RequestType} completed OK` }
    });
  });
});