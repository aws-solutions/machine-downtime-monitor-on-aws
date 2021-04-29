// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct } from '@aws-cdk/core';
import { Distribution } from '@aws-cdk/aws-cloudfront';
import { Bucket } from '@aws-cdk/aws-s3';

import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';

export interface IHostingProps {
    // S3 logging bucket
    readonly s3LoggingBucket: Bucket;
}

export class Hosting extends Construct {
    public readonly websiteDistribution: Distribution;
    public readonly hostingBucket: Bucket;

    constructor(scope: Construct, id: string, props: IHostingProps) {
        super(scope, id);

        const cloudFrontToS3 = new CloudFrontToS3(this, 'DistributionToS3', {
            bucketProps: {
                serverAccessLogsBucket: props.s3LoggingBucket,
                serverAccessLogsPrefix: 'hosting-s3/'
            },
            cloudFrontDistributionProps: {
                enableLogging: true,
                logBucket: props.s3LoggingBucket,
                logFilePrefix: 'hosting-cloudfront/',
                errorResponses: [
                    { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
                    { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' }
                ]
            },
            insertHttpSecurityHeaders: false
        });
        this.websiteDistribution = cloudFrontToS3.cloudFrontWebDistribution;
        this.hostingBucket = cloudFrontToS3.s3Bucket!;
    }
}
