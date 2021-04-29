// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from '@aws-cdk/core';
import { IMachineDowntimeMonitorOnAwsStackProps, MachineDowntimeMonitorOnAwsStack } from '../lib/machine-downtime-monitor-on-aws-stack';

const app = new cdk.App();

new MachineDowntimeMonitorOnAwsStack(app, 'MachineDowntimeMonitorOnAwsStack', getProps());

function getProps(): IMachineDowntimeMonitorOnAwsStackProps {
    const {
        SOLUTION_BUCKET_NAME_PLACEHOLDER,
        SOLUTION_NAME_PLACEHOLDER,
        SOLUTION_VERSION_PLACEHOLDER,
        TEMPLATE_ACCOUNT_ID,
        QUICKSIGHT_NAMESPACE
    } = process.env;

    if (!SOLUTION_BUCKET_NAME_PLACEHOLDER || SOLUTION_BUCKET_NAME_PLACEHOLDER.trim() === '') {
        throw new Error('Missing required environment variable: SOLUTION_BUCKET_NAME_PLACEHOLDER');
    }

    if (!SOLUTION_NAME_PLACEHOLDER || SOLUTION_NAME_PLACEHOLDER.trim() === '') {
        throw new Error('Missing required environment variable: SOLUTION_NAME_PLACEHOLDER');
    }

    if (!SOLUTION_VERSION_PLACEHOLDER || SOLUTION_VERSION_PLACEHOLDER.trim() === '') {
        throw new Error('Missing required environment variable: SOLUTION_VERSION_PLACEHOLDER');
    }

    if (!TEMPLATE_ACCOUNT_ID || TEMPLATE_ACCOUNT_ID.trim() === '') {
        throw new Error('Missing required environment variable: TEMPLATE_ACCOUNT_ID');
    }

    if (!QUICKSIGHT_NAMESPACE || QUICKSIGHT_NAMESPACE.trim() === '') {
        throw new Error('Missing required environment variable: QUICKSIGHT_NAMESPACE');
    }

    const solutionId = 'SO0169';
    const solutionDisplayName = 'Machine Downtime Monitor on AWS';
    const solutionVersion = SOLUTION_VERSION_PLACEHOLDER;
    const solutionName = SOLUTION_NAME_PLACEHOLDER;
    const solutionAssetHostingBucketNamePrefix = SOLUTION_BUCKET_NAME_PLACEHOLDER;
    const quickSightTemplate = `arn:aws:quicksight:us-east-1:${TEMPLATE_ACCOUNT_ID}:template/${QUICKSIGHT_NAMESPACE}_${SOLUTION_NAME_PLACEHOLDER}_${SOLUTION_VERSION_PLACEHOLDER.replace(/\./g, '_')}`;
    const description = `(${solutionId}) - ${solutionDisplayName}. Version ${solutionVersion}`;
    const m2cTemplateUrlAnonymousDataYes = 'https://solutions-reference.s3.amazonaws.com/machine-to-cloud-connectivity-framework/v2.2.0/machine-to-cloud-connectivity-framework.template'
    const m2cTemplateUrlAnonymousDataNo = 'https://solutions-reference.s3.amazonaws.com/machine-to-cloud-connectivity-framework/v2.2.0/machine-to-cloud-connectivity-framework-no-metrics.template'

    return {
        description,
        solutionId,
        solutionName,
        solutionDisplayName,
        solutionVersion,
        solutionAssetHostingBucketNamePrefix,
        quickSightTemplate,
        m2cTemplateUrlAnonymousDataYes,
        m2cTemplateUrlAnonymousDataNo
    };
}
