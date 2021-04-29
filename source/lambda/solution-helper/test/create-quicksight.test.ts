// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { CustomResourceActions, StatusTypes, ICreateQuickSightRequest } from '../custom-resource-utils';

// Mock AWS SDK
const mockAws = {
  createDataSource: jest.fn(),
  createDataSet: jest.fn(),
  deleteDataSource: jest.fn(),
  deleteDataSet: jest.fn(),
  createAnalysis: jest.fn(),
  deleteAnalysis: jest.fn(),
  createDashboard: jest.fn(),
  deleteDashboard: jest.fn()
};
jest.mock('aws-sdk/clients/quicksight', () => {
  return jest.fn(() => ({
    createDataSource: mockAws.createDataSource,
    createDataSet: mockAws.createDataSet,
    deleteDataSource: mockAws.deleteDataSource,
    deleteDataSet: mockAws.deleteDataSet,
    createAnalysis: mockAws.createAnalysis,
    deleteAnalysis: mockAws.deleteAnalysis,
    createDashboard: mockAws.createDashboard,
    deleteDashboard: mockAws.deleteDashboard
  }));
});

// Mock axios
const mockAdapter = new MockAdapter(axios);
mockAdapter.onPut('https://mock-responseurl.com').reply(200);

// Mock Lambda event and context
const mockEvent: ICreateQuickSightRequest = {
  RequestType: 'Create',
  ServiceToken: 'arn:of:solution-helper-lambda',
  ResponseURL: 'https://mock-responseurl.com',
  StackId: 'arn:of:cloudformation',
  RequestId: '1391fc39-700a-4531-aee0-ce433168ac57',
  LogicalResourceId: 'TestConfigureETL',
  PhysicalResourceId: 'TestConfigureETL',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  ResourceProperties: {
    Action: CustomResourceActions.CREATE_QUICKSIGHT,
    AccountId: 'mock-accountId',
    GlueDatabaseName: 'mock-database',
    GlueTableName: 'mock-table',
    Metadata: {
      BucketName: 'mock-bucket',
      MachineInformationPrefix: 'machine-information-prefix',
      MachineConfigInformationPrefix: 'machine-config-information-prefix',
      ManifestPrefix: 'manifest'
    },
    PrincipalArn: 'arn:of:quicksight:user',
    QuickSightTemplate: 'arn:ofquicksight:template',
    StackName: 'mock-stack'
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

// Athena SQL query
const SQL_QUERY = `
WITH RAW AS
(
  SELECT id
       , tag
       , value
       , quality
       , DATE_PARSE(timestamp, '%Y/%m/%d %H:%i:%s.%f') as timestamp
       , ROW_NUMBER() OVER(ORDER BY id, tag, timestamp) AS row_num
    FROM "{DATABASE}"."{TABLE}"
),
JOIN_DATA AS
(
  SELECT r1.id
       , r1.tag
       , r1.value
       , r1.quality
       , r1.timestamp
       , ROW_NUMBER() OVER(ORDER BY r1.id, r1.tag, r1.timestamp) AS row_num
    FROM RAW r1
    LEFT OUTER JOIN RAW r2 ON r2.row_num = r1.row_num - 1
   WHERE (r1.value != r2.value OR r2.row_num IS NULL)
     AND (r1.id = r2.id OR r2.id IS NULL)
     AND (r1.tag = r2.tag OR r2.tag IS NULL)
)
SELECT j1.id
     , j1.tag
     , j1.value
     , j1.quality
     , j1.timestamp as timestamp
     , TO_UNIXTIME(j2.timestamp) - TO_UNIXTIME(j1.timestamp) AS duration_seconds
     , (TO_UNIXTIME(j2.timestamp) - TO_UNIXTIME(j1.timestamp)) / 60 AS duration_minutes
     , (TO_UNIXTIME(j2.timestamp) - TO_UNIXTIME(j1.timestamp)) / 60 / 60 AS duration_hours
  FROM JOIN_DATA j1
  LEFT OUTER JOIN JOIN_DATA j2 ON j2.row_num = j1.row_num + 1
 WHERE j1.id = j2.id
   AND j1.tag = j2.tag
`;

// Event resource properties
const { AccountId, GlueDatabaseName, GlueTableName, Metadata, PrincipalArn, QuickSightTemplate, StackName } = mockEvent.ResourceProperties;
const { BucketName, MachineInformationPrefix, MachineConfigInformationPrefix, ManifestPrefix } = Metadata;

const index = require('../index');
import { QuickSightDataSetImportMode, QuickSightDataSourceType, QuickSightResourceType } from '../quicksight/quicksight-properties';
import QuickSightHelper from '../quicksight/quicksight-helper';
const quickSightHelper = new QuickSightHelper({
  awsAccountId: AccountId,
  quickSightPrincipalArn: PrincipalArn
});

describe('Create QuickSight Create - Success and failure', () => {
  beforeEach(() => {
    mockAws.createDataSource.mockReset();
    mockAws.createDataSet.mockReset();
    mockAws.createAnalysis.mockReset();
    mockAws.createDashboard.mockReset();
    mockAws.deleteDataSource.mockReset();
    mockAws.deleteDataSet.mockReset();
    mockAws.deleteAnalysis.mockReset();
    mockAws.deleteDashboard.mockReset();
  });

  test('Success', async () => {
    // PREPARE
    mockAws.createDataSource.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-machine-information-ds-arn' }); }
      };
    }).mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-machine-config-information-ds-arn' }); }
      };
    }).mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-athena-ds-arn' }); }
      };
    });
    mockAws.createDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-dataset-arn' }); }
      };
    });
    mockAws.createAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });
    mockAws.createDashboard.mockImplementationOnce(() => {
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
    expect(mockAws.createDataSource).toHaveBeenNthCalledWith(1, {
      AwsAccountId: AccountId,
      DataSourceId: `${StackName}-MachineInformation`,
      Name: `${StackName}-MachineInformation`,
      Type: QuickSightDataSourceType.S3,
      DataSourceParameters: {
        S3Parameters: {
          ManifestFileLocation: {
            Bucket: BucketName,
            Key: `${ManifestPrefix}/${MachineInformationPrefix}_${ManifestPrefix}.json`
          }
        }
      },
      Permissions: quickSightHelper.getPermissions(QuickSightResourceType.DATA_SOURCE),
      SslProperties: { DisableSsl: false }
    });
    expect(mockAws.createDataSource).toHaveBeenNthCalledWith(2, {
      AwsAccountId: AccountId,
      DataSourceId: `${StackName}-MachineConfigInformation`,
      Name: `${StackName}-MachineConfigInformation`,
      Type: QuickSightDataSourceType.S3,
      DataSourceParameters: {
        S3Parameters: {
          ManifestFileLocation: {
            Bucket: BucketName,
            Key: `${ManifestPrefix}/${MachineConfigInformationPrefix}_${ManifestPrefix}.json`
          }
        }
      },
      Permissions: quickSightHelper.getPermissions(QuickSightResourceType.DATA_SOURCE),
      SslProperties: { DisableSsl: false }
    });
    expect(mockAws.createDataSource).toHaveBeenNthCalledWith(3, {
      AwsAccountId: AccountId,
      DataSourceId: `${StackName}-Athena`,
      Name: `${StackName}-Athena`,
      Type: QuickSightDataSourceType.ATHENA,
      DataSourceParameters: {
        AthenaParameters: { WorkGroup: 'primary' }
      },
      Permissions: quickSightHelper.getPermissions(QuickSightResourceType.DATA_SOURCE),
      SslProperties: { DisableSsl: false }
    });
    expect(mockAws.createDataSet).toHaveBeenCalledWith({
      AwsAccountId: AccountId,
      DataSetId: `${StackName}-DataSet`,
      Name: `${StackName}-DataSet`,
      ImportMode: QuickSightDataSetImportMode.SPICE,
      PhysicalTableMap: {
        [`${StackName}-MachineInformation`]: {
          S3Source: {
            DataSourceArn: 'mock-machine-information-ds-arn',
            InputColumns: [
              { Name: 'id', Type: 'STRING' },
              { Name: 'machine_name', Type: 'STRING' },
              { Name: 'location', Type: 'STRING' },
              { Name: 'line', Type: 'STRING' }
            ],
            UploadSettings: {
              ContainsHeader: true,
              Delimiter: ',',
              Format: 'CSV',
              TextQualifier: 'SINGLE_QUOTE'
            }
          }
        },
        [`${StackName}-MachineConfigInformation`]: {
          S3Source: {
            DataSourceArn: 'mock-machine-config-information-ds-arn',
            InputColumns: [
              { Name: 'id', Type: 'STRING' },
              { Name: 'status_tag', Type: 'STRING' },
              { Name: 'down_value', Type: 'STRING' }
            ],
            UploadSettings: {
              ContainsHeader: true,
              Delimiter: ',',
              Format: 'CSV',
              TextQualifier: 'SINGLE_QUOTE'
            }
          }
        },
        [`${StackName}-Athena`]: {
          CustomSql: {
            DataSourceArn: 'mock-athena-ds-arn',
            Name: `${StackName}-Athena`,
            SqlQuery: SQL_QUERY.replace('{DATABASE}', GlueDatabaseName).replace('{TABLE}', GlueTableName),
            Columns: [
              { Name: 'id', Type: 'STRING' },
              { Name: 'tag', Type: 'STRING' },
              { Name: 'value', Type: 'STRING' },
              { Name: 'quality', Type: 'STRING' },
              { Name: 'timestamp', Type: 'DATETIME' },
              { Name: 'duration_seconds', Type: 'DECIMAL' },
              { Name: 'duration_minutes', Type: 'DECIMAL' },
              { Name: 'duration_hours', Type: 'DECIMAL' }
            ]
          }
        }
      },
      Permissions: quickSightHelper.getPermissions(QuickSightResourceType.DATA_SET),
      LogicalTableMap: {
        [`${StackName}-Athena`]: {
          Alias: 'Athena',
          Source: { PhysicalTableId: `${StackName}-Athena` }
        },
        [`${StackName}-MachineInformation`]: {
          Alias: 'MachineInformation',
          DataTransforms: [{
            RenameColumnOperation: { ColumnName: 'id', NewColumnName: 'id[MachineInformation]' }
          }],
          Source: { PhysicalTableId: `${StackName}-MachineInformation` }
        },
        [`${StackName}-MachineConfigInformation`]: {
          Alias: 'MachineConfigInformation',
          DataTransforms: [{
            RenameColumnOperation: { ColumnName: 'id', NewColumnName: 'id[MachineConfigInformation]' }
          }],
          Source: { PhysicalTableId: `${StackName}-MachineConfigInformation` }
        },
        JoinMachineConfigInformation: {
          Alias: 'JoinMachineConfigInformation',
          Source: {
            JoinInstruction: {
              LeftOperand: `${StackName}-Athena`,
              RightOperand: `${StackName}-MachineConfigInformation`,
              Type: 'INNER',
              OnClause: '{id} = {id[MachineConfigInformation]} and {tag} = {status_tag} and {value} = {down_value}'
            }
          }
        },
        JoinMachineInformation: {
          Alias: 'JoinAthenaAndMachineInformation',
          DataTransforms: [{
            ProjectOperation: {
              ProjectedColumns: [
                'id',
                'tag',
                'value',
                'quality',
                'timestamp',
                'duration_seconds',
                'duration_minutes',
                'duration_hours',
                'machine_name',
                'location',
                'line'
              ]
            }
          }],
          Source: {
            JoinInstruction: {
              LeftOperand: 'JoinMachineConfigInformation',
              RightOperand: `${StackName}-MachineInformation`,
              Type: 'INNER',
              OnClause: '{id} = {id[MachineInformation]}'
            }
          }
        }
      }
    });
    expect(mockAws.createAnalysis).toHaveBeenCalledWith({
      AwsAccountId: AccountId,
      AnalysisId: `${StackName}-Analysis`,
      Name: `${StackName}-Analysis`,
      SourceEntity: {
        SourceTemplate: {
          Arn: QuickSightTemplate,
          DataSetReferences: [{
            DataSetArn: 'mock-dataset-arn',
            DataSetPlaceholder: 'downtime-dataset'
          }]
        }
      },
      Permissions: quickSightHelper.getPermissions(QuickSightResourceType.ANALYSIS)
    });
    expect(mockAws.createDashboard).toHaveBeenCalledWith({
      AwsAccountId: AccountId,
      DashboardId: `${StackName}-Dashboard`,
      Name: `${StackName}-Dashboard`,
      SourceEntity: {
        SourceTemplate: {
          Arn: QuickSightTemplate,
          DataSetReferences: [{
            DataSetArn: 'mock-dataset-arn',
            DataSetPlaceholder: 'downtime-dataset'
          }]
        }
      },
      Permissions: quickSightHelper.getPermissions(QuickSightResourceType.DASHBOARD),
      DashboardPublishOptions: {
        AdHocFilteringOption: { AvailabilityStatus: 'ENABLED' },
        ExportToCSVOption: { AvailabilityStatus: 'ENABLED' },
        SheetControlsOption: { VisibilityState: 'EXPANDED' }
      }
    });
    expect(mockAws.deleteDataSource).not.toHaveBeenCalled();
    expect(mockAws.deleteDataSet).not.toHaveBeenCalled();
    expect(mockAws.deleteAnalysis).not.toHaveBeenCalled();
    expect(mockAws.deleteDashboard).not.toHaveBeenCalled();
  });

  test('Failure due to QuickSight createDataSource', async () => {
    // PREPARE
    mockAws.createDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.reject({ message: 'quicksight createDataSource failure' }); }
      };
    });
    mockAws.deleteDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because data source has not created.' }); }
      };
    });
    mockAws.deleteDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because data set has not created.' }); }
      };
    });
    mockAws.deleteAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because analysis has not created.' }); }
      };
    });
    mockAws.deleteDashboard.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because dashboard has not created.' }); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'quicksight createDataSource failure' }
    });
    expect(mockAws.createDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.createDataSet).not.toHaveBeenCalled();
    expect(mockAws.createAnalysis).not.toHaveBeenCalled();
    expect(mockAws.createDashboard).not.toHaveBeenCalled();
    expect(mockAws.deleteDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.deleteDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteDashboard).toHaveBeenCalledTimes(1);
  });

  test('Failure due to QuickSight createDataSet', async () => {
    // PREPARE
    mockAws.createDataSource.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-machine-information-ds-arn' }); }
      };
    }).mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-machine-config-information-ds-arn' }); }
      };
    }).mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-athena-ds-arn' }); }
      };
    });
    mockAws.createDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'quicksight createDataSet failure' }); }
      };
    });
    mockAws.deleteDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because dataset has not created.' }); }
      };
    });
    mockAws.deleteAnalysis.mockImplementation(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because analysis has not created.' }); }
      };
    });
    mockAws.deleteDashboard.mockImplementation(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because dashboard has not created.' }); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'quicksight createDataSet failure' }
    });
    expect(mockAws.createDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.createDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.createAnalysis).not.toHaveBeenCalled();
    expect(mockAws.createDashboard).not.toHaveBeenCalled();
    expect(mockAws.deleteDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.deleteDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteDashboard).toHaveBeenCalledTimes(1);
  });

  test('Failure due to QuickSight createAnalysis', async () => {
    // PREPARE
    mockAws.createDataSource.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-machine-information-ds-arn' }); }
      };
    }).mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-machine-config-information-ds-arn' }); }
      };
    }).mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-athena-ds-arn' }); }
      };
    });
    mockAws.createDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-dataset-arn' }); }
      };
    });
    mockAws.createAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'quicksight createAnalysis failure' }); }
      };
    });
    mockAws.deleteDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because analysis has not created.' }); }
      };
    });
    mockAws.deleteDashboard.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because dashboard has not created.' }); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'quicksight createAnalysis failure' }
    });
    expect(mockAws.createDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.createDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.createAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.createDashboard).not.toHaveBeenCalled();
    expect(mockAws.deleteDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.deleteDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteDashboard).toHaveBeenCalledTimes(1);
  });

  test('Failure due to QuickSight createDashboard', async () => {
    // PREPARE
    mockAws.createDataSource.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-machine-information-ds-arn' }); }
      };
    }).mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-machine-config-information-ds-arn' }); }
      };
    }).mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-athena-ds-arn' }); }
      };
    });
    mockAws.createDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-dataset-arn' }); }
      };
    });
    mockAws.createAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });
    mockAws.createDashboard.mockImplementation(() => {
      return {
        promise() { return Promise.reject({ message: 'quicksight createDashboard failure' }); }
      };
    });
    mockAws.deleteDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDashboard.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'this fails because dashboard has not created.' }); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'quicksight createDashboard failure' }
    });
    expect(mockAws.createDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.createDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.createAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.createDashboard).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.deleteDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteDashboard).toHaveBeenCalledTimes(1);
  });
});

describe('Create QuickSight Update - Success and failure', () => {
  beforeAll(() => { mockEvent.RequestType = 'Update'; });
  beforeEach(() => {
    mockAws.createDataSource.mockReset();
    mockAws.createDataSet.mockReset();
    mockAws.createAnalysis.mockReset();
    mockAws.createDashboard.mockReset();
    mockAws.deleteDataSource.mockReset();
    mockAws.deleteDataSet.mockReset();
    mockAws.deleteAnalysis.mockReset();
    mockAws.deleteDashboard.mockReset();
  });

  test('Success', async () => {
    // PREPARE
    mockAws.deleteDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDashboard.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.createDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.resolve({ Arn: 'mock-ds-arn' }); }
      };
    });
    mockAws.createDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });
    mockAws.createAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve('success'); }
      };
    });
    mockAws.createDashboard.mockImplementationOnce(() => {
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
    expect(mockAws.deleteDataSource).toHaveBeenNthCalledWith(1, {
      AwsAccountId: AccountId, DataSourceId: `${StackName}-MachineInformation`
    });
    expect(mockAws.deleteDataSource).toHaveBeenNthCalledWith(2, {
      AwsAccountId: AccountId, DataSourceId: `${StackName}-MachineConfigInformation`
    });
    expect(mockAws.deleteDataSource).toHaveBeenNthCalledWith(3, {
      AwsAccountId: AccountId, DataSourceId: `${StackName}-Athena`
    });
    expect(mockAws.deleteDataSet).toHaveBeenCalledWith({
      AwsAccountId: AccountId, DataSetId: `${StackName}-DataSet`
    });
    expect(mockAws.deleteAnalysis).toHaveBeenCalledWith({
      AwsAccountId: AccountId, AnalysisId: `${StackName}-Analysis`, ForceDeleteWithoutRecovery: true
    });
    expect(mockAws.deleteDashboard).toHaveBeenCalledWith({
      AwsAccountId: AccountId, DashboardId: `${StackName}-Dashboard`
    });
    expect(mockAws.createDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.createDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.createAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.createDashboard).toHaveBeenCalledTimes(1);
  });

  test('Failure due to QuickSight deleteDataSource', async () => {
    // PREPARE
    mockAws.deleteDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.reject({ message: 'quicksight deleteDataSource failure' }); }
      };
    });
    mockAws.deleteDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDashboard.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'quicksight deleteDataSource failure' }
    });
    expect(mockAws.deleteDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.deleteDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteDashboard).toHaveBeenCalledTimes(1);
    expect(mockAws.createDataSource).not.toHaveBeenCalled();
    expect(mockAws.createDataSet).not.toHaveBeenCalled();
    expect(mockAws.createAnalysis).not.toHaveBeenCalled();
    expect(mockAws.createDashboard).not.toHaveBeenCalled();
  });

  test('Failure due to QuickSight deleteDataSet', async () => {
    // PREPARE
    mockAws.deleteDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'quicksight deleteDataSet failure' }); }
      };
    });
    mockAws.deleteAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDashboard.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'quicksight deleteDataSet failure' }
    });
    expect(mockAws.deleteDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.deleteDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteDashboard).toHaveBeenCalledTimes(1);
    expect(mockAws.createDataSource).not.toHaveBeenCalled();
    expect(mockAws.createDataSet).not.toHaveBeenCalled();
    expect(mockAws.createAnalysis).not.toHaveBeenCalled();
    expect(mockAws.createDashboard).not.toHaveBeenCalled();
  });

  test('Failure due to QuickSight deleteAnalysis', async () => {
    // PREPARE
    mockAws.deleteDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'quicksight deleteAnalysis failure' }); }
      };
    });
    mockAws.deleteDashboard.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'quicksight deleteAnalysis failure' }
    });
    expect(mockAws.deleteDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.deleteDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteDashboard).toHaveBeenCalledTimes(1);
    expect(mockAws.createDataSource).not.toHaveBeenCalled();
    expect(mockAws.createDataSet).not.toHaveBeenCalled();
    expect(mockAws.createAnalysis).not.toHaveBeenCalled();
    expect(mockAws.createDashboard).not.toHaveBeenCalled();
  });

  test('Failure due to QuickSight deleteDashboard', async () => {
    // PREPARE
    mockAws.deleteDataSource.mockImplementation(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDataSet.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteAnalysis.mockImplementationOnce(() => {
      return {
        promise() { return Promise.resolve(); }
      };
    });
    mockAws.deleteDashboard.mockImplementationOnce(() => {
      return {
        promise() { return Promise.reject({ message: 'quicksight deleteDashboard failure' }); }
      };
    });

    // WHEN
    const response = await index.handler(mockEvent, mockLambdaContext);

    // THEN
    expect(response).toEqual({
      Status: StatusTypes.Failed,
      Data: { Error: 'quicksight deleteDashboard failure' }
    });
    expect(mockAws.deleteDataSource).toHaveBeenCalledTimes(3);
    expect(mockAws.deleteDataSet).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteAnalysis).toHaveBeenCalledTimes(1);
    expect(mockAws.deleteDashboard).toHaveBeenCalledTimes(1);
    expect(mockAws.createDataSource).not.toHaveBeenCalled();
    expect(mockAws.createDataSet).not.toHaveBeenCalled();
    expect(mockAws.createAnalysis).not.toHaveBeenCalled();
    expect(mockAws.createDashboard).not.toHaveBeenCalled();
  });
});

describe('Create QuickSight Delete', () => {
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

describe('Get permission failure', () => {
  test('Empty principal ARN', () => {
    // WHEN
    function test() {
      quickSightHelper.getPermissions('Unsupported' as any);
    }

    // THEN
    expect(test).toThrowError('Unsupported resource type: Unsupported');
  });
});

describe('QuickSightHelper failure failure', () => {
  test('Empty AWS account ID', () => {
    // WHEN
    function test() {
      new QuickSightHelper({ awsAccountId: '', quickSightPrincipalArn: mockEvent.ResourceProperties.PrincipalArn });
    }

    // THEN
    expect(test).toThrowError('AWS account ID or QuickSight principal ARN cannot be empty.');
  });

  test('Empty principal ARN', () => {
    // WHEN
    function test() {
      new QuickSightHelper({ awsAccountId: mockEvent.ResourceProperties.AccountId, quickSightPrincipalArn: '' });
    }

    // THEN
    expect(test).toThrowError('AWS account ID or QuickSight principal ARN cannot be empty.');
  });
});