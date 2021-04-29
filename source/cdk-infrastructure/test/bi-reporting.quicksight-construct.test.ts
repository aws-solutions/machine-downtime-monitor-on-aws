// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import '@aws-cdk/assert/jest';
import { SynthUtils } from '@aws-cdk/assert';
import { CustomResource, Stack } from '@aws-cdk/core';
import { Code, Function as LambdaFunction, Runtime } from '@aws-cdk/aws-lambda';
import { Bucket } from '@aws-cdk/aws-s3';
import { QuickSightReporting } from '../lib/bi-reporting/quicksight/quicksight-construct';

test('BI reporting QuickSight snapshot and variables', () => {
  // PREPARE
  const stack = new Stack();
  const glueCustomResource = new CustomResource(stack, 'TestCustomResource', {
    serviceToken: 'test-service-token'
  });
  const sourceCodeBucket = Bucket.fromBucketName(stack, 'TestSourceBucket', 'test-bucket');
  const solutionHelperFunction = new LambdaFunction(stack, 'TestSolutionHelperFunction', {
    code: Code.fromBucket(sourceCodeBucket, 'source.zip'),
    runtime: Runtime.NODEJS_14_X,
    handler: 'index.handler'
  });

  // WHEN
  new QuickSightReporting(stack, 'TestQuickSight', {
    glueCustomResource: glueCustomResource,
    glueDatabaseName: 'test-database',
    glueTableName: 'test-table',
    metadataConfiguration: {
      bucketName: 'test-bucket',
      machineInformationPrefix: 'machine_information',
      machineConfigInformationPrefix: 'machine_config_information',
      manifestPrefix: 'manifest'
    },
    quickSightPrincipalArn: 'test-quicksight-principal-arn',
    quickSightTemplate: 'test-quicksight-template',
    solutionHelperFunction: solutionHelperFunction,
  });

  // THEN
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});