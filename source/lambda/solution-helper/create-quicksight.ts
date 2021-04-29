// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ICreateQuickSightRequest, ICreateQuickSightRequestProps } from './custom-resource-utils';
import QuickSightHelper from './quicksight/quicksight-helper';
import { IQuickSightCreateDataSourceProps, QuickSightDataSetImportMode, QuickSightDataSourceType } from './quicksight/quicksight-properties';

// AWS Clients
import QuickSight from 'aws-sdk/clients/quicksight';

// Athena SQL query to calculate the duration of tag values
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

/**
 * Handles QuickSight resources creation.
 * @param {ICreateQuickSightRequest} event Lambda event
 * @returns {Promise<string>} Custom resource result message
 */
export async function handleQuickSightResourceCreation(event: ICreateQuickSightRequest): Promise<string> {
  const resourceProperties = event.ResourceProperties;
  const machineInformationId = `${resourceProperties.StackName}-MachineInformation`;
  const machineConfigInformationId = `${resourceProperties.StackName}-MachineConfigInformation`;
  const athenaId = `${resourceProperties.StackName}-Athena`;
  const dataSetName = `${resourceProperties.StackName}-DataSet`;
  const analysisName = `${resourceProperties.StackName}-Analysis`;
  const dashboardName = `${resourceProperties.StackName}-Dashboard`;

  const uploadSettings = {
    ContainsHeader: true,
    Delimiter: ',',
    Format: 'CSV',
    TextQualifier: 'SINGLE_QUOTE'
  };

  const quickSightHelper = new QuickSightHelper({
    awsAccountId: resourceProperties.AccountId,
    quickSightPrincipalArn: resourceProperties.PrincipalArn
  });

  switch (event.RequestType) {
    case 'Update':
      await deleteAllQuickSightResources(resourceProperties.StackName, dataSetName, analysisName, dashboardName, quickSightHelper);
      // fall through to create data sources and a data set
    case 'Create':
      try {
        // Creates QuickSight data sources
        const { machineInformationDataSource, machineConfigInformationDataSource, athenaDataSource } = await createAllDataSources(resourceProperties, quickSightHelper);

        // Creates a QuickSight data set
        const dataSet = await quickSightHelper.createDataSet({
          name: dataSetName,
          importMode: QuickSightDataSetImportMode.SPICE,
          physicalTableMap: {
            [machineInformationId]: {
              S3Source: {
                DataSourceArn: machineInformationDataSource.Arn,
                InputColumns: [
                  { Name: 'id', Type: 'STRING' },
                  { Name: 'machine_name', Type: 'STRING' },
                  { Name: 'location', Type: 'STRING' },
                  { Name: 'line', Type: 'STRING' }
                ],
                UploadSettings: uploadSettings
              }
            },
            [machineConfigInformationId]: {
              S3Source: {
                DataSourceArn: machineConfigInformationDataSource.Arn,
                InputColumns: [
                  { Name: 'id', Type: 'STRING' },
                  { Name: 'status_tag', Type: 'STRING' },
                  { Name: 'down_value', Type: 'STRING' }
                ],
                UploadSettings: uploadSettings
              }
            },
            [athenaId]: {
              CustomSql: {
                DataSourceArn: athenaDataSource.Arn,
                Name: athenaId,
                SqlQuery: SQL_QUERY.replace('{DATABASE}', resourceProperties.GlueDatabaseName).replace('{TABLE}', resourceProperties.GlueTableName),
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
          logicalTableMap: {
            [athenaId]: {
              Alias: 'Athena',
              Source: { PhysicalTableId: athenaId }
            },
            [machineInformationId]: {
              Alias: 'MachineInformation',
              DataTransforms: [{
                RenameColumnOperation: { ColumnName: 'id', NewColumnName: 'id[MachineInformation]' }
              }],
              Source: { PhysicalTableId: machineInformationId }
            },
            [machineConfigInformationId]: {
              Alias: 'MachineConfigInformation',
              DataTransforms: [{
                RenameColumnOperation: { ColumnName: 'id', NewColumnName: 'id[MachineConfigInformation]' }
              }],
              Source: { PhysicalTableId: machineConfigInformationId }
            },
            JoinMachineConfigInformation: {
              Alias: 'JoinMachineConfigInformation',
              Source: {
                JoinInstruction: {
                  LeftOperand: athenaId,
                  RightOperand: machineConfigInformationId,
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
                  RightOperand: machineInformationId,
                  Type: 'INNER',
                  OnClause: '{id} = {id[MachineInformation]}'
                }
              }
            }
          }
        });

        // Creates a QuickSight analysis
        await quickSightHelper.createAnalysis({
          name: analysisName,
          sourceEntity: {
            SourceTemplate: {
              Arn: resourceProperties.QuickSightTemplate,
              DataSetReferences: [{
                DataSetArn: dataSet.Arn,
                DataSetPlaceholder: 'downtime-dataset'
              }]
            }
          }
        });

        // Creates a QuickSight dashboard
        await quickSightHelper.createDashboard({
          name: dashboardName,
          sourceEntity: {
            SourceTemplate: {
              Arn: resourceProperties.QuickSightTemplate,
              DataSetReferences: [{
                DataSetArn: dataSet.Arn,
                DataSetPlaceholder: 'downtime-dataset'
              }]
            }
          }
        });
      } catch (error) {
        // If any error happens, try to rollback everything, but in this time, it just passes when rollback fails.
        console.error(error);

        try {
          console.error('Rolling back all QuickSight resources');
          await deleteAllQuickSightResources(resourceProperties.StackName, dataSetName, analysisName, dashboardName, quickSightHelper);
        } catch (rollbackError) {
          console.error('Error occurred while rolling back the QuickSight resources', rollbackError);
        }

        throw error;
      }

      return `${event.RequestType} completed OK`;
    default:
      return `No action needed for ${event.RequestType}`;
  }
}

/**
 * Creates all QuickSight data sources.
 * @param {ICreateQuickSightRequestProps} props QuickSight general properties including the metadata and the stack name
 * @param {QuickSightHelper} quickSightHelper QuickSight helper
 * @returns {Promise<{[key: string]: QuickSight.CreateDataSourceResponse}>} The result of QuickSight data source creations
 */
async function createAllDataSources(props: ICreateQuickSightRequestProps, quickSightHelper: QuickSightHelper): Promise<{[key: string]: QuickSight.CreateDataSourceResponse}> {
  const metadata = props.Metadata;
  const machineInformationId = `${props.StackName}-MachineInformation`;
  const machineConfigInformationId = `${props.StackName}-MachineConfigInformation`;
  const athenaId = `${props.StackName}-Athena`;

  // Machine information data source which contains machine ID, name, location, and line
  const machineInformationDataSourceParams: IQuickSightCreateDataSourceProps = {
    name: machineInformationId,
    type: QuickSightDataSourceType.S3,
    dataSourceParameters: {
      S3Parameters: {
        ManifestFileLocation: {
          Bucket: metadata.BucketName,
          Key: `${metadata.ManifestPrefix}/${metadata.MachineInformationPrefix}_${metadata.ManifestPrefix}.json`
        }
      }
    }
  };

  // Machine config information data source which contains machine ID, down status tag, and down values
  const machineConfigInformationDataSourceParams = {
    name: machineConfigInformationId,
    type: QuickSightDataSourceType.S3,
    dataSourceParameters: {
      S3Parameters: {
        ManifestFileLocation: {
          Bucket: metadata.BucketName,
          Key: `${metadata.ManifestPrefix}/${metadata.MachineConfigInformationPrefix}_${metadata.ManifestPrefix}.json`
        }
      }
    }
  };

  // Athena data source from the parquet data
  const athenaDataSourceParams = {
    name: athenaId,
    type: QuickSightDataSourceType.ATHENA,
    dataSourceParameters: {
      AthenaParameters: { WorkGroup: 'primary' }
    }
  };

  const [machineInformationDataSource, machineConfigInformationDataSource, athenaDataSource]  = await Promise.all([
    quickSightHelper.createDataSource(machineInformationDataSourceParams),
    quickSightHelper.createDataSource(machineConfigInformationDataSourceParams),
    quickSightHelper.createDataSource(athenaDataSourceParams)
  ]);

  return { machineInformationDataSource, machineConfigInformationDataSource, athenaDataSource };
}

/**
 * Deletes all existing data sources.
 * @param {string} stackName The stack name
 * @param {QuickSightHelper} quickSightHelper QuickSight helper
 */
async function deleteAllDataSource(stackName: string, quickSightHelper: QuickSightHelper) {
  const machineInformationId = `${stackName}-MachineInformation`;
  const machineConfigInformationId = `${stackName}-MachineConfigInformation`;
  const athenaId = `${stackName}-Athena`;

  await Promise.all([
    quickSightHelper.deleteDataSource(machineInformationId),
    quickSightHelper.deleteDataSource(machineConfigInformationId),
    quickSightHelper.deleteDataSource(athenaId)
  ]);
}

/**
 * Deletes all QuickSight resources.
 * @param {string} stackName Stack name
 * @param {string} dataSetName Data set name
 * @param {string} analysisName Analysis name
 * @param {string} dashboardName Dashboard name
 * @param {string} quickSightHelper QuickSight helper
 */
async function deleteAllQuickSightResources(stackName: string, dataSetName: string,
  analysisName: string, dashboardName: string, quickSightHelper: QuickSightHelper) {
  await Promise.all([
    deleteAllDataSource(stackName, quickSightHelper),
    quickSightHelper.deleteDataSet(dataSetName),
    quickSightHelper.deleteAnalysis(analysisName),
    quickSightHelper.deleteDashboard(dashboardName)
  ]);
}