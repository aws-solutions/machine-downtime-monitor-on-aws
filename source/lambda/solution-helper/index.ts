// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import {
    ICustomResourceRequest, ILambdaContext, ICompletionStatus,
    IConfigUIRequest, IConfigMachineDataRequest,
    IGenerateUUIDRequest, ISolutionLifecycleMetricRequest, IConfigETLRequest,
    ICreateQuickSightRequest, CustomResourceActions, StatusTypes,
} from './custom-resource-utils';
import { handleConfigureUI } from './configure-ui';
import { handleConfigureMachinieData } from './configure-machine-data';
import { handleGenerateSolutionConstants } from './generate-solution-constatns';
import { handleSolutionLifecycleMetric } from './solution-lifecycle-metric';
import { handleEtlConfiguration } from './configure-etl';
import { handleQuickSightResourceCreation } from './create-quicksight';

exports.handler = async (event: ICustomResourceRequest, context: ILambdaContext) => {
    console.log('Received Event', JSON.stringify(event, null, 2));

    const completionStatus: ICompletionStatus = {
        Status: StatusTypes.Success,
        Data: {}
    };

    try {
        if (!event.ResourceProperties.Action) {
            throw new Error('Custom Resource Action was not supplied');
        }

        switch (event.ResourceProperties.Action) {
            case CustomResourceActions.CONFIGURE_UI:
                completionStatus.Data.Message = await handleConfigureUI(event as IConfigUIRequest);
                break;
            case CustomResourceActions.CONFIGURE_MACHINE_DATA:
                completionStatus.Data.Message = await handleConfigureMachinieData(event as IConfigMachineDataRequest);
                break;
            case CustomResourceActions.GENERATE_SOLUTION_CONSTANTS:
                const handlerOutput = handleGenerateSolutionConstants(event as IGenerateUUIDRequest);
                if (!handlerOutput.anonymousUUID) {
                    completionStatus.Data.Message = `No action needed for ${event.ResourceProperties.Action}`;
                } else {
                    completionStatus.Data.AnonymousDataUUID = handlerOutput.anonymousUUID;
                    completionStatus.Data.LowerCaseStackName = handlerOutput.lowerCaseStackName;
                }
                break;
            case CustomResourceActions.SOLUTION_LIFECYCLE:
                completionStatus.Data.Message = await handleSolutionLifecycleMetric(event as ISolutionLifecycleMetricRequest);
                break;
            case CustomResourceActions.CONFIGURE_ETL:
                completionStatus.Data.Message = await handleEtlConfiguration(event as IConfigETLRequest);
                break;
            case CustomResourceActions.CREATE_QUICKSIGHT:
                completionStatus.Data.Message = await handleQuickSightResourceCreation(event as ICreateQuickSightRequest);
                break;
            default:
                throw new Error(`Unknown Custom Resource Action: ${event.ResourceProperties.Action}`);
        }
    } catch (err) {
        console.error(err);
        completionStatus.Data.Error = err.message;
        completionStatus.Status = StatusTypes.Failed;
    }

    const cfnResponse = await respondToCloudFormation(event, context.logStreamName, completionStatus);
    console.log(`CloudFormation Response: ${cfnResponse.statusText} (${cfnResponse.status})`);

    return completionStatus;
}

async function respondToCloudFormation(event: ICustomResourceRequest, logStreamName: string, completionStatus: ICompletionStatus): Promise<AxiosResponse> {
    const responseBody = JSON.stringify({
        Status: completionStatus.Status.toString(),
        Reason: `See the details in CloudWatch Log Stream: ${logStreamName}`,
        PhysicalResourceId: event.LogicalResourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: completionStatus.Data,
    });

    const config: AxiosRequestConfig = {
        headers: {
            'content-type': '',
            'content-length': responseBody.length
        }
    };

    console.log('Responding to CloudFormation', responseBody);
    return await axios.put(event.ResponseURL, responseBody, config);
}
