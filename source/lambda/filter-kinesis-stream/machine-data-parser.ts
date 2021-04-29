// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import moment from 'moment';
import { IConfigItem, IMessageFormatConfigItem, IMachineConfigItem, ConfigType } from '../util/gql-schema-interfaces';
import { IMachineDataMessage, MachineStatus } from '../util/data-models';
import { objectHasRequiredProperties } from '../util/utility-functions';

export interface IParsedMachineData {
    messages: IMachineDataMessage[];
}

export class MachineDataParser {
    private readonly messageFormatConfigs: IMessageFormatConfigItem[];
    private readonly machineConfigs: { [key: string]: IMachineConfigItem };
    private readonly _verboseLogging: boolean;

    constructor(verboseLogging: boolean) {
        this.messageFormatConfigs = [];
        this.machineConfigs = {};
        this._verboseLogging = verboseLogging;
    }

    public addConfig(configItem: IConfigItem) {
        try {
            this.validateConfigItem(configItem);

            switch (configItem.type) {
                case ConfigType.MESSAGE_FORMAT:
                    this.messageFormatConfigs.push(configItem as IMessageFormatConfigItem);
                    break;
                case ConfigType.MACHINE_CONFIG:
                    this.machineConfigs[configItem.id] = configItem as IMachineConfigItem;
                    break;
            }
        } catch (err) {
            console.error('Unable to validate config item: ', JSON.stringify(configItem, null, 2));
            console.error(err);
        }
    }

    public parseData(base64EncodedData: string): IParsedMachineData {
        let decodedData: any;
        try {
            decodedData = JSON.parse(Buffer.from(base64EncodedData, 'base64').toString());
        } catch (err) {
            // Log the specific error
            console.error(err);
            throw new Error('Unable to decode data');
        }

        const matchingMessageFormat = this.getMatchingMessageFormatConfigItem(decodedData);
        if (!matchingMessageFormat) {
            throw new Error('Unable to parse the record. Did not find a matching message format configuration');
        }

        const output: IParsedMachineData = { messages: [] };

        // Process each message in the data payload
        (decodedData[matchingMessageFormat.msgFormatDataMessagesKeyName] as any[]).forEach(msg => {
            const timestamp = moment(msg[matchingMessageFormat.msgFormatDataMessageTimestampKeyName], matchingMessageFormat.msgFormatDataMessageTimestampFormat, true);
            const splitAlias = (msg[matchingMessageFormat.msgFormatDataMessageAliasKeyName] as string).split(matchingMessageFormat.msgFormatDataAliasDelimiter);

            // The final portion of the alias is the attribute
            const attributeName = splitAlias.pop();

            // Join the rest of the alias back together and use as a unique machine ID
            const machineId = splitAlias.join(matchingMessageFormat.msgFormatDataAliasDelimiter);

            const machineConfig = this.machineConfigs[machineId];
            if (!machineConfig) {
                if (this._verboseLogging) {
                    console.log(`Did not find a machine configuration for ${machineId}`);
                }
            }

            const machineDataMsg: IMachineDataMessage = {
                timestamp: timestamp.unix(),
                attributeName,
                machineId,
                isStatusMsg: machineConfig ? (machineConfig.machineStatusTagName === attributeName) : false,
                isProductionCountMsg: machineConfig ? (machineConfig.machineProductionCountTagName === attributeName) : false,
                value: msg[matchingMessageFormat.msgFormatDataMessageValueKeyName]
            };

            // Multiple values can be configured as representing machine UP/DOWN/IDLE.
            // The dashboard will direct users to use a comma-separated list when 
            // setting multiple values.
            if (machineDataMsg.isStatusMsg) {
                if (machineConfig.machineStatusUpValue.split(',').map(item => item.trim()).includes(`${machineDataMsg.value}`)) {
                    machineDataMsg.machineStatus = MachineStatus.UP;
                } else if (machineConfig.machineStatusDownValue.split(',').map(item => item.trim()).includes(`${machineDataMsg.value}`)) {
                    machineDataMsg.machineStatus = MachineStatus.DOWN;
                } else if (machineConfig.machineStatusIdleValue.split(',').map(item => item.trim()).includes(`${machineDataMsg.value}`)) {
                    machineDataMsg.machineStatus = MachineStatus.IDLE;
                }
            }

            output.messages.push(machineDataMsg);
        });

        return output;
    }

    private getMatchingMessageFormatConfigItem(decodedData: any): IMessageFormatConfigItem {
        return this.messageFormatConfigs.find(configItem => {
            // Check if the decodedData has an array of messages
            if (!decodedData[configItem.msgFormatDataMessagesKeyName] ||
                !Array.isArray(decodedData[configItem.msgFormatDataMessagesKeyName])
            ) { return false; }

            const messagesArray = (decodedData[configItem.msgFormatDataMessagesKeyName] as any[]);
            for (const dataMsg of messagesArray) {
                // Check if the data messages the required properties
                const requiredProperties = [configItem.msgFormatDataMessageAliasKeyName,
                configItem.msgFormatDataMessageQualityKeyName,
                configItem.msgFormatDataMessageValueKeyName,
                configItem.msgFormatDataMessageTimestampKeyName];

                for (const requiredProp of requiredProperties) {
                    if (!dataMsg.hasOwnProperty(requiredProp)) {
                        return false;
                    }

                    if (dataMsg[requiredProp] === undefined || dataMsg[requiredProp] === null) {
                        return false;
                    }

                    if (typeof dataMsg[requiredProp] === 'string' && dataMsg[requiredProp].trim() === '') {
                        return false;
                    }
                }

                // Check if the timestamp format allows us to parse the date correctly
                if (!moment(dataMsg[configItem.msgFormatDataMessageTimestampKeyName], configItem.msgFormatDataMessageTimestampFormat, true).isValid()) {
                    return false;
                }

                // Verify the alias delimeter can properly split the alias value
                const splitAlias = (dataMsg[configItem.msgFormatDataMessageAliasKeyName] as string).split(configItem.msgFormatDataAliasDelimiter);

                if (splitAlias.length < 2) {
                    return false;
                }
            }

            return true;
        });
    }

    private validateConfigItem(configItem: IConfigItem): void {
        let requiredProperties: string[];

        switch (configItem.type) {
            case ConfigType.MESSAGE_FORMAT:
                requiredProperties = [
                    'msgFormatDataMessagesKeyName',
                    'msgFormatDataAliasDelimiter',
                    'msgFormatDataMessageTimestampKeyName',
                    'msgFormatDataMessageValueKeyName',
                    'msgFormatDataMessageAliasKeyName',
                    'msgFormatDataMessageQualityKeyName',
                    'msgFormatDataMessageTimestampFormat'
                ];
                break;
            case ConfigType.MACHINE_CONFIG:
                const machineConfigItem = configItem as IMachineConfigItem;
                if (machineConfigItem.machineStatusTagName && machineConfigItem.machineStatusTagName.trim() !== '') {
                    let hasStatusValue = false;
                    const statusValues = [
                        'machineStatusUpValue',
                        'machineStatusDownValue',
                        'machineStatusIdleValue'
                    ];

                    statusValues.forEach(statusValue => {
                        if (machineConfigItem[statusValue] && machineConfigItem[statusValue].trim() !== '') {
                            hasStatusValue = true;
                        }
                    });

                    if (!hasStatusValue) {
                        throw new Error('Machine config set a status tag name but no value for up/down/idle');
                    }
                }
                break;
            default:
                throw new Error(`Unexpected Config Type: ${configItem.type}`);
        }

        if (requiredProperties) {
            if (!objectHasRequiredProperties(configItem, requiredProperties, true)) {
                throw new Error('Missing required property');
            }
        }
    }

    public getNumMessageFormatConfigs(): number {
        return this.messageFormatConfigs.length;
    }

    public getNumMachineConfigs(): number {
        return Object.keys(this.machineConfigs).length;
    }
}
