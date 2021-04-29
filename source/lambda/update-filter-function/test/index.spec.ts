// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ConfigType } from "../../util/gql-schema-interfaces";

// Spy on the console messages
const consoleLogSpy = jest.spyOn(console, 'log');
const consoleErrorSpy = jest.spyOn(console, 'error');

// Mock Metrics client
const mockSendAnonymousMetric = jest.fn();
const mockGetOptions = jest.fn();
jest.mock('../../util/metrics', () => {
    return {
        sendAnonymousMetric: mockSendAnonymousMetric,
        getOptions: mockGetOptions
    };
});

// Mock Lambda
const mockGetFunctionConfiguration = jest.fn();
const mockUpdateFunctionConfiguration = jest.fn();
const mockLambda = jest.fn(() => ({
    getFunctionConfiguration: mockGetFunctionConfiguration,
    updateFunctionConfiguration: mockUpdateFunctionConfiguration
}));
jest.mock('aws-sdk/clients/lambda', () => mockLambda);

describe('Error checking', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
        mockGetFunctionConfiguration.mockReset();
        mockUpdateFunctionConfiguration.mockReset();
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

    test('Pass no Records object', async () => {
        expect.assertions(5);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        await expect(lambdaFn.handler({})).resolves.not.toThrow();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('Pass no records', async () => {
        expect.assertions(5);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        await expect(lambdaFn.handler({ Records: [] })).resolves.not.toThrow();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('Empty record is ignored', async () => {
        expect.assertions(5);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        await expect(lambdaFn.handler({ Records: [{}] })).resolves.not.toThrow();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('Record from an unexpected event source is ignored', async () => {
        expect.assertions(5);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        await expect(lambdaFn.handler({ Records: [{ eventSourceARN: 'unexpected' }] })).resolves.not.toThrow();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('Config table record that is unable to be processed', async () => {
        expect.assertions(6);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        const handlerInput = {
            Records: [
                {
                    eventSourceARN: process.env.CONFIG_TABLE_STREAM_ARN
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the Config Table');
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Unable to process stream record(s)');
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('UI Reference table record that is unable to be processed', async () => {
        expect.assertions(6);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        const handlerInput = {
            Records: [
                {
                    eventSourceARN: process.env.UI_REFERENCE_TABLE_STREAM_ARN
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the UI Reference Table');
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Unable to process stream record(s)');
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('Config table - no DDB image', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        const handlerInput = {
            Records: [
                {
                    eventSourceARN: process.env.CONFIG_TABLE_STREAM_ARN,
                    dynamodb: {}
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the Config Table');
        expect(mockGetFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockUpdateFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('Config table - unknown type', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        mockGetFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Environment: {
                            Variables: {}
                        }
                    });
                }
            };
        });

        mockUpdateFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = {
            Records: [
                {
                    eventSourceARN: process.env.CONFIG_TABLE_STREAM_ARN,
                    dynamodb: {
                        NewImage: { name: { S: 'old-name' }, type: { S: 'unknown' }, machineStatus: 'UP' }
                    }
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the Config Table');
        expect(mockGetFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockUpdateFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('UI Reference table - no DDB image', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        mockGetFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Environment: {
                            Variables: {}
                        }
                    });
                }
            };
        });

        mockUpdateFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = {
            Records: [
                {
                    eventSourceARN: process.env.UI_REFERENCE_TABLE_STREAM_ARN,
                    dynamodb: {}
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the UI Reference Table');
        expect(mockGetFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockUpdateFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('UI Reference table - unknown type', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        mockSendAnonymousMetric.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = {
            Records: [
                {
                    eventSourceARN: process.env.UI_REFERENCE_TABLE_STREAM_ARN,
                    dynamodb: {
                        NewImage: { name: { S: 'old-name' }, type: { S: 'unknown' }, machineStatus: 'UP' }
                    }
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the UI Reference Table');
        expect(mockGetFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockUpdateFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('UI Reference table - no old image', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        mockSendAnonymousMetric.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = {
            Records: [
                {
                    eventSourceARN: process.env.UI_REFERENCE_TABLE_STREAM_ARN,
                    dynamodb: {
                        NewImage: { name: { S: 'old-name' }, type: { S: 'MACHINE' }, machineStatus: 'UP' }
                    }
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the UI Reference Table');
        expect(mockGetFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockUpdateFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });
});

describe('Valid Records', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
        mockGetFunctionConfiguration.mockReset();
        mockUpdateFunctionConfiguration.mockReset();
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

    test('Config table records', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        mockGetFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Environment: {
                            Variables: {
                                EnvVarOne: 'one',
                                EnvVarTwo: 'two'
                            }
                        }
                    });
                }
            };
        });

        mockUpdateFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        mockSendAnonymousMetric.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = {
            Records: [
                {
                    eventName: 'INSERT',
                    eventSourceARN: process.env.CONFIG_TABLE_STREAM_ARN,
                    dynamodb: { NewImage: { type: { S: ConfigType.MACHINE_CONFIG } } }
                },
                {
                    eventSourceARN: process.env.CONFIG_TABLE_STREAM_ARN,
                    dynamodb: { NewImage: { type: { S: ConfigType.MESSAGE_FORMAT } } }
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the Config Table');
        expect(mockGetFunctionConfiguration).toHaveBeenCalledWith({ FunctionName: process.env.FILTER_FUNCTION_NAME });
        expect(mockUpdateFunctionConfiguration).toHaveBeenCalledTimes(1);
        expect(mockSendAnonymousMetric).not.toHaveBeenCalledWith();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('Config table records - do not send metrics', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        process.env.SEND_ANONYMOUS_DATA = 'No';
        const lambdaFn = require('../index');

        mockGetFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Environment: {
                            Variables: {
                                EnvVarOne: 'one',
                                EnvVarTwo: 'two'
                            }
                        }
                    });
                }
            };
        });

        mockUpdateFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = {
            Records: [
                {
                    eventName: 'INSERT',
                    eventSourceARN: process.env.CONFIG_TABLE_STREAM_ARN,
                    dynamodb: { NewImage: { type: { S: ConfigType.MACHINE_CONFIG } } }
                },
                {
                    eventSourceARN: process.env.CONFIG_TABLE_STREAM_ARN,
                    dynamodb: { NewImage: { type: { S: ConfigType.MESSAGE_FORMAT } } }
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the Config Table');
        expect(mockGetFunctionConfiguration).toHaveBeenCalledWith({ FunctionName: process.env.FILTER_FUNCTION_NAME });
        expect(mockUpdateFunctionConfiguration).toHaveBeenCalledTimes(1);
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('Config table records - Add machine config', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        const handlerInput = {
            Records: [
                {
                    eventName: 'INSERT',
                    eventSourceARN: process.env.CONFIG_TABLE_STREAM_ARN,
                    dynamodb: { NewImage: { type: { S: ConfigType.MACHINE_CONFIG } } }
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the Config Table');
        expect(mockGetFunctionConfiguration).not.toHaveBeenCalledWith();
        expect(mockUpdateFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalledWith();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('Config table records - Modify machine config', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        mockGetFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Environment: {
                            Variables: {
                                EnvVarOne: 'one',
                                EnvVarTwo: 'two'
                            }
                        }
                    });
                }
            };
        });

        mockUpdateFunctionConfiguration.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        mockSendAnonymousMetric.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = {
            Records: [
                {
                    eventName: 'modify',
                    eventSourceARN: process.env.CONFIG_TABLE_STREAM_ARN,
                    dynamodb: {
                        NewImage: { type: { S: ConfigType.MACHINE_CONFIG } },
                        OldImage: { type: { S: ConfigType.MACHINE_CONFIG }, machineStatusTagName: { S: 'name' } }
                    }
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the Config Table');
        expect(mockGetFunctionConfiguration).toHaveBeenCalledWith({ FunctionName: process.env.FILTER_FUNCTION_NAME });
        expect(mockUpdateFunctionConfiguration).toHaveBeenCalledTimes(1);
        expect(mockSendAnonymousMetric).toHaveBeenCalledWith({
            Event: 'ConfigurationUpdated',
            MachineConfigUpdated: true,
            MessageFormatUpdated: false,
            UIMachineNameUpdated: false,
            UIReferenceMappingUpdated: false
        });
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('UI Reference table records', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        mockSendAnonymousMetric.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = {
            Records: [
                {
                    eventSourceARN: process.env.UI_REFERENCE_TABLE_STREAM_ARN,
                    dynamodb: { NewImage: { type: { S: ConfigType.UI_REFERENCE_MAPPING } } }
                },
                {
                    eventSourceARN: process.env.UI_REFERENCE_TABLE_STREAM_ARN,
                    dynamodb: {
                        NewImage: { name: { S: 'new-name' }, type: { S: 'MACHINE' } },
                        OldImage: { name: { S: 'old-name' }, type: { S: 'MACHINE' } }
                    }
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the UI Reference Table');
        expect(mockGetFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockUpdateFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockSendAnonymousMetric).toHaveBeenCalledWith({
            Event: 'ConfigurationUpdated',
            MachineConfigUpdated: false,
            MessageFormatUpdated: false,
            UIMachineNameUpdated: true,
            UIReferenceMappingUpdated: true
        });
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });

    test('UI Reference table - update only status', async () => {
        expect.assertions(7);
        mockGetOptions.mockImplementationOnce(() => { return {}; });
        const lambdaFn = require('../index');

        mockSendAnonymousMetric.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        const handlerInput = {
            Records: [
                {
                    eventSourceARN: process.env.UI_REFERENCE_TABLE_STREAM_ARN,
                    dynamodb: {
                        NewImage: { name: { S: 'old-name' }, type: { S: 'MACHINE' }, machineStatus: 'UP' },
                        OldImage: { name: { S: 'old-name' }, type: { S: 'MACHINE' }, machineStatus: 'DOWN' }
                    }
                }
            ]
        };

        await expect(lambdaFn.handler(handlerInput)).resolves.not.toThrow();
        expect(consoleLogSpy).toHaveBeenCalledWith('Handling record for update to the UI Reference Table');
        expect(mockGetFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockUpdateFunctionConfiguration).not.toHaveBeenCalled();
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(mockLambda).toHaveBeenCalledWith({});
    });
});
