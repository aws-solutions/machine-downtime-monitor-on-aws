// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IReferenceDataItem, IConfigItem } from '../util/data-structures';

export const getUIReferenceItems = `query GetUIReferenceItems {
    getUIReferenceItems {
        id
        type      
        name
        machineStatus
        machineStatusUpdatedTimestamp
        uiReferenceMappingLineKeys
        uiReferenceMappingLocationKeys
    }
}`;

export interface IGetUIReferenceItemsResponse {
    data: {
        getUIReferenceItems: IReferenceDataItem[]
    }
}

export const getConfigItem = `query GetConfigItem($input: GetConfigItemInput!) {
    getConfigItem(input: $input){
        id
        type
        machineProductionCountTagName
        machineStatusTagName
        machineStatusUpValue
        machineStatusDownValue
        machineStatusIdleValue
        msgFormatDataAliasDelimiter
        msgFormatDataMessagesKeyName
        msgFormatDataMessageTimestampFormat
        msgFormatDataMessageTimestampKeyName
        msgFormatDataMessageValueKeyName
        msgFormatDataMessageAliasKeyName
        msgFormatDataMessageQualityKeyName
    }
}`;

export interface IGetConfigItemResponse {
    data: {
        getConfigItem: IConfigItem;
    }
}

export const getUIReferenceItem = `query GetUIReferenceItem($input: GetUIReferenceItemInput!) {
    getUIReferenceItem(input: $input){
        id
        type
        name
        machineStatus
        machineStatusUpdatedTimestamp
    }
}`;

export interface IGetUIReferenceItemResponse {
    data: {
        getUIReferenceItem: IReferenceDataItem;
    }
}

export const getRealTimeMachineData = `query GetRealTimeMachineData($id: ID!, $startTimestamp: Int!, $endTimestamp: Int!, $incrementalRefresh: Boolean!) {
    getRealTimeMachineData(id: $id, startTimestamp: $startTimestamp, endTimestamp: $endTimestamp, incrementalRefresh: $incrementalRefresh){
        dataChunks {
            dataAsOfUTCUnixTimestamp
            statusValue
            productionCountValue
        }
    }
}`;

export interface IGetRealTimeMachineDataReqParams {
    id: string;
    startTimestamp: number;
    endTimestamp: number;
    incrementalRefresh: boolean;
}

export interface IGetRealTimeMachineDataChunk {
    statusValue: string;
    productionCountValue: string;
    dataAsOfUTCUnixTimestamp: number;
}

export interface IGetRealTimeMachineDataResponse {
    data: {
        getRealTimeMachineData: {
            dataChunks: IGetRealTimeMachineDataChunk[];
        }
    }
}
