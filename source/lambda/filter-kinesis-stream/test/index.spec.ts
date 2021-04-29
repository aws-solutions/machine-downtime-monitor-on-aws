// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IMachineConfigItem, IMessageFormatConfigItem, IUIReferenceMappingConfigItem, ConfigType } from '../../util/gql-schema-interfaces';
import { IKinesisRecord } from '../index';

// Mock AppSync
const mockMutation = jest.fn();
jest.mock('aws-appsync', () => {
    return {
        AUTH_TYPE: { AWS_IAM: 'AWS_IAM' },
        AWSAppSyncClient: jest.fn(() => ({
            hydrated: jest.fn(() => ({ mutate: mockMutation }))
        }))
    };
});

// Mock DynamoDB
const mockScan = jest.fn();
const mockBatchWrite = jest.fn();
const mockDocumentClient = jest.fn(() => ({
    scan: mockScan,
    batchWrite: mockBatchWrite
}));

jest.mock('aws-sdk/clients/dynamodb', () => {
    return {
        DocumentClient: mockDocumentClient
    };
});

// Mock Metrics client
const mockSendAnonymousMetric = jest.fn();
const mockGetOptions = jest.fn();
jest.mock('../../util/metrics', () => {
    return {
        sendAnonymousMetric: mockSendAnonymousMetric,
        getOptions: mockGetOptions
    };
});

// Spy on the console messages
const consoleLogSpy = jest.spyOn(console, 'log');
const consoleErrorSpy = jest.spyOn(console, 'error');

const validConfigItems: { [key: string]: IMachineConfigItem | IMessageFormatConfigItem | IUIReferenceMappingConfigItem } = {
    [ConfigType.MACHINE_CONFIG]: {
        id: 'site/area/process/machine',
        type: ConfigType.MACHINE_CONFIG,
        machineProductionCountTagName: 'pc',
        machineStatusDownValue: 'd, false, False, 500',
        machineStatusUpValue: 'u, true,True, 200',
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

describe('Environment variables', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
        mockMutation.mockReset();
        mockScan.mockReset();
        mockBatchWrite.mockReset();
        mockSendAnonymousMetric.mockReset();
        mockGetOptions.mockReset();
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    test('REAL_TIME_DATA_EXPIRATION_IN_HOURS not set', async () => {
        expect.assertions(3);

        mockGetOptions.mockImplementationOnce(() => { return {}; });

        try {
            delete process.env.REAL_TIME_DATA_EXPIRATION_IN_HOURS;
            const lambdaFn = require('../index');
            await lambdaFn.handler({ Records: [] });
        } catch (err) {
            expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('REAL_TIME_DATA_EXPIRATION_IN_HOURS environment variable was not set'));
            expect(err.message).toBe('Invalid value for environment variable (REAL_TIME_DATA_EXPIRATION_IN_HOURS): undefined');
            expect(mockDocumentClient).toHaveBeenCalledWith({});
        }
    });

    test('REAL_TIME_DATA_EXPIRATION_IN_HOURS input is ambiguous', async () => {
        expect.assertions(3);

        mockGetOptions.mockImplementationOnce(() => { return { customUserAgent: 'AwsSolution/id/ver' }; });

        try {
            process.env.REAL_TIME_DATA_EXPIRATION_IN_HOURS = '24 4';
            const lambdaFn = require('../index');
            await lambdaFn.handler({ Records: [] });
        } catch (err) {
            expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('REAL_TIME_DATA_EXPIRATION_IN_HOURS was not parsed as expected. An integer value is expected. Value (24 4) was parsed into integer: 24'));
            expect(err.message).toBe('Invalid value for environment variable (REAL_TIME_DATA_EXPIRATION_IN_HOURS): 24 4');
            expect(mockDocumentClient).toHaveBeenCalledWith({ customUserAgent: 'AwsSolution/id/ver' });
        }
    });

    test('REAL_TIME_DATA_EXPIRATION_IN_HOURS not integer', async () => {
        expect.assertions(3);

        mockGetOptions.mockImplementationOnce(() => { return {}; });

        try {
            process.env.REAL_TIME_DATA_EXPIRATION_IN_HOURS = '1.2';
            const lambdaFn = require('../index');
            await lambdaFn.handler({ Records: [] });
        } catch (err) {
            expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('REAL_TIME_DATA_EXPIRATION_IN_HOURS environment variable must an integer equal to or higher than 24'));
            expect(err.message).toBe('Invalid value for environment variable (REAL_TIME_DATA_EXPIRATION_IN_HOURS): 1.2');
            expect(mockDocumentClient).toHaveBeenCalledWith({});
        }
    });

    test('REAL_TIME_DATA_EXPIRATION_IN_HOURS not a number', async () => {
        expect.assertions(3);
        mockGetOptions.mockImplementationOnce(() => { return {}; });

        try {
            process.env.REAL_TIME_DATA_EXPIRATION_IN_HOURS = 'foo';
            const lambdaFn = require('../index');
            await lambdaFn.handler({ Records: [] });
        } catch (err) {
            expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('REAL_TIME_DATA_EXPIRATION_IN_HOURS environment variable must an integer equal to or higher than 24'));
            expect(err.message).toBe('Invalid value for environment variable (REAL_TIME_DATA_EXPIRATION_IN_HOURS): foo');
            expect(mockDocumentClient).toHaveBeenCalledWith({});
        }
    });

    test('REAL_TIME_DATA_EXPIRATION_IN_HOURS below minimum', async () => {
        expect.assertions(2);
        mockGetOptions.mockImplementationOnce(() => { return {}; });

        try {
            process.env.REAL_TIME_DATA_EXPIRATION_IN_HOURS = '1';
            const lambdaFn = require('../index');
            await lambdaFn.handler({ Records: [] });
        } catch (err) {
            expect(err.message).toBe('Invalid value for environment variable (REAL_TIME_DATA_EXPIRATION_IN_HOURS): 1');
            expect(mockDocumentClient).toHaveBeenCalledWith({});
        }
    });
});

describe('Function initialization', () => {
    beforeEach(() => {
        jest.resetModules();
        mockMutation.mockReset();
        mockScan.mockReset();
        mockBatchWrite.mockReset();
        mockSendAnonymousMetric.mockReset();
        mockGetOptions.mockReset();
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('No config to load', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(9);

        // Mock DDB Scan
        mockScan.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({ Items: [] });
                }
            };
        });

        await lambdaFn.handler({ Records: [] });
        expect(consoleLogSpy).toHaveBeenCalledWith('Creating a new MachineDataParser');
        expect(consoleLogSpy).toHaveBeenCalledWith('Loading configuration...');
        expect(consoleLogSpy).toHaveBeenCalledWith('Scan returned 0 item(s)');
        expect(consoleLogSpy).toHaveBeenCalledWith('Finished loading configuration');
        expect(consoleLogSpy).toHaveBeenCalledWith('Loading UI Reference Data...');
        expect(consoleLogSpy).toHaveBeenCalledWith('Scan returned 0 item(s)');
        expect(consoleLogSpy).toHaveBeenCalledWith('Finished loading UI Reference Data');
        expect(consoleLogSpy).toHaveBeenCalledWith('No Kinesis records to process');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });

    test('Unknown ConfigType is ignored', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(9);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({ Items: [{}] });
                }
            };
        }).mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({ Items: [] });
                }
            };
        });

        await lambdaFn.handler({ Records: [] });
        expect(consoleLogSpy).toHaveBeenCalledWith('Creating a new MachineDataParser');
        expect(consoleLogSpy).toHaveBeenCalledWith('Loading configuration...');
        expect(consoleLogSpy).toHaveBeenCalledWith('Scan returned 1 item(s)');
        expect(consoleLogSpy).toHaveBeenCalledWith('Finished loading configuration');
        expect(consoleLogSpy).toHaveBeenCalledWith('Loading UI Reference Data...');
        expect(consoleLogSpy).toHaveBeenCalledWith('Scan returned 0 item(s)');
        expect(consoleLogSpy).toHaveBeenCalledWith('Finished loading UI Reference Data');
        expect(consoleLogSpy).toHaveBeenCalledWith('No Kinesis records to process');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });

    test('Invalid ConfigType logs error', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(4);

        const aConfigItem = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT]));
        delete aConfigItem.msgFormatDataAliasDelimiter;

        // Mock DDB Scan
        mockScan.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: [aConfigItem]
                    });
                }
            };
        });

        await expect(lambdaFn.handler({ Records: [] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Missing required property: msgFormatDataAliasDelimiter');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Unable to validate config item: ', JSON.stringify(aConfigItem, null, 2));
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });
});

describe('Process Records', () => {
    const validDataPayload = {
        mkn: [
            {
                akn: 'site/area/process/machine/status',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 'u'
            },
            {
                akn: 'site/area/process/machine/pc',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 100
            },
            {
                akn: 'site/area/process/machine/status',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 'd'
            }
        ]
    };

    const validRecord: IKinesisRecord = {
        awsRegion: 'mock-region',
        eventID: 'event-id',
        eventName: 'event-name',
        eventSource: 'event-source',
        eventSourceARN: 'event-source-arn',
        eventVersion: 'event-version',
        invokeIdentityArn: 'invoke-identity-arn',
        kinesis: {
            approximateArrivalTimestamp: 123,
            kinesisSchemaVersion: 'schema-version',
            partitionKey: 'partition-key',
            sequenceNumber: 'sequence-number',
            data: Buffer.from(JSON.stringify(validDataPayload)).toString('base64')
        }
    };

    beforeEach(() => {
        jest.resetModules();
        mockMutation.mockReset();
        mockScan.mockReset();
        mockBatchWrite.mockReset();
        mockSendAnonymousMetric.mockReset();
        mockGetOptions.mockReset();
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('No matching message format logs error when a record is passed', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(4);

        // Mock DDB Scan
        mockScan.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: []
                    });
                }
            };
        });

        await expect(lambdaFn.handler({ Records: [validRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('Unable to parse the record. Did not find a matching message format configuration'));
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });

    test('Valid records processed successfully', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(3);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            const msgFormat = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT]));
            const machineCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MACHINE_CONFIG]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [msgFormat, machineCfg]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            const uiRefCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.UI_REFERENCE_MAPPING]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [uiRefCfg, { id: 'site/area/process/machine', type: 'MACHINE', name: 'custom-name', machineStatus: 'IDLE' }]
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        await expect(lambdaFn.handler({ Records: [validRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });

    test('Valid records; non status/production count processed successfully', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(5);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            const msgFormat = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT]));
            const machineCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MACHINE_CONFIG]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [msgFormat, machineCfg]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            const uiRefCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.UI_REFERENCE_MAPPING]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [uiRefCfg, { id: 'site/area/process/machine-1', type: 'MACHINE', name: 'custom-name' }]
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const aValidRecord = JSON.parse(JSON.stringify(validRecord));
        aValidRecord.kinesis.data = Buffer.from(JSON.stringify({
            mkn: [{
                akn: 'site/area/process/machine/another-tag',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 'u'
            }]
        })).toString('base64')

        await expect(lambdaFn.handler({ Records: [aValidRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(mockDocumentClient).toHaveBeenCalledWith({});

        await expect(lambdaFn.handler({ Records: [] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('No Kinesis records to process');
    });

    test('Valid records with unknown status processed successfully', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(3);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            const msgFormat = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT]));
            const machineCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MACHINE_CONFIG]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [msgFormat, machineCfg]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            const uiRefCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.UI_REFERENCE_MAPPING]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [uiRefCfg, { id: 'site/area/process/machine', type: 'MACHINE', name: 'custom-name', machineStatus: 'IDLE' }]
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const aValidDataPayload = JSON.parse(JSON.stringify(validDataPayload));
        // Change status value for one message
        aValidDataPayload.mkn[0].vkn = 'unknown';

        const aValidRecord = JSON.parse(JSON.stringify(validRecord));
        aValidRecord.kinesis.data = Buffer.from(JSON.stringify(aValidDataPayload)).toString('base64');

        await expect(lambdaFn.handler({ Records: [aValidRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });

    test('Valid records with status unchanged successfully', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(3);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            const msgFormat = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT]));
            const machineCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MACHINE_CONFIG]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [msgFormat, machineCfg]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            const uiRefCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.UI_REFERENCE_MAPPING]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [uiRefCfg, { id: 'site/area/process/machine', type: 'MACHINE', name: 'custom-name', machineStatus: 'IDLE' }]
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const aValidDataPayload = JSON.parse(JSON.stringify(validDataPayload));
        // Change status value for one message
        aValidDataPayload.mkn[0].vkn = 'i';
        aValidDataPayload.mkn[2].vkn = 'i';

        const aValidRecord = JSON.parse(JSON.stringify(validRecord));
        aValidRecord.kinesis.data = Buffer.from(JSON.stringify(aValidDataPayload)).toString('base64');

        await expect(lambdaFn.handler({ Records: [aValidRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });

    test('Valid record processed successfully - boolean status value', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(3);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: [validConfigItems[ConfigType.MESSAGE_FORMAT], validConfigItems[ConfigType.MACHINE_CONFIG]]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: []
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const aValidDataPayload = JSON.parse(JSON.stringify(validDataPayload));
        aValidDataPayload.mkn[0].vkn = true;
        aValidDataPayload.mkn[2].vkn = false;

        const aValidRecord = JSON.parse(JSON.stringify(validRecord));
        aValidRecord.kinesis.data = Buffer.from(JSON.stringify(aValidDataPayload)).toString('base64');

        await expect(lambdaFn.handler({ Records: [aValidRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });

    test('Valid record processed successfully - integer status value', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');
        expect.assertions(3);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: [validConfigItems[ConfigType.MESSAGE_FORMAT], validConfigItems[ConfigType.MACHINE_CONFIG]]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: []
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const aValidDataPayload = JSON.parse(JSON.stringify(validDataPayload));
        aValidDataPayload.mkn[0].vkn = 500;
        aValidDataPayload.mkn[2].vkn = 200;

        const aValidRecord = JSON.parse(JSON.stringify(validRecord));
        aValidRecord.kinesis.data = Buffer.from(JSON.stringify(aValidDataPayload)).toString('base64');

        await expect(lambdaFn.handler({ Records: [aValidRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });
});

describe('Metrics turned off', () => {
    const OLD_ENV = process.env;
    const validDataPayload = {
        mkn: [
            {
                akn: 'site/area/process/machine/status',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 'u'
            },
            {
                akn: 'site/area/process/machine/pc',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 100
            },
            {
                akn: 'site/area/process/machine/status',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 'd'
            }
        ]
    };

    const validRecord: IKinesisRecord = {
        awsRegion: 'mock-region',
        eventID: 'event-id',
        eventName: 'event-name',
        eventSource: 'event-source',
        eventSourceARN: 'event-source-arn',
        eventVersion: 'event-version',
        invokeIdentityArn: 'invoke-identity-arn',
        kinesis: {
            approximateArrivalTimestamp: 123,
            kinesisSchemaVersion: 'schema-version',
            partitionKey: 'partition-key',
            sequenceNumber: 'sequence-number',
            data: Buffer.from(JSON.stringify(validDataPayload)).toString('base64')
        }
    };

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
        mockMutation.mockReset();
        mockScan.mockReset();
        mockBatchWrite.mockReset();
        mockSendAnonymousMetric.mockReset();
        mockGetOptions.mockReset();
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    test('Valid records processed successfully', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        delete process.env.SEND_ANONYMOUS_DATA;
        const lambdaFn = require('../index');
        expect.assertions(4);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            const msgFormat = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT]));
            const machineCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MACHINE_CONFIG]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [msgFormat, machineCfg]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            const uiRefCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.UI_REFERENCE_MAPPING]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [uiRefCfg, { id: 'site/area/process/machine', type: 'MACHINE', name: 'custom-name', machineStatus: 'IDLE' }]
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        await expect(lambdaFn.handler({ Records: [validRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
    });

    test('Configs are empty arrays', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        delete process.env.SEND_ANONYMOUS_DATA;
        const lambdaFn = require('../index');
        expect.assertions(4);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: []
                    });
                }
            };
        }).mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: []
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        await expect(lambdaFn.handler({ Records: [validRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
    });

    test('Configs are not returned', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        delete process.env.SEND_ANONYMOUS_DATA;
        const lambdaFn = require('../index');
        expect.assertions(4);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        }).mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        await expect(lambdaFn.handler({ Records: [validRecord] })).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
    });
});

describe('Verbose logging', () => {
    const OLD_ENV = process.env;
    const validDataPayload = {
        mkn: [
            {
                akn: 'site/area/process/machine/status',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 'u'
            },
            {
                akn: 'site/area/process/machine/pc',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 100
            },
            {
                akn: 'site/area/process/machine/status',
                qkn: 'GOOD',
                tkn: '2021-03-05 18:16:10.517000+00:00',
                vkn: 'd'
            }
        ]
    };

    const validRecord: IKinesisRecord = {
        awsRegion: 'mock-region',
        eventID: 'event-id',
        eventName: 'event-name',
        eventSource: 'event-source',
        eventSourceARN: 'event-source-arn',
        eventVersion: 'event-version',
        invokeIdentityArn: 'invoke-identity-arn',
        kinesis: {
            approximateArrivalTimestamp: 123,
            kinesisSchemaVersion: 'schema-version',
            partitionKey: 'partition-key',
            sequenceNumber: 'sequence-number',
            data: Buffer.from(JSON.stringify(validDataPayload)).toString('base64')
        }
    };

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
        mockMutation.mockReset();
        mockScan.mockReset();
        mockBatchWrite.mockReset();
        mockSendAnonymousMetric.mockReset();
        mockGetOptions.mockReset();
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    test('Valid record processed successfully', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        process.env.VERBOSE_LOGGING = 'Yes';
        const lambdaFn = require('../index');
        expect.assertions(13);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            const msgFormat = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT]));
            const machineCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MACHINE_CONFIG]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [msgFormat, machineCfg]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            const uiRefCfg = JSON.parse(JSON.stringify(validConfigItems[ConfigType.UI_REFERENCE_MAPPING]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [uiRefCfg, { id: 'site/area/process/machine', type: 'MACHINE', name: 'custom-name', machineStatus: 'IDLE' }]
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = { Records: [validRecord] };
        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(consoleLogSpy).toHaveBeenCalledWith('Received Event', JSON.stringify(handlerInput, null, 2));
        expect(consoleLogSpy).toHaveBeenCalledWith('Processing record #1 out of 1 total Kinesis record(s)');
        expect(consoleLogSpy).toHaveBeenCalledWith('Record contained 3 machine data messages(s)');
        expect(consoleLogSpy).toHaveBeenCalledWith('parsedMachineData', JSON.stringify({
            messages: [
                {
                    timestamp: 1614968170,
                    attributeName: 'status',
                    machineId: 'site/area/process/machine',
                    isStatusMsg: true,
                    isProductionCountMsg: false,
                    value: 'u',
                    machineStatus: 'UP'
                },
                {
                    timestamp: 1614968170,
                    attributeName: 'pc',
                    machineId: 'site/area/process/machine',
                    isStatusMsg: false,
                    isProductionCountMsg: true,
                    value: 100,
                },
                {
                    timestamp: 1614968170,
                    attributeName: 'status',
                    machineId: 'site/area/process/machine',
                    isStatusMsg: true,
                    isProductionCountMsg: false,
                    value: 'd',
                    machineStatus: 'DOWN'
                }
            ]
        }, null, 2));
        expect(consoleLogSpy).toHaveBeenCalledWith('Adding config item', JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT], null, 2));
        expect(consoleLogSpy).toHaveBeenCalledWith('Adding config item', JSON.stringify(validConfigItems[ConfigType.MACHINE_CONFIG], null, 2));
        expect(consoleLogSpy).toHaveBeenCalledWith('3 message(s) to write to the real-time table');
        expect(consoleLogSpy).toHaveBeenCalledWith(`Writing 3 item(s) to ${process.env.REAL_TIME_TABLE_NAME}`);
        expect(consoleLogSpy).toHaveBeenCalledWith('All messages written to the real-time table');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('First occurence of machine', async () => {
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        process.env.VERBOSE_LOGGING = 'Yes';
        const lambdaFn = require('../index');
        expect.assertions(8);

        // Mock DDB Scan
        mockScan.mockImplementationOnce(() => {
            const msgFormat = JSON.parse(JSON.stringify(validConfigItems[ConfigType.MESSAGE_FORMAT]));

            return {
                promise() {
                    return Promise.resolve({
                        Items: [msgFormat]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: []
                    });
                }
            };
        });

        // Mock AppSync
        mockMutation.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        // Mock DDB BatchWrite
        mockBatchWrite.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = { Records: [validRecord] };
        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Beginning to process record(s). Total number of records to process: 1');
        expect(consoleLogSpy).toHaveBeenCalledWith('Received Event', JSON.stringify(handlerInput, null, 2));
        expect(consoleLogSpy).toHaveBeenCalledWith('Processing record #1 out of 1 total Kinesis record(s)');
        expect(consoleLogSpy).toHaveBeenCalledWith('Did not find a machine configuration for site/area/process/machine');
        expect(consoleLogSpy).toHaveBeenCalledWith('Adding new machine configs for 1 machine(s)');
        expect(mockDocumentClient).toHaveBeenCalledWith({});
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});

describe('mapUIReferenceDataItemToUpdateMutationInput', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
        mockMutation.mockReset();
        mockScan.mockReset();
        mockBatchWrite.mockReset();
        mockSendAnonymousMetric.mockReset();
        mockGetOptions.mockReset();
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    test('Invalid reference data item (missing ID)', () => {
        expect.assertions(1);
        const lambdaFn = require('../index');

        try {
            lambdaFn.mapUIReferenceDataItemToUpdateMutationInput({});
        } catch (err) {
            expect(err.message).toBe('ID was not supplied');
        }
    });

    test('Invalid reference data item (missing Type)', () => {
        expect.assertions(1);
        const lambdaFn = require('../index');

        try {
            lambdaFn.mapUIReferenceDataItemToUpdateMutationInput({
                id: 'id'
            });
        } catch (err) {
            expect(err.message).toBe('Type was not supplied');
        }
    });

    test('Valid reference data item', () => {
        expect.assertions(4);
        const lambdaFn = require('../index');

        const resp = lambdaFn.mapUIReferenceDataItemToUpdateMutationInput({
            id: 'id',
            type: 'MACHINE',
            name: 'machine-name',
            machineStatus: 'DOWN'
        });

        expect(resp.id).toBe('id');
        expect(resp.type).toBe('MACHINE');
        const expressionNames = JSON.parse(resp.expressionNames);
        const expressionValues = JSON.parse(resp.expressionValues);

        for (const key in expressionNames) {
            switch (expressionNames[key]) {
                case 'name':
                    expect(expressionValues[key.replace('#name', ':val')]).toBe('machine-name');
                    break;
                case 'machineStatus':
                    expect(expressionValues[key.replace('#name', ':val')]).toBe('DOWN');
                    break;
            }
        }
    });
});

describe('sortByMsgTimestamp', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
        mockMutation.mockReset();
        mockScan.mockReset();
        mockBatchWrite.mockReset();
        mockSendAnonymousMetric.mockReset();
        mockGetOptions.mockReset();
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    test('Test timestamps', () => {
        expect.assertions(3);
        const lambdaFn = require('../index');

        expect(lambdaFn.sortByMsgTimestamp({ timestamp: 1 }, { timestamp: 2 })).toBe(-1);
        expect(lambdaFn.sortByMsgTimestamp({ timestamp: 2 }, { timestamp: 1 })).toBe(1);
        expect(lambdaFn.sortByMsgTimestamp({ timestamp: 1 }, { timestamp: 1 })).toBe(0);
    });
});
