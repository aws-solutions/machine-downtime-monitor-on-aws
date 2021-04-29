// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { sendAnonymousMetric, getOptions } from '../util/metrics';
import { ConfigType } from '../util/gql-schema-interfaces'
import Lambda from 'aws-sdk/clients/lambda';
const lambda = new Lambda(getOptions());

const { FILTER_FUNCTION_NAME, CONFIG_TABLE_STREAM_ARN, UI_REFERENCE_TABLE_STREAM_ARN, SEND_ANONYMOUS_DATA } = process.env;

exports.handler = async (event: IStreamEventInput) => {
    try {
        let shouldUpdateFilterFn = false;
        let messageFormatUpdated = false;
        let machineConfigUpdated = false;
        let uiReferenceMappingUpdated = false;
        let uiMachineNameUpdated = false;

        if (event.Records && event.Records.length > 0) {
            for (const record of event.Records) {
                if (record.eventSourceARN === CONFIG_TABLE_STREAM_ARN) {
                    console.log('Handling record for update to the Config Table');
                    if (record.dynamodb.NewImage) {
                        if (record.dynamodb.NewImage.type.S === ConfigType.MESSAGE_FORMAT) {
                            shouldUpdateFilterFn = true;
                            messageFormatUpdated = true;
                        } else if (record.dynamodb.NewImage.type.S === ConfigType.MACHINE_CONFIG) {
                            if (record.eventName.toUpperCase() === 'MODIFY') {
                                shouldUpdateFilterFn = true;
                                machineConfigUpdated = true;
                            }
                        }
                    }
                } else if (record.eventSourceARN === UI_REFERENCE_TABLE_STREAM_ARN) {
                    console.log('Handling record for update to the UI Reference Table');
                    if (record.dynamodb.NewImage) {
                        if (record.dynamodb.NewImage.type.S === ConfigType.UI_REFERENCE_MAPPING) {
                            uiReferenceMappingUpdated = true;
                        } else if (record.dynamodb.NewImage.type.S === 'MACHINE') {
                            if (record.dynamodb.OldImage && record.dynamodb.OldImage.name) {
                                if (record.dynamodb.OldImage.name.S !== record.dynamodb.NewImage.name.S) {
                                    uiMachineNameUpdated = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (shouldUpdateFilterFn) {
            await updateFilterFunction();
        }

        if (SEND_ANONYMOUS_DATA === 'Yes') {
            if (messageFormatUpdated || machineConfigUpdated || uiReferenceMappingUpdated || uiMachineNameUpdated) {
                await sendAnonymousMetric({
                    Event: 'ConfigurationUpdated',
                    MessageFormatUpdated: messageFormatUpdated,
                    MachineConfigUpdated: machineConfigUpdated,
                    UIReferenceMappingUpdated: uiReferenceMappingUpdated,
                    UIMachineNameUpdated: uiMachineNameUpdated
                });
            }
        }
    } catch (err) {
        console.error('Unable to process stream record(s)');
        console.error(err);
    }
}

async function updateFilterFunction(): Promise<void> {
    const getParams: Lambda.GetFunctionConfigurationRequest = { FunctionName: FILTER_FUNCTION_NAME };
    const getResponse = await lambda.getFunctionConfiguration(getParams).promise();

    const updateParams: Lambda.UpdateFunctionConfigurationRequest = {
        FunctionName: FILTER_FUNCTION_NAME,
        Environment: {
            Variables: Object.assign(getResponse.Environment.Variables, { CONFIG_UPDATED_AT: `${new Date().getTime()}` })
        }
    };

    await lambda.updateFunctionConfiguration(updateParams).promise();
}

interface IStreamRecord {
    eventName: string;
    eventSourceARN: string;
    dynamodb: {
        OldImage?: {
            type: { S: string; }
            name?: { S: string; }
        },
        NewImage?: {
            type: { S: string; }
            name?: { S: string; }
        }
    }
}

interface IStreamEventInput {
    Records: IStreamRecord[]
}
