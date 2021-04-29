// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export function objectHasRequiredProperties(obj: any, requiredProperties: string[], errorOnStringEmptyOrWhitespace: boolean): boolean {
    for (const requiredProperty of requiredProperties) {
        if (!obj.hasOwnProperty(requiredProperty)) {
            console.log(`Missing required property: ${requiredProperty}`);
            return false;
        }

        if (obj[requiredProperty] === null || obj[requiredProperty] === undefined) {
            console.log(`Missing required property: ${requiredProperty}`);
            return false;
        }

        if (errorOnStringEmptyOrWhitespace && typeof obj[requiredProperty] === 'string' && obj[requiredProperty].trim() === '') {
            console.log(`Required property (${requiredProperty}) is empty`);
            return false;
        }
    }

    return true;
}

export function stringToInt(strToParse: string, minValue?: number): number {
    if (!strToParse || strToParse.trim() === '') {
        throw new Error('A value was not supplied for this string');
    }

    const output = parseInt(strToParse.trim(), 10);

    if (!Number.isInteger(output)) {
        throw new Error('String must be an integer');
    }

    if (strToParse.trim() !== `${output}`) {
        throw new Error(`String was not parsed as expected. An integer value is expected. Value (${strToParse}) was parsed into integer: ${output}`);
    }

    if (minValue !== undefined && output < minValue) {
        throw new Error(`String must be an integer equal to or higher than ${minValue}`);
    }

    return output;
}
