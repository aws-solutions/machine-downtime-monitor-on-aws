// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IParsedMachineData, MachineDataParser } from '../machine-data-parser';
import { IMachineConfigItem, IMessageFormatConfigItem, IUIReferenceMappingConfigItem, ConfigType } from '../../util/gql-schema-interfaces';
import { MachineStatus } from '../../util/data-models';

const validConfigItems: { [key: string]: IMachineConfigItem | IMessageFormatConfigItem | IUIReferenceMappingConfigItem } = {
    [ConfigType.MACHINE_CONFIG]: {
        id: 'site/area/process/machine',
        type: ConfigType.MACHINE_CONFIG,
        machineProductionCountTagName: 'pc',
        machineStatusDownValue: 'd',
        machineStatusUpValue: 'u',
        machineStatusIdleValue: 'i',
        machineStatusTagName: 'status'
    },
    [ConfigType.MESSAGE_FORMAT]: {
        id: 'id',
        type: ConfigType.MESSAGE_FORMAT,
        msgFormatDataAliasDelimiter: '/',
        msgFormatDataMessageAliasKeyName: 'akn',
        msgFormatDataMessageQualityKeyName: 'qkn',
        msgFormatDataMessageTimestampFormat: 'YYYY-MM-DD HH:mm:ss.SSSSSSZZ',
        msgFormatDataMessageTimestampKeyName: 'tkn',
        msgFormatDataMessageValueKeyName: 'vkn',
        msgFormatDataMessagesKeyName: 'mkn'
    },
    [ConfigType.UI_REFERENCE_MAPPING]: {
        id: 'id',
        type: ConfigType.UI_REFERENCE_MAPPING,
        uiReferenceMappingLineKeys: 'lk',
        uiReferenceMappingLocationKeys: 'lk'
    }
};

// Spy on the console messages
const consoleLogSpy = jest.spyOn(console, 'log');
const consoleErrorSpy = jest.spyOn(console, 'error');

describe('Invalid ConfigItems', () => {
    beforeEach(() => {
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    test(`Invalid ConfigType: ${ConfigType.MACHINE_CONFIG}. Status tag name all whitespace`, async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);

        function testCall() {
            // Add invalid config
            const badCfg: IMachineConfigItem = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MACHINE_CONFIG])) as IMachineConfigItem;
            badCfg.machineStatusTagName = ' ';
            mdp.addConfig(badCfg);
        }

        expect(testCall).not.toThrow();
    });

    test(`Invalid ConfigType: ${ConfigType.MACHINE_CONFIG}. Did not pass status values`, async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);

        // Add invalid config
        const badCfg: IMachineConfigItem = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MACHINE_CONFIG])) as IMachineConfigItem;
        delete badCfg.machineStatusDownValue;
        delete badCfg.machineStatusUpValue;
        badCfg.machineStatusIdleValue = ' ';
        mdp.addConfig(badCfg);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Unable to validate config item: ', JSON.stringify(badCfg, null, 2));
    });

    test(`Invalid ConfigType: ${ConfigType.MESSAGE_FORMAT}`, async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);

        // Add invalid config
        const badCfg: IMessageFormatConfigItem = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT])) as IMessageFormatConfigItem;
        badCfg.msgFormatDataAliasDelimiter = '';
        mdp.addConfig(badCfg);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Unable to validate config item: ', JSON.stringify(badCfg, null, 2));
    });

    test(`Invalid ConfigType: ${ConfigType.UI_REFERENCE_MAPPING}`, async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);

        mdp.addConfig(validConfigItems[ConfigType.UI_REFERENCE_MAPPING]);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Unable to validate config item: ', JSON.stringify(validConfigItems[ConfigType.UI_REFERENCE_MAPPING], null, 2));
    });
});

describe('Valid ConfigItems', () => {
    beforeEach(() => {
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    test(`Valid ConfigType: ${ConfigType.MACHINE_CONFIG}`, async () => {
        expect.assertions(2);

        const mdp = new MachineDataParser(false);

        function testCall() {
            mdp.addConfig(validConfigItems[ConfigType.MACHINE_CONFIG]);
        }

        expect(testCall).not.toThrow();
        expect(mdp.getNumMachineConfigs()).toBe(1);
    });

    test(`Valid ConfigType: ${ConfigType.MESSAGE_FORMAT}`, async () => {
        expect.assertions(2);

        const mdp = new MachineDataParser(false);

        function testCall() {
            mdp.addConfig(validConfigItems[ConfigType.MESSAGE_FORMAT]);
        }

        expect(testCall).not.toThrow();
        expect(mdp.getNumMessageFormatConfigs()).toBe(1);
    });
});

describe('Parse data', () => {
    beforeEach(() => {
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    const validRecord = {
        mkn: [{
            akn: 'site/area/process/machine/status',
            qkn: 'GOOD',
            tkn: '2021-03-05 18:16:10.517000+00:00',
            vkn: 'u'
        }]
    };

    test('Valid message', async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);
        mdp.addConfig(validConfigItems[ConfigType.MESSAGE_FORMAT]);

        function testCall() {
            mdp.parseData(Buffer.from(JSON.stringify(validRecord)).toString('base64'));
        }

        expect(testCall).not.toThrow();
    });

    test('Invalid base64 encoded data', async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);

        function testCall() {
            // Parse data that is not base64 encoded
            mdp.parseData('foo');
        }

        expect(testCall).toThrowError(new Error('Unable to decode data'));
    });

    test('Non-JSON data', async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);

        function testCall() {
            // Non-json
            mdp.parseData(Buffer.from('not json').toString('base64'));
        }

        expect(testCall).toThrowError(new Error('Unable to decode data'));
    });

    test('No message format configs', async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);

        function testCall() {
            mdp.parseData(Buffer.from('{}').toString('base64'));
        }

        expect(testCall).toThrowError(new Error('Unable to parse the record. Did not find a matching message format configuration'));
    });

    test('No matching message format configs', async () => {
        type TestFunction = () => void;
        const testFunctions: TestFunction[] = [];

        testFunctions.push(() => { mdp.parseData(Buffer.from('{}').toString('base64')); });

        testFunctions.push(() => {
            // messages key is not an array
            mdp.parseData(Buffer.from(JSON.stringify({
                mkn: 'foo'
            })).toString('base64'));
        });

        testFunctions.push(() => {
            // alias is only whitespace / empty
            const aValidRecord = JSON.parse(JSON.stringify(validRecord));
            aValidRecord.mkn[0].akn = ' ';
            mdp.parseData(Buffer.from(JSON.stringify(aValidRecord)).toString('base64'));
        });

        testFunctions.push(() => {
            // Alias is undefined
            const aValidRecord = JSON.parse(JSON.stringify(validRecord));
            delete aValidRecord.mkn[0].akn;
            mdp.parseData(Buffer.from(JSON.stringify(aValidRecord)).toString('base64'));
        });

        testFunctions.push(() => {
            // Alias is null
            const aValidRecord = JSON.parse(JSON.stringify(validRecord));
            aValidRecord.mkn[0].akn = null;
            mdp.parseData(Buffer.from(JSON.stringify(aValidRecord)).toString('base64'));
        });

        testFunctions.push(() => {
            // Timestamp does not match format in config
            const aValidRecord = JSON.parse(JSON.stringify(validRecord));
            aValidRecord.mkn[0].tkn = '2021-03-05 18:16:10.517000';
            mdp.parseData(Buffer.from(JSON.stringify(aValidRecord)).toString('base64'));
        });

        testFunctions.push(() => {
            // Alias does not split into enough tokens to separate the tag from the alias
            const aValidRecord = JSON.parse(JSON.stringify(validRecord));
            aValidRecord.mkn[0].akn = 'machine-tag';
            mdp.parseData(Buffer.from(JSON.stringify(aValidRecord)).toString('base64'));
        });

        expect.assertions(testFunctions.length);

        const mdp = new MachineDataParser(false);
        mdp.addConfig(validConfigItems[ConfigType.MESSAGE_FORMAT]);

        for (const testFn of testFunctions) {
            expect(testFn).toThrowError(new Error('Unable to parse the record. Did not find a matching message format configuration'));
        }
    });

    test('Valid message - status up', async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);
        mdp.addConfig(validConfigItems[ConfigType.MESSAGE_FORMAT]);
        mdp.addConfig(validConfigItems[ConfigType.MACHINE_CONFIG]);

        const expectedResponse: IParsedMachineData = {
            messages: [{
                attributeName: 'status',
                isProductionCountMsg: false,
                isStatusMsg: true,
                machineId: 'site/area/process/machine',
                timestamp: 1614968170,
                machineStatus: MachineStatus.UP,
                value: 'u'
            }]
        };
        expect(mdp.parseData(Buffer.from(JSON.stringify(validRecord)).toString('base64'))).toStrictEqual(expectedResponse);
    });

    test('Valid message - status down', async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);
        mdp.addConfig(validConfigItems[ConfigType.MESSAGE_FORMAT]);
        mdp.addConfig(validConfigItems[ConfigType.MACHINE_CONFIG]);

        const expectedResponse: IParsedMachineData = {
            messages: [{
                attributeName: 'status',
                isProductionCountMsg: false,
                isStatusMsg: true,
                machineId: 'site/area/process/machine',
                timestamp: 1614968170,
                machineStatus: MachineStatus.DOWN,
                value: 'd'
            }]
        };

        const aValidRecord = JSON.parse(JSON.stringify(validRecord));
        aValidRecord.mkn[0].vkn = 'd';
        expect(mdp.parseData(Buffer.from(JSON.stringify(aValidRecord)).toString('base64'))).toStrictEqual(expectedResponse);
    });

    test('Valid message - status idle', async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);
        mdp.addConfig(validConfigItems[ConfigType.MESSAGE_FORMAT]);
        mdp.addConfig(validConfigItems[ConfigType.MACHINE_CONFIG]);

        const expectedResponse: IParsedMachineData = {
            messages: [{
                attributeName: 'status',
                isProductionCountMsg: false,
                isStatusMsg: true,
                machineId: 'site/area/process/machine',
                timestamp: 1614968170,
                value: 'i',
                machineStatus: MachineStatus.IDLE
            }]
        };

        const aValidRecord = JSON.parse(JSON.stringify(validRecord));
        aValidRecord.mkn[0].vkn = 'i';
        expect(mdp.parseData(Buffer.from(JSON.stringify(aValidRecord)).toString('base64'))).toStrictEqual(expectedResponse);
    });

    test('Valid message - status unknown value', async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);
        mdp.addConfig(validConfigItems[ConfigType.MESSAGE_FORMAT]);
        mdp.addConfig(validConfigItems[ConfigType.MACHINE_CONFIG]);

        const expectedResponse: IParsedMachineData = {
            messages: [{
                attributeName: 'status',
                isProductionCountMsg: false,
                isStatusMsg: true,
                machineId: 'site/area/process/machine',
                timestamp: 1614968170,
                value: '???'
            }]
        };

        const aValidRecord = JSON.parse(JSON.stringify(validRecord));
        aValidRecord.mkn[0].vkn = '???';
        expect(mdp.parseData(Buffer.from(JSON.stringify(aValidRecord)).toString('base64'))).toStrictEqual(expectedResponse);
    });

    test('Valid message - production count', async () => {
        expect.assertions(1);

        const mdp = new MachineDataParser(false);
        mdp.addConfig(validConfigItems[ConfigType.MESSAGE_FORMAT]);
        mdp.addConfig(validConfigItems[ConfigType.MACHINE_CONFIG]);

        const expectedResponse: IParsedMachineData = {
            messages: [{
                attributeName: 'pc',
                isProductionCountMsg: true,
                isStatusMsg: false,
                machineId: 'site/area/process/machine',
                timestamp: 1614968170,
                value: 3
            }]
        };

        const aValidRecord = JSON.parse(JSON.stringify(validRecord));
        aValidRecord.mkn[0].akn = 'site/area/process/machine/pc';
        aValidRecord.mkn[0].vkn = 3;
        expect(mdp.parseData(Buffer.from(JSON.stringify(aValidRecord)).toString('base64'))).toStrictEqual(expectedResponse);
    });
});