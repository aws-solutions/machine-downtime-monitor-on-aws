// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import moment from 'moment';
import { MachineStatus } from '../../util/data-models';

// Spy on the console messages
const consoleLogSpy = jest.spyOn(console, 'log');
const consoleErrorSpy = jest.spyOn(console, 'error');

// Mock DynamoDB
const mockQuery = jest.fn();
const mockDocumentClient = jest.fn(() => ({
    query: mockQuery
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

describe('Error checking', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
        mockQuery.mockReset();
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

    test('Unexpected request type throws error', async () => {
        expect.assertions(7);

        mockGetOptions.mockImplementationOnce(() => {
            return {};
        });

        const lambdaFn = require('../machine-detail');

        try {
            await lambdaFn.handler({ info: { parentTypeName: 'RandomType' } });
        } catch (err) {
            expect(err.message).toBe('Unexpected request type: RandomType');
        }

        try {
            await lambdaFn.handler({ info: { parentTypeName: 'Query', fieldName: 'RandomFieldName' } });
        } catch (err) {
            expect(err.message).toBe('Unexpected Query type: RandomFieldName');
        }

        try {
            await lambdaFn.handler({
                info: {
                    parentTypeName: 'Query',
                    fieldName: 'getRealTimeMachineData',
                    variables: {
                        startTimestamp: 'string'
                    }
                }
            });
        } catch (err) {
            expect(err.message).toBe('startTimestamp (string) must be a valid unix timestamp');
        }

        try {
            await lambdaFn.handler({
                info: {
                    parentTypeName: 'Query',
                    fieldName: 'getRealTimeMachineData',
                    variables: {
                        startTimestamp: moment.utc().unix(),
                        endTimestamp: 'string'
                    }
                }
            });
        } catch (err) {
            expect(err.message).toBe('endTimestamp (string) must be a valid unix timestamp');
        }

        try {
            await lambdaFn.handler({
                info: {
                    parentTypeName: 'Query',
                    fieldName: 'getRealTimeMachineData',
                    variables: {
                        startTimestamp: moment.utc().unix(),
                        endTimestamp: moment.utc().unix()
                    }
                }
            });
        } catch (err) {
            expect(err.message).toBe('id was not passed');
        }

        try {
            await lambdaFn.handler({
                info: {
                    parentTypeName: 'Query',
                    fieldName: 'getRealTimeMachineData',
                    variables: {
                        id: 'machine-id',
                        startTimestamp: moment.utc().unix(),
                        endTimestamp: moment.utc().unix()
                    }
                }
            });
        } catch (err) {
            expect(err.message).toBe('incrementalRefresh was not passed');
            expect(mockDocumentClient).toHaveBeenCalledWith({});
        }
    });
});

describe('Valid request', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        jest.resetModules();
        mockQuery.mockReset();
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

    test('Test one hour lookback returns 60 chunks', async () => {
        expect.assertions(3);

        // Mock DDB Query
        mockQuery.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({ Items: [] });
                }
            };
        }).mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({ Items: [] });
                }
            };
        });

        mockGetOptions.mockImplementationOnce(() => {
            return { customUserAgent: 'AwsSolution/sol-id/sol-ver' };
        });

        process.env.SOLUTION_ID = 'sol-id';
        process.env.SOLUTION_VERSION = 'sol-ver';
        const lambdaFn = require('../machine-detail');
        const now = moment.utc();
        const oneHourAgo = now.clone().subtract(1, 'hour');

        const result = await lambdaFn.handler({
            info: {
                parentTypeName: 'Query',
                fieldName: 'getRealTimeMachineData',
                variables: {
                    id: 'machine-id',
                    incrementalRefresh: true,
                    startTimestamp: oneHourAgo.unix(),
                    endTimestamp: now.unix()
                }
            }
        });

        expect(result.dataChunks.length).toBe(60);
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(mockDocumentClient).toHaveBeenCalledWith({ customUserAgent: 'AwsSolution/sol-id/sol-ver' });
    });

    test('One minute lookback returns expected chunks', async () => {
        expect.assertions(7);
        const end = moment.utc('2021-01-01 12:00:00', 'YYYY-MM-DD HH:mm:ss', true);
        const start = end.clone().subtract(2, 'minutes');

        // Mock DDB Query
        mockQuery.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: [
                            { messageTimestamp: end.clone().subtract(90, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(80, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(70, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(60, 'seconds').unix(), value: MachineStatus.IDLE },
                            { messageTimestamp: end.clone().subtract(50, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(40, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(30, 'seconds').unix(), value: MachineStatus.DOWN },
                            { messageTimestamp: end.clone().subtract(20, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(10, 'seconds').unix(), value: MachineStatus.UP }
                        ]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: [
                            { messageTimestamp: end.clone().subtract(90, 'seconds').unix(), value: 10 },
                            { messageTimestamp: end.clone().subtract(80, 'seconds').unix(), value: 11 },
                            { messageTimestamp: end.clone().subtract(70, 'seconds').unix(), value: 12 },
                            { messageTimestamp: end.clone().subtract(60, 'seconds').unix(), value: 1 },
                            { messageTimestamp: end.clone().subtract(50, 'seconds').unix(), value: 1 },
                            { messageTimestamp: end.clone().subtract(40, 'seconds').unix(), value: 2 },
                            { messageTimestamp: end.clone().subtract(30, 'seconds').unix(), value: 3 },
                            { messageTimestamp: end.clone().subtract(20, 'seconds').unix(), value: 4 },
                            { messageTimestamp: end.clone().subtract(10, 'seconds').unix(), value: 5 }
                        ]
                    });
                }
            };
        });

        mockGetOptions.mockImplementationOnce(() => {
            return {};
        });

        process.env.SOLUTION_ID = '';
        process.env.SOLUTION_VERSION = 'sol-ver';
        const lambdaFn = require('../machine-detail');

        const result = await lambdaFn.handler({
            info: {
                parentTypeName: 'Query',
                fieldName: 'getRealTimeMachineData',
                variables: {
                    id: 'machine-id',
                    incrementalRefresh: true,
                    startTimestamp: start.unix(),
                    endTimestamp: end.unix()
                }
            }
        });

        expect(result.dataChunks.length).toBe(2);
        expect(result.dataChunks[0].statusValue).toBe(MachineStatus.IDLE);
        expect(result.dataChunks[1].statusValue).toBe(MachineStatus.DOWN);
        expect(result.dataChunks[0].productionCountValue).toBe(1);
        expect(result.dataChunks[1].productionCountValue).toBe(5);
        expect(mockSendAnonymousMetric).not.toHaveBeenCalled();
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });

    test('Metric is sent for non-incremental refresh', async () => {
        expect.assertions(7);
        const end = moment.utc('2021-01-01 12:00:00', 'YYYY-MM-DD HH:mm:ss', true);
        const start = end.clone().subtract(2, 'minutes');

        // Mock DDB Query
        mockQuery.mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: [
                            { messageTimestamp: end.clone().subtract(90, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(80, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(70, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(60, 'seconds').unix(), value: MachineStatus.IDLE },
                            { messageTimestamp: end.clone().subtract(50, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(40, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(30, 'seconds').unix(), value: MachineStatus.DOWN },
                            { messageTimestamp: end.clone().subtract(20, 'seconds').unix(), value: MachineStatus.UP },
                            { messageTimestamp: end.clone().subtract(10, 'seconds').unix(), value: MachineStatus.UP }
                        ]
                    });
                }
            };
        }).mockImplementationOnce(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Items: [
                            { messageTimestamp: end.clone().subtract(90, 'seconds').unix(), value: 10 },
                            { messageTimestamp: end.clone().subtract(80, 'seconds').unix(), value: 11 },
                            { messageTimestamp: end.clone().subtract(70, 'seconds').unix(), value: 12 },
                            { messageTimestamp: end.clone().subtract(60, 'seconds').unix(), value: 1 },
                            { messageTimestamp: end.clone().subtract(50, 'seconds').unix(), value: 1 },
                            { messageTimestamp: end.clone().subtract(40, 'seconds').unix(), value: 2 },
                            { messageTimestamp: end.clone().subtract(30, 'seconds').unix(), value: 3 },
                            { messageTimestamp: end.clone().subtract(20, 'seconds').unix(), value: 4 },
                            { messageTimestamp: end.clone().subtract(10, 'seconds').unix(), value: 5 },
                            { messageTimestamp: end.clone().add(10, 'seconds').unix(), value: 6 }
                        ]
                    });
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

        mockGetOptions.mockImplementationOnce(() => {
            return {};
        });

        process.env.SOLUTION_ID = 'sol-id';
        process.env.SOLUTION_VERSION = '  ';
        const lambdaFn = require('../machine-detail');

        const result = await lambdaFn.handler({
            info: {
                parentTypeName: 'Query',
                fieldName: 'getRealTimeMachineData',
                variables: {
                    id: 'machine-id',
                    incrementalRefresh: false,
                    startTimestamp: start.unix(),
                    endTimestamp: end.unix()
                }
            }
        });

        expect(result.dataChunks.length).toBe(2);
        expect(result.dataChunks[0].statusValue).toBe(MachineStatus.IDLE);
        expect(result.dataChunks[1].statusValue).toBe(MachineStatus.DOWN);
        expect(result.dataChunks[0].productionCountValue).toBe(1);
        expect(result.dataChunks[1].productionCountValue).toBe(5);
        expect(mockSendAnonymousMetric).toHaveBeenCalledWith({ Event: 'MachineDetailPageLoaded' });
        expect(mockDocumentClient).toHaveBeenCalledWith({});
    });
});
