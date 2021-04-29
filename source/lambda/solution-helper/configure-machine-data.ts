// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IConfigMachineDataRequest } from './custom-resource-utils';
import { ConfigType, IMessageFormatConfigItem, IUIReferenceMappingConfigItem } from '../util/gql-schema-interfaces';
import { getOptions } from '../util/metrics';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';
const ddbDocClient = new DocumentClient(getOptions());

export async function handleConfigureMachinieData(event: IConfigMachineDataRequest): Promise<string> {
    if (event.RequestType === 'Create') {
        if (!event.ResourceProperties.ConfigId) { throw new Error('ConfigId was not supplied'); }

        if (event.ResourceProperties.MessageFormat) {
            await putConfig(
                event.ResourceProperties.ConfigId,
                ConfigType.MESSAGE_FORMAT,
                event.ResourceProperties.ConfigTableName,
                event.ResourceProperties.MessageFormat);
        }

        if (event.ResourceProperties.UIReferenceMapping) {
            await putConfig(
                event.ResourceProperties.ConfigId,
                ConfigType.UI_REFERENCE_MAPPING,
                event.ResourceProperties.UIReferenceTableName,
                event.ResourceProperties.UIReferenceMapping);
        }
        return `${event.RequestType} completed OK`;
    } else {
        return `No action needed for ${event.RequestType}`;
    }
}

async function putConfig(id: string, type: ConfigType, TableName: string, properties: IMessageFormatConfigItem | IUIReferenceMappingConfigItem): Promise<void> {
    const putParams: DocumentClient.PutItemInput = {
        TableName,
        Item: { ...properties, id, type }
    };

    console.log('Putting config', JSON.stringify(putParams, null, 2));
    await ddbDocClient.put(putParams).promise();
    console.log('Done')
}
