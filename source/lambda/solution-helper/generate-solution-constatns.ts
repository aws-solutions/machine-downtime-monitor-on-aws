// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IGenerateUUIDRequest } from './custom-resource-utils';
import { v4 as uuidV4 } from 'uuid';

interface HandlerOutput {
    anonymousUUID?: string;
    lowerCaseStackName?: string;
}
export function handleGenerateSolutionConstants(event: IGenerateUUIDRequest): HandlerOutput {
    if (event.RequestType === 'Create') {
        return {
            anonymousUUID: uuidV4(),
            lowerCaseStackName: process.env.STACK_NAME.toLowerCase()
        };
    }

    return {};
}
