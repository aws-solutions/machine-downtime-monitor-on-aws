// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { UIReferenceDataTypes } from './data-models';

export interface IConfigItem {
    id: string;
    type: ConfigType;
}

export interface IMessageFormatConfigItem extends IConfigItem {
    msgFormatDataAliasDelimiter: string;
    msgFormatDataMessagesKeyName: string;
    msgFormatDataMessageTimestampFormat: string;
    msgFormatDataMessageTimestampKeyName: string;
    msgFormatDataMessageValueKeyName: string;
    msgFormatDataMessageAliasKeyName: string;
    msgFormatDataMessageQualityKeyName: string;
}

export interface IUIReferenceMappingConfigItem extends IConfigItem {
    uiReferenceMappingLocationKeys: string;
    uiReferenceMappingLineKeys: string;
}

export interface IMachineConfigItem extends IConfigItem {
    machineProductionCountTagName: string;
    machineStatusTagName: string;
    machineStatusUpValue: string;
    machineStatusDownValue: string;
    machineStatusIdleValue: string;
}

export enum ConfigType {
    MESSAGE_FORMAT = 'MESSAGE_FORMAT',
    MACHINE_CONFIG = 'MACHINE_CONFIG',
    UI_REFERENCE_MAPPING = 'UI_REFERENCE_MAPPING'
}

export interface IUpdateReferenceDataMutationInput {
    id: string;
    type: UIReferenceDataTypes;
    expression?: string;
    expressionNames?: string;
    expressionValues?: string;
}