// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import '@aws-cdk/assert';
import { SynthUtils } from '@aws-cdk/assert';
import { App } from '@aws-cdk/core';
import { MachineDowntimeMonitorOnAwsStack, IMachineDowntimeMonitorOnAwsStackProps } from '../lib/machine-downtime-monitor-on-aws-stack';

const testProps: IMachineDowntimeMonitorOnAwsStackProps = {
  description: 'TEST_DESCRIPTION',
  solutionId: 'TEST_SOLUTION_ID',
  solutionName: 'TEST_SOLUTION_NAME',
  solutionDisplayName: 'TEST_SOLUTION_DISPLAY_NAME',
  solutionVersion: 'TEST_SOLUTION_VERSION',
  solutionAssetHostingBucketNamePrefix: 'TEST_BUCKET_PREFIX',
  quickSightTemplate: 'TEST_QUICKSIGHT_TEMPLATE',
  m2cTemplateUrlAnonymousDataYes: 'https://url/machine-to-cloud-connectivity-framework.template',
  m2cTemplateUrlAnonymousDataNo: 'https://url/machine-to-cloud-connectivity-framework-metrics-off.template'
};

test('Machine Downtime Monitor on AWS stack snapshot test', () => {
  const app = new App();
  // WHEN
  const stack = new MachineDowntimeMonitorOnAwsStack(app, 'MyTestStack', testProps);
  // THEN
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});
