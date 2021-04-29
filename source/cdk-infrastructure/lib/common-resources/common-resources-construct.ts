// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct, RemovalPolicy } from '@aws-cdk/core';
import { BlockPublicAccess, Bucket, BucketAccessControl, BucketEncryption, CfnBucket } from '@aws-cdk/aws-s3';

export class CommonResources extends Construct {
  // S3 logging bucket
  public readonly s3LoggingBucket: Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.s3LoggingBucket = new Bucket(this, 'LogBucket', {
      accessControl: BucketAccessControl.LOG_DELIVERY_WRITE,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN
    });
    const cfnBucket = this.s3LoggingBucket.node.defaultChild as CfnBucket;
    cfnBucket.addMetadata('cfn_nag', {
      rules_to_suppress: [
        { id: 'W35', reason: 'This bucket is to store S3 logs, so it does not require access logs.' },
        { id: 'W51', reason: 'This bucket is to store S3 logs, so it does not require S3 policy.' }
      ]
    });
  }
}