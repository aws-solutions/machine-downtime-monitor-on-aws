// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import '@aws-cdk/assert/jest';
import { SynthUtils } from '@aws-cdk/assert';
import { Stack } from '@aws-cdk/core';
import { AttributeType, Table } from '@aws-cdk/aws-dynamodb';
import { Code, Function as LambdaFunction, Runtime } from '@aws-cdk/aws-lambda';
import { Bucket } from '@aws-cdk/aws-s3';
import { BIReporting } from '../lib/bi-reporting/bi-reporting-construct';

test('BI reporting snapshot and variables', () => {
  // PREPARE
  const stack = new Stack();
  const configTable = new Table(stack, 'TestConfigTable', {
    partitionKey: { name: 'id', type: AttributeType.STRING },
    sortKey: { name: 'type', type: AttributeType.STRING }
  });
  const s3LoggingBucket = new Bucket(stack, 'TestLoggingBucket');
  const uiReferenceTable = new Table(stack, 'TestUiReferenceTable', {
    partitionKey: { name: 'id', type: AttributeType.STRING },
    sortKey: { name: 'type', type: AttributeType.STRING }
  });
  const sourceCodeBucket = Bucket.fromBucketName(stack, 'TestSourceBucket', 'test-bucket');
  const solutionHelperFunction = new LambdaFunction(stack, 'TestSolutionHelperFunction', {
    code: Code.fromBucket(sourceCodeBucket, 'source.zip'),
    runtime: Runtime.NODEJS_14_X,
    handler: 'index.handler'
  });

  // WHEN
  const biReporting = new BIReporting(stack, 'TestBIReporting', {
    configTable,
    lowerCaseStackName: 'test-stack-name',
    quickSightPrincipalArn: 'test-quicksight-principal-arn',
    quickSightTemplate: 'test-quicksight-template',
    rawDataS3BucketName: 'test-raw-data-bucket',
    s3LoggingBucket,
    solutionHelperFunction,
    solutionId: 'TestSolution',
    solutionVersion: 'beta',
    sourceCodeBucketName: 'test-source-bucket',
    sourceCodeKeyPrefix: 'test-code-prefix',
    uiReferenceTable
  });

  // THEN
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  expect(stack).toHaveResourceLike('AWS::Glue::Database', {
    DatabaseInput: {
      Name: 'test-stack-name-database'
    }
  })
  expect(biReporting.glueBucket).toBeDefined();
  expect(biReporting.glueMetadataBucket).toBeDefined();
});