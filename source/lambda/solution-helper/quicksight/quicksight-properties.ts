// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import QuickSight from 'aws-sdk/clients/quicksight';

/**
 * @interface IQuickSightHelperProps
 * @description QuickSightHelper properties
 */
export interface IQuickSightHelperProps {
  /**
   * AWS Account ID
   */
  awsAccountId: string;
  /**
   * QuickSight principal ARN for permissions
   */
  quickSightPrincipalArn: string;
}

/**
 * @interface IQuickSightCreateDataSourceProps
 * @extends IQuickSightResourceCommonProps
 * @description The properties to create a QuickSight data source
 */
export interface IQuickSightCreateDataSourceProps extends IQuickSightResourceCommonProps {
  /**
   * QuickSight data source type
   * https://docs.aws.amazon.com/quicksight/latest/APIReference/API_CreateDataSource.html#QS-CreateDataSource-request-Type
   */
  type: QuickSightDataSourceType;
  /**
   * QuickSight data source parameters
   * https://docs.aws.amazon.com/quicksight/latest/APIReference/API_DataSourceParameters.html
   */
  dataSourceParameters: QuickSight.DataSourceParameters;
}

/**
 * @interface IQuickSightCreateDataSetProps
 * @extends IQuickSightResourceCommonProps
 * @description The properties to create a QuickSight data set
 */
export interface IQuickSightCreateDataSetProps extends IQuickSightResourceCommonProps {
  /**
   * QuickSight data set import mode
   * https://docs.aws.amazon.com/quicksight/latest/APIReference/API_CreateDataSet.html#QS-CreateDataSet-request-ImportMode
   */
  importMode: QuickSightDataSetImportMode;
  /**
   * QuickSight data set physical table map
   * https://docs.aws.amazon.com/quicksight/latest/APIReference/API_PhysicalTable.html
   */
  physicalTableMap: QuickSight.PhysicalTableMap;
  /**
   * (Optional) QuickSight data set column groups
   * https://docs.aws.amazon.com/quicksight/latest/APIReference/API_ColumnGroup.html
   */
  columnGroups?: QuickSight.ColumnGroupList;
  /**
   * (Optional) QuickSight data set logical table map
   * https://docs.aws.amazon.com/quicksight/latest/APIReference/API_LogicalTable.html
   */
  logicalTableMap?: QuickSight.LogicalTableMap;
}

/**
 * @interface IQuickSightCreateAnalysisProps
 * @extends IQuickSightResourceCommonProps
 * @description The properties to create a QuickSight analysis
 */
export interface IQuickSightCreateAnalysisProps extends IQuickSightResourceCommonProps {
  /**
   * QuickSight analysis source entity
   * https://docs.aws.amazon.com/quicksight/latest/APIReference/API_AnalysisSourceEntity.html
   */
  sourceEntity: QuickSight.AnalysisSourceEntity;
}

/**
 * @interface IQuickSightCreateDashboardProps
 * @extends IQuickSightResourceCommonProps
 * @description The properties to create a QuickSight dashboard
 */
export interface IQuickSightCreateDashboardProps extends IQuickSightResourceCommonProps {
  /**
   * QuickSight dashboard source entity
   * https://docs.aws.amazon.com/quicksight/latest/APIReference/API_DashboardSourceEntity.html
   */
  sourceEntity: QuickSight.DashboardSourceEntity;
  /**
   * (Optional) QuickSight dashboard publish options
   * https://docs.aws.amazon.com/quicksight/latest/APIReference/API_DashboardPublishOptions.html
   */
  dashboardPublishOptions?: QuickSight.DashboardPublishOptions;
}

/**
 * @interface IQuickSightResourceCommon
 * @description The common properties of QuickSight resource
 */
interface IQuickSightResourceCommonProps {
  name: string;
}

/**
 * @enum
 * @description The QuickSight resource type
 */
export enum QuickSightResourceType {
  DATA_SOURCE = 'DATA_SOURCE',
  DATA_SET = 'DATA_SET',
  ANALYSIS = 'ANALYSIS',
  DASHBOARD = 'DASHBOARD'
}

/**
 * @enum
 * @description The QuickSight data source type
 */
export enum QuickSightDataSourceType {
  ADOBE_ANALYTICS = 'ADOBE_ANALYTICS',
  AMAZON_ELASTICSEARCH = 'AMAZON_ELASTICSEARCH',
  ATHENA = 'ATHENA',
  AURORA = 'AURORA',
  AURORA_POSTGRESQL = 'AURORA_POSTGRESQL',
  AWS_IOT_ANALYTICS = 'AWS_IOT_ANALYTICS',
  GITHUB = 'GITHUB',
  JIRA = 'JIRA',
  MARIADB = 'MARIADB',
  MYSQL = 'MYSQL',
  ORACLE = 'ORACLE',
  POSTGRESQL = 'POSTGRESQL',
  PRESTO = 'PRESTO',
  REDSHIFT = 'REDSHIFT',
  S3 = 'S3',
  SALESFORCE = 'SALESFORCE',
  SERVICENOW = 'SERVICENOW',
  SNOWFLAKE = 'SNOWFLAKE',
  SPARK = 'SPARK',
  SQLSERVER = 'SQLSERVER',
  TERADATA = 'TERADATA',
  TWITTER = 'TWITTER',
  TIMESTREAM = 'TIMESTREAM'
}

/**
 * @enum
 * @description The QuickSight data set import mode
 */
export enum QuickSightDataSetImportMode {
  SPICE = 'SPICE',
  DIRECT_QUERY = 'DIRECT_QUERY'
}