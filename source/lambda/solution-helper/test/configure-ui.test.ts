// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { CustomResourceActions, StatusTypes, IConfigUIRequest } from '../custom-resource-utils';

// System environment
process.env.AWS_REGION = 'mock-region-1';

// Mock AWS SDK
const mockAws = {
  copyObject: jest.fn(),
  getObject: jest.fn(),
  putObject: jest.fn()
};
jest.mock('aws-sdk/clients/s3', () => {
  return jest.fn(() => ({
    copyObject: mockAws.copyObject,
    getObject: mockAws.getObject,
    putObject: mockAws.putObject
  }));
});

// Mock axios
const mockAdapter = new MockAdapter(axios);
mockAdapter.onPut('https://mock-responseurl.com').reply(200);

// Mock Lambda event and context
const mockEvent: IConfigUIRequest = {
  RequestType: 'Create',
  ServiceToken: 'arn:of:solution-helper-lambda',
  ResponseURL: 'https://mock-responseurl.com',
  StackId: 'arn:of:cloudformation',
  RequestId: '1391fc39-700a-4531-aee0-ce433168ac57',
  LogicalResourceId: 'TestConfigureUI',
  PhysicalResourceId: 'TestConfigureUI',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  ResourceProperties: {
    Action: CustomResourceActions.CONFIGURE_UI,
    DestinationBucket: 'mock-destination-bucket',
    SrcBucket: 'mock-source-bucket',
    SrcPath: 'mock-source-path',
    WebUIManifestFileName: 'mock-manifest.json',
    WebUIStaticFileNamePrefix: 'web-ui/',
    WebUIConfigFileName: 'mock-config-file-name.js',
    IdentityPoolId: 'mock-identity-pool-id',
    UserPoolId: 'mock-user-pool-id',
    UserPoolClientId: 'mock-user-pool-client-id',
    ApiEndpoint: 'https://apiendpoint'
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
const { DestinationBucket, SrcBucket, SrcPath, WebUIManifestFileName,
  WebUIStaticFileNamePrefix, WebUIConfigFileName, IdentityPoolId, UserPoolId,
  UserPoolClientId, ApiEndpoint } = mockEvent.ResourceProperties;
const mockWebUIConfig = {
  Auth: {
    mandatorySignIn: true,
    region: process.env.AWS_REGION,
    identityPoolId: IdentityPoolId,
    userPoolId: UserPoolId,
    userPoolWebClientId: UserPoolClientId
  },
  'aws_appsync_graphqlEndpoint': ApiEndpoint,
  'aws_appsync_region': process.env.AWS_REGION,
  'aws_appsync_authenticationType': 'AWS_IAM'
};

const index = require('../index');

describe('Configure UI Create - Success and failure', () => {
  beforeEach(() => {
    mockAws.copyObject.mockReset();
    mockAws.getObject.mockReset();
    mockAws.putObject.mockReset();
  });

  test('Success', async () => {
    // PREPARE
    const manifestList = ['web-ui/', 'web-ui/index.html', 'index.js'];
    mockAws.getObject.mockImplementationOnce(() => {
      return {
        promise() {
          return Promise.resolve({ Body: JSON.stringify(manifestList) });
        }
      };
    });
    mockAws.copyObject.mockImplementation(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });
    mockAws.putObject.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Success,
      Data: { Message: `${mockEvent.RequestType} completed OK` }
    });
    expect(mockAws.getObject).toHaveBeenCalledWith({
      Bucket: SrcBucket,
      Key: `${SrcPath}/${WebUIManifestFileName}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(1, {
      Bucket: DestinationBucket,
      CopySource: `${SrcBucket}/${SrcPath}/${manifestList[0]}`,
      Key: `${manifestList[0]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(2, {
      Bucket: DestinationBucket,
      CopySource: `${SrcBucket}/${SrcPath}/${manifestList[1]}`,
      Key: `${manifestList[1].split(WebUIStaticFileNamePrefix).slice(1).join('')}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(3, {
      Bucket: DestinationBucket,
      CopySource: `${SrcBucket}/${SrcPath}/${manifestList[2]}`,
      Key: `${manifestList[2]}`
    });
    expect(mockAws.putObject).toHaveBeenCalledWith({
      Bucket: DestinationBucket,
      Key: WebUIConfigFileName,
      Body: Buffer.from(`const webUIAWSConfig = ${JSON.stringify(mockWebUIConfig, null, 2)};`),
      ContentType: 'application/javascript'
    });
  });

  test('Failure due to S3 getObject', async () => {
    // PREPARE
    mockAws.getObject.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 's3 getObject failure' }); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 's3 getObject failure' }
    });
    expect(mockAws.getObject).toHaveBeenCalledWith({
      Bucket: SrcBucket,
      Key: `${SrcPath}/${WebUIManifestFileName}`
    });
  });
});

describe('Configure UI Update - Failures', () => {
  beforeAll(() => { mockEvent.RequestType = 'Update'; });
  beforeEach(() => {
    mockAws.copyObject.mockReset();
    mockAws.getObject.mockReset();
    mockAws.putObject.mockReset();
  });

  test('Failure due to s3 copyObject error', async () => {
    // PREPARE
    const manifestList = ['web-ui/index.html'];
    mockAws.getObject.mockImplementationOnce(() => {
      return {
        promise() {
          return Promise.resolve({ Body: JSON.stringify(manifestList) });
        }
      };
    });
    mockAws.copyObject.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 's3 copyObject failure' }); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 's3 copyObject failure' }
    });
    expect(mockAws.getObject).toHaveBeenCalledWith({
      Bucket: SrcBucket,
      Key: `${SrcPath}/${WebUIManifestFileName}`
    });
    expect(mockAws.copyObject).toHaveBeenCalledWith({
      Bucket: DestinationBucket,
      CopySource: `${SrcBucket}/${SrcPath}/${manifestList[0]}`,
      Key: `${manifestList[0].split(WebUIStaticFileNamePrefix).slice(1).join('')}`
    });
  });

  test('Failure due to S3 putObject', async () => {
    // PREPARE
    const manifestList = ['index.html'];
    mockAws.getObject.mockImplementationOnce(() => {
      return {
        promise() {
          return Promise.resolve({ Body: JSON.stringify(manifestList) });
        }
      };
    });
    mockAws.copyObject.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });
    mockAws.putObject.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 's3 putObject failure' }); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 's3 putObject failure' }
    });
    expect(mockAws.getObject).toHaveBeenCalledWith({
      Bucket: SrcBucket,
      Key: `${SrcPath}/${WebUIManifestFileName}`
    });
    expect(mockAws.copyObject).toHaveBeenCalledWith({
      Bucket: DestinationBucket,
      CopySource: `${SrcBucket}/${SrcPath}/${manifestList[0]}`,
      Key: `${manifestList[0]}`
    });
    expect(mockAws.putObject).toHaveBeenCalledWith({
      Bucket: DestinationBucket,
      Key: WebUIConfigFileName,
      Body: Buffer.from(`const webUIAWSConfig = ${JSON.stringify(mockWebUIConfig, null, 2)};`),
      ContentType: 'application/javascript'
    });
  });
});

describe('Configure UI Delete', () => {
  beforeAll(() => { mockEvent.RequestType = 'Delete'; });

  test('Success', async () => {
    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Success,
      Data: { Message: `No action needed for ${mockEvent.RequestType}` }
    });
  });
});