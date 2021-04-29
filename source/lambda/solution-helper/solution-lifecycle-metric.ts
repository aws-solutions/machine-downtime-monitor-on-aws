// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ISolutionLifecycleMetricRequest } from './custom-resource-utils';
import { sendAnonymousMetric } from '../util/metrics';

export async function handleSolutionLifecycleMetric(event: ISolutionLifecycleMetricRequest): Promise<string> {
    await sendAnonymousMetric({
        SolutionLifecycle: event.RequestType,
        SolutionParameters: event.ResourceProperties.SolutionParameters
    });

    return `${event.RequestType} completed OK`;
}
