// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { ConfigType, IMessageFormatConfigItem, IUIReferenceMappingConfigItem } from '../../util/gql-schema-interfaces';
import { CustomResourceActions, StatusTypes, IConfigMachineDataRequest } from '../custom-resource-utils';

// Mock AWS SDK
const mockAws = { put: jest.fn() };
jest.mock('aws-sdk/clients/dynamodb', () => {
  return {
    DocumentClient: jest.fn(() => ({
      put: mockAws.put
    }))
  };
});

// Mock axios
const mockAdapter = new MockAdapter(axios);
mockAdapter.onPut('https://mock-responseurl.com').reply(200);

// Mock Lambda event and context
const mockEvent: IConfigMachineDataRequest = {
  RequestType: 'Create',
  ServiceToken: 'arn:of:solution-helper-lambda',
  ResponseURL: 'https://mock-responseurl.com',
  StackId: 'arn:of:cloudformation',
  RequestId: '1391fc39-700a-4531-aee0-ce433168ac57',
  LogicalResourceId: 'TestConfigureMachineData',
  PhysicalResourceId: 'TestConfigureMachineData',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  ResourceProperties: {
    Action: CustomResourceActions.CONFIGURE_MACHINE_DATA,
    ConfigId: 'DEFAULT',
    ConfigTableName: 'mock-config-table',
    UIReferenceTableName: 'mock-ui-reference-table'
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

// Event resource properties
const { ConfigId, ConfigTableName, UIReferenceTableName } = mockEvent.ResourceProperties;
const messageFormat: IMessageFormatConfigItem = {
  msgFormatDataAliasDelimiter: '/',
  msgFormatDataMessageAliasKeyName: 'name',
  msgFormatDataMessageQualityKeyName: 'quality',
  msgFormatDataMessagesKeyName: 'messages',
  msgFormatDataMessageTimestampFormat: 'YYYY-MM-DD HH:mm:ss.SSSSSSZZ',
  msgFormatDataMessageTimestampKeyName: 'timestamp',
  msgFormatDataMessageValueKeyName: 'value',
  id: 'mock-id',
  type: ConfigType.MESSAGE_FORMAT
};
const uiReferenceMapping: IUIReferenceMappingConfigItem = {
  uiReferenceMappingLineKeys: '2',
  uiReferenceMappingLocationKeys: '0/1',
  id: 'mock-id',
  type: ConfigType.UI_REFERENCE_MAPPING
};

const index = require('../index');

describe('Configure machine data Create - Success and failure', () => {
  beforeEach(() => { mockAws.put.mockReset(); });

  test('Success without MessageFormat and UIReferenceMapping', async () => {
    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Success,
      Data: { Message: `${mockEvent.RequestType} completed OK` }
    });
  });

  test('Success with MessageFormat and UIReferenceMapping', async () => {
    // PREPARE
    mockEvent.ResourceProperties.MessageFormat = messageFormat;
    mockEvent.ResourceProperties.UIReferenceMapping = uiReferenceMapping;

    mockAws.put.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve('success');
        }
      };
    });
    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Success,
      Data: { Message: `${mockEvent.RequestType} completed OK` }
    });
    expect(mockAws.put).toHaveBeenNthCalledWith(1, {
      TableName: ConfigTableName,
      Item: {
        ...messageFormat,
        id: ConfigId
      }
    });
    expect(mockAws.put).toHaveBeenNthCalledWith(2, {
      TableName: UIReferenceTableName,
      Item: {
        ...uiReferenceMapping,
        id: ConfigId
      }
    });
  });

  test('Failure due to first DynamoDB put', async () => {
    // PREPARE
    mockAws.put.mockImplementationOnce(() => {
      return {
        promise() {
          return Promise.reject({ message: 'MessageFormat ddb put failure' });
        }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'MessageFormat ddb put failure' }
    });
    expect(mockAws.put).toHaveBeenCalledWith({
      TableName: ConfigTableName,
      Item: {
        ...messageFormat,
        id: ConfigId
      }
    });
  });

  test('Failure due to second DynamoDB put', async () => {
    // PREPARE
    mockAws.put.mockImplementationOnce(() => {
      return {
        promise() {
          return Promise.resolve('success');
        }
      };
    }).mockImplementationOnce(() => {
      return {
        promise() {
          return Promise.reject({ message: 'UIReferenceMapping ddb put failure' });
        }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'UIReferenceMapping ddb put failure' }
    });
    expect(mockAws.put).toHaveBeenNthCalledWith(1, {
      TableName: ConfigTableName,
      Item: {
        ...messageFormat,
        id: ConfigId
      }
    });
    expect(mockAws.put).toHaveBeenNthCalledWith(2, {
      TableName: UIReferenceTableName,
      Item: {
        ...uiReferenceMapping,
        id: ConfigId
      }
    });
  });

  test('Failure due to empty config ID', async () => {
    // PREPARE
    mockEvent.ResourceProperties.ConfigId = '';

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'ConfigId was not supplied' }
    });
  });
});

describe('Configure machine data Delete', () => {
  beforeAll(() => { mockEvent.RequestType = 'Delete'; });

  test('Delete request does nothing', async () => {
    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Success,
      Data: { Message: `No action needed for ${mockEvent.RequestType}` }
    });
  });
});