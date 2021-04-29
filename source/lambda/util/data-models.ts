// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export interface IMachineDataMessage {
    machineId: string;
    attributeName: string;
    value: any;
    timestamp: number;
    isStatusMsg: boolean;
    isProductionCountMsg: boolean;
    machineStatus?: MachineStatus;
}

export interface IUIReferenceDataItem {
    id: string;
    type: UIReferenceDataTypes;
    name?: string;
    machineStatus?: string;
    machineStatusUpdatedTimestamp?: number;
}

export interface IUIReferenceDataMachine extends IUIReferenceDataItem {
    type: UIReferenceDataTypes.MACHINE;
    name?: string;
    machineStatus?: MachineStatus;
}

export enum MachineStatus {
    UP = 'UP',
    DOWN = 'DOWN',
    IDLE = 'IDLE',
    UNKNOWN = 'UNKNOWN'
}

export enum RealTimeTableMsgType {
    STATUS = 'STATUS',
    PRODUCTION_COUNT = 'PRODUCTION_COUNT'
}

export enum UIReferenceDataTypes {
    LOCATION = 'LOCATION',
    LINE = 'LINE',
    MACHINE = 'MACHINE'
}