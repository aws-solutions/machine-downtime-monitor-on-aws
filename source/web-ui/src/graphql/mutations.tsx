// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IReferenceDataItem } from '../util/data-structures'

export const updateMachineGrouping = `mutation UpdateMachineGrouping($input: UpdateMachineGroupingInput) {
    updateMachineGrouping(input: $input){
        id
        type      
        uiReferenceMappingLocationKeys
        uiReferenceMappingLineKeys
    }
}`;

export interface IUpdateMachineGroupingResponse {
    data: {
        updateMachineGrouping: IReferenceDataItem[]
    }
}

export const updateMachineConfig = `mutation UpdateMachineConfig($input: UpdateMachineConfigInput) {
    updateMachineConfig(input: $input){
        id
        type
        machineProductionCountTagName
        machineStatusTagName
        machineStatusUpValue
        machineStatusDownValue
        machineStatusIdleValue
    }
}`;

export interface IUpdateMachineConfigResponse {
    data: {
        updateMachineConfig: IReferenceDataItem[]
    }
}

export const updateMachineName = `mutation UpdateMachineName($input: UpdateMachineNameInput) {
    updateMachineName(input: $input){
        id
        type
        name
        machineStatus
        machineStatusUpdatedTimestamp
        uiReferenceMappingLocationKeys
        uiReferenceMappingLineKeys
    }
}`;

export interface IUpdateMachineNameResponse {
    data: {
        updateMachineName: IReferenceDataItem[]
    }
}
