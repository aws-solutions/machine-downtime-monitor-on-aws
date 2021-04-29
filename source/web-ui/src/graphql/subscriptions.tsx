// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IReferenceDataItem } from '../util/data-structures'

export const onUpdateUIReferenceItem = `subscription OnUpdateUIReferenceItem {
    onUpdateUIReferenceItem {
        id
        type      
        name
        machineStatus
        machineStatusUpdatedTimestamp
        uiReferenceMappingLineKeys
        uiReferenceMappingLocationKeys
    }
  }`;

export interface IOnUpdateUIReferenceItemResponse {
    provider: any;
    value: {
        data: {
            onUpdateUIReferenceItem: IReferenceDataItem;
        }
    }
}