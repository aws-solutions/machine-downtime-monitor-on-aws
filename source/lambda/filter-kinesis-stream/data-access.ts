// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { getOptions } from '../util/metrics';

import * as DDB from 'aws-sdk/clients/dynamodb';
const ddbDocClient = new DDB.DocumentClient(getOptions());

const BATCH_WRITE_MAX = 25;
const verboseLogging = process.env.VERBOSE_LOGGING === 'Yes';
export type ItemMapper = (item: any) => any;
export type ScanItemsHandler = (items: DDB.DocumentClient.ItemList) => void;

/**
 * Takes an array of items, maps them according to the provided mapping function and writes them in batches to the DynamoDB table
 * @param tableName The table name for which the items will be written
 * @param items An array of items to be written to the table after being passed through the itemMapper
 * @param itemMapper A function to map each item in the items array into the item that needs to be written to the table
 */
export async function doBatchWriteWithItemMapper(tableName: string, items: any[], itemMapper: ItemMapper) {
    const batchWriteParams: DDB.DocumentClient.BatchWriteItemInput = {
        RequestItems: { [tableName]: [] }
    };

    while (items.length > 0) {
        batchWriteParams.RequestItems[tableName] = items
            .splice(0, BATCH_WRITE_MAX)
            .map(msg => itemMapper(msg));

        if (verboseLogging) {
            console.log(`Writing ${batchWriteParams.RequestItems[tableName].length} item(s) to ${tableName}`);
        }
        await ddbDocClient.batchWrite(batchWriteParams).promise();
    }
}

/**
 * Scans the supplied DynamoDB table and calls the handler function to process the array of items returned
 * @param TableName The table name to be scanned
 * @param handlerFn A function that will be used to process the items returned by the scan operation
 */
export async function doScanWithItemsHandler(TableName: string, handlerFn: ScanItemsHandler): Promise<void> {
    const scanParams: DDB.DocumentClient.ScanInput = { TableName };

    do {
        console.log('Scanning...', JSON.stringify(scanParams, null, 2));
        const response = await ddbDocClient.scan(scanParams).promise();
        console.log(`Scan returned ${response.Items ? response.Items.length : 0} item(s)`);

        if (response.Items) {
            handlerFn(response.Items);
        }

        // If LastEvaluatedKey is undefined, the while loop will be exited
        scanParams.ExclusiveStartKey = response.LastEvaluatedKey;
    } while (scanParams.ExclusiveStartKey);
}
