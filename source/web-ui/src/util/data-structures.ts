// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export enum MachineStatus {
    UP = 'UP',
    DOWN = 'DOWN',
    IDLE = 'IDLE',
    UNKNOWN = 'UNKNOWN'
}

export enum ReferenceDataTypes {
    MACHINE = 'MACHINE',
    LOCATION = 'LOCATION',
    LINE = 'LINE',
    UI_REFERENCE_MAPPING = 'UI_REFERENCE_MAPPING'
}

export interface IReferenceDataItem {
    id: string;
    type: ReferenceDataTypes;
    name?: string;
}

export interface IMachineReferenceDataItem extends IReferenceDataItem {
    type: ReferenceDataTypes.MACHINE;
    locationId?: string;
    lineId?: string;
    machineStatus: MachineStatus;
    machineStatusUpdatedTimestamp?: number;
}

export interface ILocationReferenceDataItem extends IReferenceDataItem {
    isSelected: boolean;
}

export interface ILineReferenceDataItem extends IReferenceDataItem {
    locationId: string;
}

export interface IUIReferenceMappingItem extends IReferenceDataItem {
    uiReferenceMappingLineKeys: string;
    uiReferenceMappingLocationKeys: string;
  }

export enum ConfigType {
    MESSAGE_FORMAT = 'MESSAGE_FORMAT',
    MACHINE_CONFIG = 'MACHINE_CONFIG',
    UI_REFERENCE_MAPPING = 'UI_REFERENCE_MAPPING'
}

export interface IConfigItem {
    id: string;
    type: string;
}

export interface IMachineConfigItem extends IConfigItem {
    machineProductionCountTagName: string;
    machineStatusTagName: string;
    machineStatusUpValue: string;
    machineStatusDownValue: string;
    machineStatusIdleValue: string;
}

export interface IMessageFormatConfigItem extends IConfigItem {
    msgFormatDataAliasDelimiter: string;
    msgFormatDataMessageAliasKeyName: string;
    msgFormatDataMessageQualityKeyName: string;
    msgFormatDataMessagesKeyName: string;
    msgFormatDataMessageTimestampFormat: string;
    msgFormatDataMessageTimestampKeyName: string;
    msgFormatDataMessageValueKeyName: string;
}

export interface IRealTimeDataItem {
    id: string;
    messageTimestamp: number;
    realTimeTableTTLExpirationTimestamp?: number;
    value: string | number;
}
