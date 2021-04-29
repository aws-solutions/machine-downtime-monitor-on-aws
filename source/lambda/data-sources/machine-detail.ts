// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { MachineStatus, RealTimeTableMsgType } from '../util/data-models';
import { sendAnonymousMetric, getOptions } from '../util/metrics';
import moment from 'moment';
import * as DDB from 'aws-sdk/clients/dynamodb';
const ddbDocClient = new DDB.DocumentClient(getOptions());

const { REAL_TIME_DATA_TABLE_NAME, SEND_ANONYMOUS_DATA } = process.env;

exports.handler = async (event: IAppSyncInput): Promise<IHandlerOutput> => {
    console.log('Received Event', JSON.stringify(event, null, 2));
    validateRequest(event);
    const endTimestamp = moment.unix(event.info.variables.endTimestamp).utc();

    const chunkStart = moment.unix(event.info.variables.startTimestamp).startOf('minute').utc();
    const chunkEnd = chunkStart.clone().add(1, 'minute').utc();
    const dataChunks: IDataChunk[] = [];

    // Pre-populate the dataChunks array with intervals for the response
    while (chunkEnd <= endTimestamp) {
        dataChunks.push({ dataAsOfUTCUnixTimestamp: chunkEnd.unix(), statusValue: MachineStatus.UNKNOWN, productionCountValue: '' });
        chunkEnd.add(1, 'minute');
    }

    // Retrieve status and production count data from the real-time data table
    const statusItems = await doQuery(RealTimeTableMsgType.STATUS, event.info.variables.id, chunkStart.unix(), chunkEnd.unix());
    const productionCountItems = await doQuery(RealTimeTableMsgType.PRODUCTION_COUNT, event.info.variables.id, chunkStart.unix(), chunkEnd.unix());

    // Each chunk represents an interval (i.e. one-minute) interval of data. Real-time data might be sent 
    // more frequently than once per minute so here, we loop through each real-time data item and retrieve 
    // the value that will represent the status for that minute interval. Takes the latest status value unless
    // the status was down at any point during that minute. In that case, the minute interval will be
    // set to DOWN
    let currentChunk = 0;
    for (const item of statusItems) {
        while (dataChunks[currentChunk] && dataChunks[currentChunk].dataAsOfUTCUnixTimestamp < item.messageTimestamp) {
            currentChunk++;
        }

        if (dataChunks[currentChunk] && dataChunks[currentChunk].statusValue !== MachineStatus.DOWN) {
            dataChunks[currentChunk].statusValue = item.value as MachineStatus;
        }
    }

    // Similar to status, here we will process real-time production count data and separate into the
    // one-minute intervals. For production count, the latest value in the current minute interval
    // is used
    currentChunk = 0;
    for (const item of productionCountItems) {
        while (dataChunks[currentChunk] && dataChunks[currentChunk].dataAsOfUTCUnixTimestamp < item.messageTimestamp) {
            currentChunk++;
        }

        if (dataChunks[currentChunk]) {
            dataChunks[currentChunk].productionCountValue = item.value;
        }
    }

    if (SEND_ANONYMOUS_DATA === 'Yes' && event.info.variables.incrementalRefresh === false) {
        await sendAnonymousMetric({ Event: 'MachineDetailPageLoaded' });
    }

    const output: IHandlerOutput = { dataChunks };
    console.log(`Returning ${output.dataChunks.length} data chunk(s)`);
    return output;
}

/**
 * Queries the Real Time Data table to retrieve historical data for the machine detail page in the dashboard
 * @param type The type of real-time data to retrieve (status or production count)
 * @param machineId The ID of the machine for which to retrieve data
 * @param startTimestamp Unix timestamp for where data retrieval should begin
 * @param endTimestamp Unix timestamp for where data retrieval should end
 * @returns Array of items retrieved from the DynamoDB table. Each item contains the message timestamp and value
 */
async function doQuery(type: RealTimeTableMsgType, machineId: string, startTimestamp: number, endTimestamp: number): Promise<IDataItem[]> {
    const output: IDataItem[] = [];

    const queryParams: DDB.DocumentClient.QueryInput = {
        TableName: REAL_TIME_DATA_TABLE_NAME,
        ProjectionExpression: '#messageTimestamp, #value',
        KeyConditionExpression: '#id = :id AND #messageTimestamp BETWEEN :startTimestamp AND :endTimestamp',
        ExpressionAttributeNames: {
            '#id': 'id',
            '#messageTimestamp': 'messageTimestamp',
            '#value': 'value'
        },
        ExpressionAttributeValues: {
            ':id': `${type === RealTimeTableMsgType.PRODUCTION_COUNT ? 'PRODUCTION_COUNT' : 'STATUS'}_${machineId}`,
            ':startTimestamp': startTimestamp,
            ':endTimestamp': endTimestamp
        }
    };

    do {
        console.log('Querying...', JSON.stringify(queryParams, null, 2));
        const response = await ddbDocClient.query(queryParams).promise();

        if (response.Items && response.Items.length > 0) {
            console.log(`Query returned ${response.Items.length} item(s)`);
            output.push(...response.Items.map(item => {
                return { messageTimestamp: item.messageTimestamp, value: item.value };
            }));
        } else {
            console.log('Query returned no items');
        }

        // If LastEvaluatedKey is undefined, the while loop will exit
        queryParams.ExclusiveStartKey = response.LastEvaluatedKey;
    } while (queryParams.ExclusiveStartKey)

    return output;
}

/**
 * Checks event parameters to ensure the request can be handled properly
 * @param event Event that was passed as input to the Lambda function
 */
function validateRequest(event: IAppSyncInput) {
    if (event.info.parentTypeName !== 'Query') {
        throw new Error(`Unexpected request type: ${event.info.parentTypeName}`);
    }

    if (event.info.fieldName !== 'getRealTimeMachineData') {
        throw new Error(`Unexpected Query type: ${event.info.fieldName}`);
    }

    if (!event.info.variables.startTimestamp || typeof event.info.variables.startTimestamp !== 'number') {
        throw new Error(`startTimestamp (${event.info.variables.startTimestamp}) must be a valid unix timestamp`);
    }

    if (!event.info.variables.endTimestamp || typeof event.info.variables.endTimestamp !== 'number') {
        throw new Error(`endTimestamp (${event.info.variables.endTimestamp}) must be a valid unix timestamp`);
    }

    if (!event.info.variables.id || event.info.variables.id.trim() === '') {
        throw new Error('id was not passed');
    }

    if (!event.info.variables.hasOwnProperty('incrementalRefresh')) {
        throw new Error('incrementalRefresh was not passed');
    }
}

/**
 * Sub-set of the input payload that will be sent when invoking this function
 */
interface IAppSyncInput {
    info: {
        fieldName: string;
        parentTypeName: string;
        variables: {
            id: string;
            startTimestamp: number;
            endTimestamp: number;
            incrementalRefresh: boolean;
        }
    }
}

/**
 * Represents an interval of data (i.e. one-minute) that will be sent in the function response
 */
interface IDataChunk {
    statusValue: MachineStatus;
    productionCountValue: string;
    dataAsOfUTCUnixTimestamp: number;
}

/**
 * Format of the Lambda function's output
 */
interface IHandlerOutput {
    dataChunks: IDataChunk[];
}

/**
 * One item from the real-time DynamoDB table. Limited to timestamp and value
 */
interface IDataItem {
    messageTimestamp: number;
    value: string;
}
