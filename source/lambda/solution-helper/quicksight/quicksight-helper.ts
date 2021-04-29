// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import QuickSight from 'aws-sdk/clients/quicksight';
import { IQuickSightCreateAnalysisProps, IQuickSightCreateDashboardProps, IQuickSightCreateDataSetProps,
  IQuickSightCreateDataSourceProps, IQuickSightHelperProps, QuickSightResourceType } from './quicksight-properties';
import { getOptions } from '../../util/metrics';

/**
 * QuickSightHelper class
 * @class QuickSightHelper
 * @description This class handles QuickSight resources.
 */
export default class QuickSightHelper {
  private awsAccountId: string;
  private quickSightClient: QuickSight;
  private quickSightPrincipalArn: string;

  /**
   * QuickSightHelper class constructor
   * @param {IQuickSightHelperProps} props the class properties
   */
  constructor(props: IQuickSightHelperProps) {
    if (!props.awsAccountId || !props.quickSightPrincipalArn) {
      throw new Error('AWS account ID or QuickSight principal ARN cannot be empty.');
    }

    this.awsAccountId = props.awsAccountId;
    this.quickSightClient = new QuickSight(getOptions());
    this.quickSightPrincipalArn = props.quickSightPrincipalArn;
  }

  /**
   * Creates a QuickSight data source.
   * @param {IQuickSightCreateDataSourceProps} props QuickSight data source creation properties
   */
  async createDataSource(props: IQuickSightCreateDataSourceProps) {
    const params: QuickSight.CreateDataSourceRequest = {
      AwsAccountId: this.awsAccountId,
      DataSourceId: props.name,
      Name: props.name,
      Type: props.type,
      DataSourceParameters: props.dataSourceParameters,
      Permissions: this.getPermissions(QuickSightResourceType.DATA_SOURCE),
      SslProperties: { DisableSsl: false }
    };

    console.log('Creating QuickSight data source', JSON.stringify(params, null, 2));
    const response = await this.quickSightClient.createDataSource(params).promise();
    console.log('QuickSight data source created', JSON.stringify(response, null, 2));

    return response;
  }

  /**
   * Deletes a QuickSight data source.
   * @param {string} dataSourceId QuickSight data source ID
   */
  async deleteDataSource(dataSourceId: string) {
    const params: QuickSight.DeleteDataSourceRequest = {
      AwsAccountId: this.awsAccountId,
      DataSourceId: dataSourceId
    };

    console.log('Deleting QuickSight data source', JSON.stringify(params, null, 2));
    const response = await this.quickSightClient.deleteDataSource(params).promise();
    console.log('QuickSight data source deleted', JSON.stringify(response, null, 2));
  }

  /**
   * Creates a QuickSight data set.
   * @param {IQuickSightCreateDataSetProps} props QuickSight data set creation properties
   */
  async createDataSet(props: IQuickSightCreateDataSetProps) {
    const params: QuickSight.CreateDataSetRequest = {
      AwsAccountId: this.awsAccountId,
      DataSetId: props.name,
      Name: props.name,
      ImportMode: props.importMode,
      PhysicalTableMap: props.physicalTableMap,
      Permissions: this.getPermissions(QuickSightResourceType.DATA_SET),
      LogicalTableMap: props.logicalTableMap
    };

    console.log('Creating QuickSight data set', JSON.stringify(params, null, 2));
    const response = await this.quickSightClient.createDataSet(params).promise();
    console.log('QuickSight data set created', JSON.stringify(response, null, 2));

    return response;
  }

  /**
   * Deletes a QuickSight data set.
   * @param {string} dataSetId QuickSight data set ID
   */
  async deleteDataSet(dataSetId: string) {
    const params: QuickSight.DeleteDataSetRequest = {
      AwsAccountId: this.awsAccountId,
      DataSetId: dataSetId
    };

    console.log('Deleting QuickSight data set', JSON.stringify(params, null, 2));
    const response = await this.quickSightClient.deleteDataSet(params).promise();
    console.log('QuickSight data set deleted', JSON.stringify(response, null, 2));
  }

  /**
   * Creates a QuickSight analysis.
   * @param {IQuickSightCreateAnalysisProps} props QuickSight analysis creation properties
   */
  async createAnalysis(props: IQuickSightCreateAnalysisProps) {
    const params: QuickSight.CreateAnalysisRequest = {
      AwsAccountId: this.awsAccountId,
      AnalysisId: props.name,
      Name: props.name,
      SourceEntity: props.sourceEntity,
      Permissions: this.getPermissions(QuickSightResourceType.ANALYSIS)
    };

    console.log('Creating QuickSight analysis', JSON.stringify(params, null, 2));
    const response = await this.quickSightClient.createAnalysis(params).promise();
    console.log('QuickSight analysis created', JSON.stringify(response, null, 2));

    return response;
  }

  /**
   * Deletes a QuickSight analysis.
   * @param {string} analysisId QuickSight analysis ID
   */
  async deleteAnalysis(analysisId: string) {
    const params: QuickSight.DeleteAnalysisRequest = {
      AwsAccountId: this.awsAccountId,
      AnalysisId: analysisId,
      ForceDeleteWithoutRecovery: true
    };

    console.log('Deleting QuickSight analysis', JSON.stringify(params, null, 2));
    const response = await this.quickSightClient.deleteAnalysis(params).promise();
    console.log('QuickSight analysis deleted', JSON.stringify(response, null, 2));
  }

  /**
   * Creates a QuickSight dashboard.
   * @param {IQuickSightCreateDashboardProps} props QuickSight dashboard creation properties
   */
  async createDashboard(props: IQuickSightCreateDashboardProps) {
    const params: QuickSight.CreateDashboardRequest = {
      AwsAccountId: this.awsAccountId,
      DashboardId: props.name,
      Name: props.name,
      SourceEntity: props.sourceEntity,
      Permissions: this.getPermissions(QuickSightResourceType.DASHBOARD),
      DashboardPublishOptions: {
        AdHocFilteringOption: { AvailabilityStatus: 'ENABLED' },
        ExportToCSVOption: { AvailabilityStatus: 'ENABLED' },
        SheetControlsOption: { VisibilityState: 'EXPANDED' }
      }
    };

    console.log('Creating QuickSight dashboard', JSON.stringify(params, null, 2));
    const response = await this.quickSightClient.createDashboard(params).promise();
    console.log('QuickSight dashboard created', JSON.stringify(response, null, 2));

    return response;
  }

  /**
   * Deletes a QuickSight dashbaord.
   * @param {string} dashboardId QuickSight dashbaord ID
   */
  async deleteDashboard(dashboardId: string) {
    const params: QuickSight.DeleteDashboardRequest = {
      AwsAccountId: this.awsAccountId,
      DashboardId: dashboardId
    };

    console.log('Deleting QuickSight dashbaord', JSON.stringify(params, null, 2));
    const response = await this.quickSightClient.deleteDashboard(params).promise();
    console.log('QuickSight dashbaord deleted', JSON.stringify(response, null, 2));
  }

  /**
   * Gets QuickSight permissions based on the resource type.
   * @param {QuickSightResourceType} resourceType QuickSight resource type
   * @returns {QuickSight.ResourcePermissionList} QuickSight resource permissions
   */
  getPermissions(resourceType: QuickSightResourceType): QuickSight.ResourcePermissionList {
    switch(resourceType) {
      case QuickSightResourceType.DATA_SOURCE:
        return [{
          Principal: this.quickSightPrincipalArn,
          Actions: [
            'quicksight:DescribeDataSource',
            'quicksight:DescribeDataSourcePermissions',
            'quicksight:PassDataSource',
            'quicksight:UpdateDataSource',
            'quicksight:DeleteDataSource',
            'quicksight:UpdateDataSourcePermissions'
          ]
        }];
      case QuickSightResourceType.DATA_SET:
        return [{
          Principal: this.quickSightPrincipalArn,
          Actions: [
            'quicksight:DescribeDataSet',
            'quicksight:DescribeDataSetPermissions',
            'quicksight:PassDataSet',
            'quicksight:DescribeIngestion',
            'quicksight:ListIngestions',
            'quicksight:UpdateDataSet',
            'quicksight:DeleteDataSet',
            'quicksight:CreateIngestion',
            'quicksight:CancelIngestion',
            'quicksight:UpdateDataSetPermissions'
          ]
        }];
      case QuickSightResourceType.ANALYSIS:
        return [{
          Principal: this.quickSightPrincipalArn,
          Actions: [
            'quicksight:RestoreAnalysis',
            'quicksight:UpdateAnalysisPermissions',
            'quicksight:DeleteAnalysis',
            'quicksight:QueryAnalysis',
            'quicksight:DescribeAnalysisPermissions',
            'quicksight:DescribeAnalysis',
            'quicksight:UpdateAnalysis'
          ]
        }];
      case QuickSightResourceType.DASHBOARD:
        return [{
          Principal: this.quickSightPrincipalArn,
          Actions: [
            'quicksight:DescribeDashboard',
            'quicksight:ListDashboardVersions',
            'quicksight:UpdateDashboardPermissions',
            'quicksight:QueryDashboard',
            'quicksight:UpdateDashboard',
            'quicksight:DeleteDashboard',
            'quicksight:DescribeDashboardPermissions',
            'quicksight:UpdateDashboardPublishedVersion'
          ]
        }];
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }
  }
}