// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct, Stack, StackProps, CfnMapping, CfnOutput, CfnParameter, CfnCondition, Fn, Aws } from '@aws-cdk/core';
import { CfnStack } from '@aws-cdk/aws-cloudformation';
import { FrontEnd } from './front-end/front-end-construct';
import { RealTimeProcessing } from './real-time-processing/real-time-processing-construct';
import { SolutionHelper } from './solution-helper/solution-helper-construct';
import { CommonResources } from './common-resources/common-resources-construct';
import { BIReporting } from './bi-reporting/bi-reporting-construct';

export interface IMachineDowntimeMonitorOnAwsStackProps extends StackProps {
  readonly description: string;
  readonly solutionId: string;
  readonly solutionName: string;
  readonly solutionVersion: string;
  readonly solutionDisplayName: string;
  readonly solutionAssetHostingBucketNamePrefix: string;
  readonly quickSightTemplate: string;
  readonly m2cTemplateUrlAnonymousDataYes: string;
  readonly m2cTemplateUrlAnonymousDataNo: string;
}

export class MachineDowntimeMonitorOnAwsStack extends Stack {
  constructor(scope: Construct, id: string, props: IMachineDowntimeMonitorOnAwsStackProps) {
    super(scope, id, props);

    const defaultUserEmail = new CfnParameter(this, 'DefaultUserEmail', {
      description: 'An email will be sent with a temporary password and a link to the dashboard',
      allowedPattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$',
      constraintDescription: 'Default User Email must be a valid email address'
    });
    const deployM2C = new CfnParameter(this, 'DeployM2C', {
      description: 'Machine to Cloud Connectivity Framework uses AWS IoT Greengrass to bring machine data into the AWS Cloud. Selecting \'Yes\' will deploy Machine to Cloud Connectivity Framework as a nested template and configure it to send data to the Amazon Kinesis Data Stream deployed by Machine Downtime Monitor. For more information, please see the implementation guide',
      allowedValues: ['No', 'Yes'],
      default: 'No'
    });
    const deployM2CCondition = new CfnCondition(this, 'deployM2CCondition', { expression: Fn.conditionEquals(deployM2C, 'Yes') });
    const m2cExistingGreengrassGroupID = new CfnParameter(this, 'M2CExistingGreengrassGroupID', {
      type: 'String',
      description: 'If you selected \'Yes\' for deploying Machine to Cloud Connectivity Framework as a nested template and want to use an EXISTING Greengrass group, fill out this parameter. The Greengrass Group ID can be found in the Settings option of your Greengrass group in the console. If you selected \'Yes\' for deploying Machine to Cloud Connectivity Framework as a nested template and leave this parameter blank, a Greengrass Group will be created for you. If you selected \'No\', this parameter is ignored.',
      allowedPattern: '[a-zA-Z0-9-]*',
      constraintDescription: 'Greengrass group ID should match the allowed pattern: [a-zA-Z0-9-]'
    });
    const quickSightPrincipalArn = new CfnParameter(this, 'QuickSightPrincipalArn', {
      type: 'String',
      description: 'Please see the \'Data analysis\' section under \'Solution components\' in the implementation guide for more information: https://docs.aws.amazon.com/solutions/latest/machine-downtime-monitor-on-aws/',
      allowedPattern: '^$|arn:\\S+:quicksight:\\S+:\\d{12}:user/\\S+$',
      constraintDescription: 'Provide an arn matching an Amazon Quicksight User ARN. The input did not match the validation pattern.'
    });

    this.templateOptions.metadata = {
      'AWS::CloudFormation::Interface': {
        ParameterGroups: [
          {
            Label: { default: 'Dashboard Configuration' },
            Parameters: [defaultUserEmail.logicalId]
          },
          {
            Label: { default: 'Machine to Cloud Connectivity Framework Deployment (Optional)' },
            Parameters: [deployM2C.logicalId, m2cExistingGreengrassGroupID.logicalId]
          },
          {
            Label: { default: 'QuickSight Configuration (Optional)' },
            Parameters: [quickSightPrincipalArn.logicalId]
          }
        ],
        ParameterLabels: {
          [defaultUserEmail.logicalId]: {
            default: 'Default Dashboard User Email Address'
          },
          [deployM2C.logicalId]: {
            default: 'Deploy Machine to Cloud Connectivity Framework as a nested template?'
          },
          [m2cExistingGreengrassGroupID.logicalId]: {
            default: 'Existing Greengrass Group ID (if deploying Machine to Cloud Connectivity Framework)'
          },
          [quickSightPrincipalArn.logicalId]: {
            default: 'If you have QuickSight Enterprise Edition subscription, enter the QuickSight User Principal ARN below and a QuickSight dashboard will be created for you'
          }
        }
      }
    };

    const solutionMapping = new CfnMapping(this, 'Solution', {
      mapping: {
        Config: {
          SendAnonymousData: 'Yes',
          SolutionId: props.solutionId,
          Version: props.solutionVersion,
          S3BucketPrefix: props.solutionAssetHostingBucketNamePrefix,
          S3KeyPrefix: `${props.solutionName}/${props.solutionVersion}`
        }
      }
    });

    const sourceCodeBucketName = `${solutionMapping.findInMap('Config', 'S3BucketPrefix')}-${Aws.REGION}`;
    const anonymousUsageCondition = new CfnCondition(this, 'anonymousUsageCondition', { expression: Fn.conditionEquals(solutionMapping.findInMap('Config', 'SendAnonymousData'), 'Yes') });

    const solutionHelper = new SolutionHelper(this, 'SolutionHelper', {
      sourceCodeBucketName,
      sourceCodeKeyPrefix: solutionMapping.findInMap('Config', 'S3KeyPrefix'),
      sendAnonymousData: solutionMapping.findInMap('Config', 'SendAnonymousData'),
      anonymousUsageCondition,
      solutionId: solutionMapping.findInMap('Config', 'SolutionId'),
      solutionVersion: props.solutionVersion,
      deployM2CParameter: deployM2C.valueAsString
    });

    const commonResources = new CommonResources(this, 'CommonResources');

    const frontEnd = new FrontEnd(this, 'FrontEnd', {
      defaultUserEmail: defaultUserEmail.valueAsString,
      sourceCodeBucketName,
      sourceCodeKeyPrefix: solutionMapping.findInMap('Config', 'S3KeyPrefix'),
      solutionDisplayName: props.solutionDisplayName,
      s3LoggingBucket: commonResources.s3LoggingBucket,
      sendAnonymousData: solutionMapping.findInMap('Config', 'SendAnonymousData'),
      anonymousDataUUID: solutionHelper.anonymousDataUUID,
      solutionId: solutionMapping.findInMap('Config', 'SolutionId'),
      solutionVersion: props.solutionVersion,
    });

    const realTimeProcessing = new RealTimeProcessing(this, 'RealTimeProcessing', {
      configTable: frontEnd.configTable,
      uiReferenceTable: frontEnd.uiReferenceTable,
      realTimeDataTable: frontEnd.realTimeDataTable,
      graphqlApi: frontEnd.graphqlApi,
      sourceCodeBucketName,
      sourceCodeKeyPrefix: solutionMapping.findInMap('Config', 'S3KeyPrefix'),
      s3LoggingBucket: commonResources.s3LoggingBucket,
      sendAnonymousData: solutionMapping.findInMap('Config', 'SendAnonymousData'),
      anonymousDataUUID: solutionHelper.anonymousDataUUID,
      solutionId: solutionMapping.findInMap('Config', 'SolutionId'),
      solutionVersion: props.solutionVersion
    });

    solutionHelper.setupCopyAssetsCustomResource({
      graphQLEndpoint: frontEnd.graphqlApi.graphqlUrl,
      hostingBucket: frontEnd.websiteHostingBucket,
      identityPoolId: frontEnd.identityPool.ref,
      userPoolClientId: frontEnd.userPoolClient.userPoolClientId,
      userPoolId: frontEnd.userPool.userPoolId
    });

    solutionHelper.setupConfigureMachineDataCustomResource({
      configTable: frontEnd.configTable,
      uiReferenceTable: frontEnd.uiReferenceTable
    });

    const biReporting = new BIReporting(this, 'BIReporting', {
      configTable: frontEnd.configTable,
      lowerCaseStackName: solutionHelper.lowerCaseStackName,
      quickSightPrincipalArn: quickSightPrincipalArn.valueAsString,
      quickSightTemplate: props.quickSightTemplate,
      rawDataS3BucketName: realTimeProcessing.rawDataBucketName,
      s3LoggingBucket: commonResources.s3LoggingBucket,
      solutionHelperFunction: solutionHelper.customResourceLambda,
      solutionId: solutionMapping.findInMap('Config', 'SolutionId'),
      solutionVersion: props.solutionVersion,
      sourceCodeBucketName,
      sourceCodeKeyPrefix: solutionMapping.findInMap('Config', 'S3KeyPrefix'),
      uiReferenceTable: frontEnd.uiReferenceTable
    });

    const m2CTemplateUrl = Fn.conditionIf(
      'anonymousUsageCondition',
      props.m2cTemplateUrlAnonymousDataYes,
      props.m2cTemplateUrlAnonymousDataNo).toString();

    new CfnStack(this, 'M2C2NestedStack', {
      templateUrl: m2CTemplateUrl,
      parameters: { ExistingGreengrassGroupID: m2cExistingGreengrassGroupID.valueAsString, ExistingKinesisStreamName: realTimeProcessing.streamName }
    }).cfnOptions.condition = deployM2CCondition;

    new CfnOutput(this, 'DashboardUrl', { description: `${props.solutionDisplayName} Dashboard`, value: `https://${frontEnd.websiteDistributionDomainName}` });
    new CfnOutput(this, 'StreamName', { description: 'Name of the Kinesis Stream that is the source of the machine data', value: realTimeProcessing.streamName });
    new CfnOutput(this, 'RawDataBucket', { description: 'S3 bucket that will hold all raw data that was sent through the Kinesis Stream', value: realTimeProcessing.rawDataBucketName });
    new CfnOutput(this, 'ParquetOutputBucket', { description: 'S3 bucket that will hold parquet data converted from the raw data bucket', value: biReporting.glueBucket.bucketName });
    new CfnOutput(this, 'GlueMetadataBucket', { description: 'S3 bucket that will store Glue metadata including QuickSight manifest, CSVs, and Glue job scripts', value: biReporting.glueMetadataBucket.bucketName });
  }
}
