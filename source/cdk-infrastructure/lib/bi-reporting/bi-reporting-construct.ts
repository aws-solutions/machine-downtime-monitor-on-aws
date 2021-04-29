// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Aspects, CfnCondition, CfnResource, Construct, Fn, IAspect, IConstruct } from '@aws-cdk/core';
import { Table as DynamoDBTable } from '@aws-cdk/aws-dynamodb';
import { Function as LambdaFunction } from '@aws-cdk/aws-lambda';
import { Bucket } from '@aws-cdk/aws-s3';
import { Etl } from './etl/etl-construct';
import { QuickSightReporting } from './quicksight/quicksight-construct';

/**
 * BI reporting props interface
 */
export interface IBIReportingProps {
  // Config DynamoDB table
  readonly configTable: DynamoDBTable;
  // Lower case stack name
  readonly lowerCaseStackName: string;
  // QuickSight principal ARN
  readonly quickSightPrincipalArn: string;
  // QuickSight template
  readonly quickSightTemplate: string;
  // Raw data S3 bucket name
  readonly rawDataS3BucketName: string;
  // S3 logging bucket
  readonly s3LoggingBucket: Bucket;
  // Solution helper Lambda function
  readonly solutionHelperFunction: LambdaFunction;
  // Solution ID
  readonly solutionId: string;
  // Solution version
  readonly solutionVersion: string;
  // Source code bucket prefix
  readonly sourceCodeBucketName: string;
  // Source code key prefix
  readonly sourceCodeKeyPrefix: string;
  // UI reference DynamoDB table
  readonly uiReferenceTable: DynamoDBTable;
}

/**
 * CDK Aspect implementation to set up conditions to the entire Construct resources
 */
class ConditionAspect implements IAspect {
  private readonly condition: CfnCondition;

  constructor(condition: CfnCondition) {
    this.condition = condition;
  }

  /**
   * Implement IAspect.visit to set the condition to whole resources in Construct.
   * @param {IConstruct} node Construct node to visit
   */
  visit(node: IConstruct): void {
    const resource = node as CfnResource;
    if (resource.cfnOptions) {
      resource.cfnOptions.condition = this.condition;
    }
  }
}

/**
 * BI reporting including ETL and QuickSight
 */
export class BIReporting extends Construct {
  // Glue S3 bucket
  public readonly glueBucket: Bucket;
  // Glue metadata S3 bucket
  public readonly glueMetadataBucket: Bucket;

  constructor(scope: Construct, id: string, props: IBIReportingProps) {
    super(scope, id);

    const quickSightCondition = new CfnCondition(this, 'QuickSightCondition', {
      expression: Fn.conditionNot(Fn.conditionEquals(props.quickSightPrincipalArn, ''))
    });

    // ETL configuration files prefix and the S3 bucket prefix to store files
    const csvPrefix = 'csv';
    const manifestPrefix = 'manifest';
    const machineInformationPrefix = 'machine_information';
    const machineConfigInformationPrefix = 'machine_config_information';

    const etl = new Etl(this, 'Etl', {
      configTable: props.configTable,
      lowerCaseStackName: props.lowerCaseStackName,
      metadataConfiguration: {
        csvPrefix,
        manifestPrefix,
        machineInformationPrefix,
        machineConfigInformationPrefix
      },
      rawDataS3BucketName: props.rawDataS3BucketName,
      s3LoggingBucket: props.s3LoggingBucket,
      solutionHelperFunction: props.solutionHelperFunction,
      solutionId: props.solutionId,
      solutionVersion: props.solutionVersion,
      sourceCodeBucketName: props.sourceCodeBucketName,
      sourceCodeKeyPrefix: props.sourceCodeKeyPrefix,
      uiReferenceTable: props.uiReferenceTable
    });
    this.glueBucket = etl.glueBucket;
    this.glueMetadataBucket = etl.glueMetadataBucket;

    const quickSight = new QuickSightReporting(this, 'QuickSight', {
      glueCustomResource: etl.glueCustomResource,
      glueDatabaseName: etl.glueDatabase.databaseName,
      glueTableName: etl.glueTable.tableName,
      metadataConfiguration: {
        bucketName: etl.glueMetadataBucket.bucketName,
        machineInformationPrefix,
        machineConfigInformationPrefix,
        manifestPrefix
      },
      quickSightPrincipalArn: props.quickSightPrincipalArn,
      quickSightTemplate: props.quickSightTemplate,
      solutionHelperFunction: props.solutionHelperFunction,
    });
    Aspects.of(quickSight).add(new ConditionAspect(quickSightCondition));
  }
}