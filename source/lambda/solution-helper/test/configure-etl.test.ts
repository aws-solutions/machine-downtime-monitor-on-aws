// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { CustomResourceActions, StatusTypes, IConfigETLRequest, IQuickSightManifest } from '../custom-resource-utils';

// Mock AWS SDK
const mockAws = {
  copyObject: jest.fn(),
  putObject: jest.fn()
};
jest.mock('aws-sdk/clients/s3', () => {
  return jest.fn(() => ({
    copyObject: mockAws.copyObject,
    putObject: mockAws.putObject
  }));
});

// Mock axios
const mockAdapter = new MockAdapter(axios);
mockAdapter.onPut('https://mock-responseurl.com').reply(200);

// Mock Lambda event and context
const mockEvent: IConfigETLRequest = {
  RequestType: 'Create',
  ServiceToken: 'arn:of:solution-helper-lambda',
  ResponseURL: 'https://mock-responseurl.com',
  StackId: 'arn:of:cloudformation',
  RequestId: '1391fc39-700a-4531-aee0-ce433168ac57',
  LogicalResourceId: 'TestConfigureETL',
  PhysicalResourceId: 'TestConfigureETL',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  ResourceProperties: {
    Action: CustomResourceActions.CONFIGURE_ETL,
    SourceBucket: 'mock-source-bucket',
    SourcePrefix: 'mock-source-prefix',
    GlueJobScriptsPrefix: 'mock-glue-job-scripts',
    GlueJobScripts: ['configuration.py', 'convert_parquet.py', 'update_crawler.py'],
    CsvPrefix: 'csv',
    ManifestPrefix: 'manifest',
    MachineInformationPrefix: 'machine_information',
    MachineConfigInformationPrefix: 'machine_config_information',
    DestinationBucket: 'mock-destination-bucket'
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
const { SourceBucket, SourcePrefix, GlueJobScriptsPrefix,
  GlueJobScripts, CsvPrefix, ManifestPrefix,
  MachineInformationPrefix, MachineConfigInformationPrefix, DestinationBucket } = mockEvent.ResourceProperties;

const index = require('../index');

const getQuickSightManifest = (bucket: string, csvPrefix: string, csvFileName: string): IQuickSightManifest => {
  return {
    fileLocations: [
      { URIs: [`s3://${bucket}/${csvPrefix}/${csvFileName}`] }
    ],
    globalUploadSettings: {
      format: 'CSV',
      delimiter: ',',
      textqualifier: '\'',
      containsHeader: 'true'
    }
  }
}

describe('Configure ETL Create - Success and failure', () => {
  beforeEach(() => {
    mockAws.copyObject.mockReset();
    mockAws.putObject.mockReset();
  });

  test('Success', async () => {
    // PREPARE
    mockAws.copyObject.mockImplementation(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });
    mockAws.putObject.mockImplementation(() => {
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
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(1, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(2, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(3, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: DestinationBucket,
      Key: `${CsvPrefix}/${MachineInformationPrefix}.csv`,
      Body: 'id,machine_name,location,line'
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(2, {
      Bucket: DestinationBucket,
      Key: `${CsvPrefix}/${MachineConfigInformationPrefix}.csv`,
      Body: 'id,status_tag,down_value'
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(3, {
      Bucket: DestinationBucket,
      Key: `${ManifestPrefix}/${MachineInformationPrefix}_${ManifestPrefix}.json`,
      Body: JSON.stringify(getQuickSightManifest(DestinationBucket, CsvPrefix, `${MachineInformationPrefix}.csv`))
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(4, {
      Bucket: DestinationBucket,
      Key: `${ManifestPrefix}/${MachineConfigInformationPrefix}_${ManifestPrefix}.json`,
      Body: JSON.stringify(getQuickSightManifest(DestinationBucket, CsvPrefix, `${MachineConfigInformationPrefix}.csv`))
    });
  });

  test('Failure due to S3 copyObject error', async () => {
    // PREPARE
    mockAws.copyObject.mockImplementation(() => {
      return {
        promise() { return Promise.reject({ message: 's3 copyObject failure' }); }
      };
    });
    mockAws.putObject.mockImplementation(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 's3 copyObject failure' }
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(1, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(2, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(3, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: DestinationBucket,
      Key: `${CsvPrefix}/${MachineInformationPrefix}.csv`,
      Body: 'id,machine_name,location,line'
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(2, {
      Bucket: DestinationBucket,
      Key: `${CsvPrefix}/${MachineConfigInformationPrefix}.csv`,
      Body: 'id,status_tag,down_value'
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(3, {
      Bucket: DestinationBucket,
      Key: `${ManifestPrefix}/${MachineInformationPrefix}_${ManifestPrefix}.json`,
      Body: JSON.stringify(getQuickSightManifest(DestinationBucket, CsvPrefix, `${MachineInformationPrefix}.csv`))
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(4, {
      Bucket: DestinationBucket,
      Key: `${ManifestPrefix}/${MachineConfigInformationPrefix}_${ManifestPrefix}.json`,
      Body: JSON.stringify(getQuickSightManifest(DestinationBucket, CsvPrefix, `${MachineConfigInformationPrefix}.csv`))
    });
  });

  test('Failure due to s3 putObject error', async () => {
    // PREPARE
    mockAws.copyObject.mockImplementation(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });
    mockAws.putObject.mockImplementation(() => {
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
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(1, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(2, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(3, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(1, {
      Bucket: DestinationBucket,
      Key: `${CsvPrefix}/${MachineInformationPrefix}.csv`,
      Body: 'id,machine_name,location,line'
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(2, {
      Bucket: DestinationBucket,
      Key: `${CsvPrefix}/${MachineConfigInformationPrefix}.csv`,
      Body: 'id,status_tag,down_value'
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(3, {
      Bucket: DestinationBucket,
      Key: `${ManifestPrefix}/${MachineInformationPrefix}_${ManifestPrefix}.json`,
      Body: JSON.stringify(getQuickSightManifest(DestinationBucket, CsvPrefix, `${MachineInformationPrefix}.csv`))
    });
    expect(mockAws.putObject).toHaveBeenNthCalledWith(4, {
      Bucket: DestinationBucket,
      Key: `${ManifestPrefix}/${MachineConfigInformationPrefix}_${ManifestPrefix}.json`,
      Body: JSON.stringify(getQuickSightManifest(DestinationBucket, CsvPrefix, `${MachineConfigInformationPrefix}.csv`))
    });
  });
});

describe('Configure ETL Update - Success and Failure', () => {
  beforeAll(() => { mockEvent.RequestType = 'Update'; });
  beforeEach(() => {
    mockAws.copyObject.mockReset();
  });

  test('Success', async () => {
    // PREPARE
    mockAws.copyObject.mockImplementation(() => {
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
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(1, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(2, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(3, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`
    });
  });

  test('Failure due to S3 copyObject error', async () => {
    // PREPARE
    mockAws.copyObject.mockImplementation(() => {
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
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(1, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[0]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(2, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[1]}`
    });
    expect(mockAws.copyObject).toHaveBeenNthCalledWith(3, {
      Bucket: DestinationBucket,
      CopySource: `${SourceBucket}/${SourcePrefix}/${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`,
      Key: `${GlueJobScriptsPrefix}/${GlueJobScripts[2]}`
    });
  });
});

describe('Configure ETL Delete', () => {
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