// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export const updateUIReferenceItem = `mutation UpdateUIReferenceItem($input: UpdateUIReferenceItemInput) {
    updateUIReferenceItem(input: $input){
        id
        type      
        name
        machineStatus
        machineStatusUpdatedTimestamp
    }
}`;
