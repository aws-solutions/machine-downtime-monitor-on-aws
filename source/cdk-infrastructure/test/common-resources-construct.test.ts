// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import '@aws-cdk/assert/jest';
import { SynthUtils } from '@aws-cdk/assert';
import { Stack } from '@aws-cdk/core';
import { CommonResources } from '../lib/common-resources/common-resources-construct';

test('Common resources snapshot and variables', () => {
  // PREPARE
  const stack = new Stack();

  // WHEN
  const commonResources = new CommonResources(stack, 'TestCommonResources');

  // THEN
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  expect(commonResources.s3LoggingBucket).toBeDefined();
  expect(stack).toHaveResourceLike('AWS::S3::Bucket', {
    AccessControl: 'LogDeliveryWrite',
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [{
        ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' }
      }]
    },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true
    }
  });
});