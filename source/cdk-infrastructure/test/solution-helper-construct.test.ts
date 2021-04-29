// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import '@aws-cdk/assert/jest';
import { SynthUtils } from '@aws-cdk/assert';
import { CfnCondition, Stack, Fn } from '@aws-cdk/core';
import { SolutionHelper } from '../lib/solution-helper/solution-helper-construct';

test('Solution helper snapshot and variables', () => {
  // PREPARE
  const stack = new Stack();
  const anonymousDataCondition = new CfnCondition(
    stack,
    'anonymousDataCondition',
    { expression: Fn.conditionEquals('No', 'Yes') });

  // WHEN
  const solutionHelper = new SolutionHelper(stack, 'TestSolutionHelper', {
    sourceCodeBucketName: 'test-source-code-bucket',
    sourceCodeKeyPrefix: 'test-source-code-key-prefix',
    sendAnonymousData: 'Yes',
    anonymousUsageCondition: anonymousDataCondition,
    solutionVersion: 'beta',
    solutionId: 'TestSolution',
    deployM2CParameter: 'Yes'
  });

  // THEN
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  expect(solutionHelper.customResourceLambda).toBeDefined();
  expect(solutionHelper.anonymousDataUUID).toBeDefined();
  expect(solutionHelper.lowerCaseStackName).toBeDefined();
});
