// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Aws, Construct, CustomResource } from '@aws-cdk/core';
import { Effect, Policy, PolicyStatement } from '@aws-cdk/aws-iam';
import { Function as LambdaFunction } from '@aws-cdk/aws-lambda';

/**
 * BI reporting - QuickSight reporting construct props interface
 */
export interface IQuickSightReportingProps {
  // Glue custom resource
  readonly glueCustomResource: CustomResource;
  // Glue database
  readonly glueDatabaseName: string;
  // Glue table
  readonly glueTableName: string;
  // Metadata configuration
  readonly metadataConfiguration: {
    bucketName: string;
    manifestPrefix: string;
    machineInformationPrefix: string;
    machineConfigInformationPrefix: string;
  };
  // QuickSight principal ARN
  readonly quickSightPrincipalArn: string;
  // QuickSight template
  readonly quickSightTemplate: string;
  // Solution helper Lambda function
  readonly solutionHelperFunction: LambdaFunction;
}

/**
 * BI reporting - QuickSight reporting construct
 */
export class QuickSightReporting extends Construct {
  constructor(scope: Construct, id: string, props: IQuickSightReportingProps) {
    super(scope, id);

    const { bucketName, manifestPrefix, machineInformationPrefix, machineConfigInformationPrefix } = props.metadataConfiguration;

    const solutionHelperQuickSightPolicy = new Policy(this, 'SolutionHelperQuickSightPolicy', {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'quicksight:CreateDataSource',
            'quicksight:DeleteDataSource',
            'quicksight:PassDataSource'
          ],
          resources: [`arn:${Aws.PARTITION}:quicksight:${Aws.REGION}:${Aws.ACCOUNT_ID}:datasource/${Aws.STACK_NAME}*`]
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'quicksight:CreateDataSet',
            'quicksight:DeleteDataSet',
            'quicksight:PassDataSet'
          ],
          resources: [`arn:${Aws.PARTITION}:quicksight:${Aws.REGION}:${Aws.ACCOUNT_ID}:dataset/${Aws.STACK_NAME}*`]
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'quicksight:CreateAnalysis',
            'quicksight:DeleteAnalysis'
          ],
          resources: [`arn:${Aws.PARTITION}:quicksight:${Aws.REGION}:${Aws.ACCOUNT_ID}:analysis/${Aws.STACK_NAME}*`]
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'quicksight:CreateDashboard',
            'quicksight:DeleteDashboard'
          ],
          resources: [`arn:${Aws.PARTITION}:quicksight:${Aws.REGION}:${Aws.ACCOUNT_ID}:dashboard/${Aws.STACK_NAME}*`]
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['quicksight:DescribeTemplate'],
          resources: [props.quickSightTemplate]
        })
      ],
      roles: [props.solutionHelperFunction.role!]
    });

    const quickSightCustomResource = new CustomResource(this, 'QuickSightCustomResource', {
      serviceToken: props.solutionHelperFunction.functionArn,
      properties: {
        Action: 'CREATE_QUICKSIGHT',
        AccountId: Aws.ACCOUNT_ID,
        GlueDatabaseName: props.glueDatabaseName,
        GlueTableName: props.glueTableName,
        Metadata: {
          BucketName: bucketName,
          MachineInformationPrefix: machineInformationPrefix,
          MachineConfigInformationPrefix: machineConfigInformationPrefix,
          ManifestPrefix: manifestPrefix
        },
        PrincipalArn: props.quickSightPrincipalArn,
        QuickSightTemplate: props.quickSightTemplate,
        StackName: Aws.STACK_NAME
      }
    });
    quickSightCustomResource.node.addDependency(solutionHelperQuickSightPolicy);
    quickSightCustomResource.node.addDependency(props.glueCustomResource);
  }
}