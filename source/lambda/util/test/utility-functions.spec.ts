// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { objectHasRequiredProperties, stringToInt } from '../utility-functions';

// Spy on the console messages
const consoleLogSpy = jest.spyOn(console, 'log');
const consoleErrorSpy = jest.spyOn(console, 'error');

describe('objectHasRequiredProperties', () => {
    beforeEach(() => {
        jest.resetModules();
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('All required properties present', () => {
        expect.assertions(1);
        const requiredProperties = ['one', 'two', 'three'];
        const testObj = { one: 1, two: 'two', three: ' 3' };

        expect(objectHasRequiredProperties(testObj, requiredProperties, true)).toBe(true);
    });

    test('Missing property', () => {
        expect.assertions(2);
        const requiredProperties = ['one', 'two', 'three'];
        const testObj = { one: 1, two: 'two' };

        expect(objectHasRequiredProperties(testObj, requiredProperties, true)).toBe(false);
        expect(consoleLogSpy).toHaveBeenCalledWith('Missing required property: three');
    });

    test('Property is null', () => {
        expect.assertions(2);
        const requiredProperties = ['one', 'two', 'three'];
        const testObj = { one: 1, two: 'two', three: null };

        expect(objectHasRequiredProperties(testObj, requiredProperties, true)).toBe(false);
        expect(consoleLogSpy).toHaveBeenCalledWith('Missing required property: three');
    });

    test('Property is undefined', () => {
        expect.assertions(2);
        const requiredProperties = ['one', 'two', 'three'];
        const testObj = { one: 1, two: 'two', three: undefined };

        expect(objectHasRequiredProperties(testObj, requiredProperties, true)).toBe(false);
        expect(consoleLogSpy).toHaveBeenCalledWith('Missing required property: three');
    });

    test('Property is whitespace', () => {
        expect.assertions(2);
        const requiredProperties = ['one', 'two', 'three'];
        const testObj = { one: 1, two: 'two', three: ' ' };

        expect(objectHasRequiredProperties(testObj, requiredProperties, true)).toBe(false);
        expect(consoleLogSpy).toHaveBeenCalledWith('Required property (three) is empty');
    });
});

describe('stringToInt', () => {
    beforeEach(() => {
        jest.resetModules();
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('Expected input is parsed correctly', () => {
        expect.assertions(1);

        expect(stringToInt('5', 1)).toEqual(5);
    });

    test('Empty string throws error', () => {
        expect.assertions(1);

        try {
            stringToInt('', 1);
        } catch (err) {
            expect(err.message).toBe('A value was not supplied for this string');
        }
    });

    test('Whitespace string throws error', () => {
        expect.assertions(1);

        try {
            stringToInt('  ', 1);
        } catch (err) {
            expect(err.message).toBe('A value was not supplied for this string');
        }
    });

    test('Non-integer string throws error', () => {
        expect.assertions(1);

        try {
            stringToInt('non-integer');
        } catch (err) {
            expect(err.message).toBe('String must be an integer');
        }
    });

    test('Ambiguous string throws error', () => {
        expect.assertions(1);

        try {
            stringToInt('11 1');
        } catch (err) {
            expect(err.message).toBe('String was not parsed as expected. An integer value is expected. Value (11 1) was parsed into integer: 11');
        }
    });

    test('Integer below minimum value throws error', () => {
        expect.assertions(1);

        try {
            stringToInt('11', 15);
        } catch (err) {
            expect(err.message).toBe('String must be an integer equal to or higher than 15');
        }
    });
});
