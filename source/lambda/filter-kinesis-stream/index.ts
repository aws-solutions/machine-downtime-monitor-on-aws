// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IParsedMachineData, MachineDataParser } from './machine-data-parser';
import { ConfigType, IConfigItem, IUpdateReferenceDataMutationInput } from '../util/gql-schema-interfaces';
import { MachineStatus, RealTimeTableMsgType, IUIReferenceDataItem, UIReferenceDataTypes, IMachineDataMessage } from '../util/data-models';
import { updateUIReferenceItem } from './gql-mutations';
import { sendAnonymousMetric } from '../util/metrics';
import { ItemMapper, ScanItemsHandler, doBatchWriteWithItemMapper, doScanWithItemsHandler } from './data-access';
import * as DDB from 'aws-sdk/clients/dynamodb';
import moment from 'moment';

// Required for AppSync and GraphQL
import { AWSAppSyncClient, AUTH_TYPE } from 'aws-appsync';
import gql from 'graphql-tag';
require('es6-promise').polyfill();
require('isomorphic-fetch');

const { GRAPHQL_API_ENDPOINT, CONFIG_TABLE_NAME, UI_REFERENCE_TABLE_NAME, REAL_TIME_TABLE_NAME, REAL_TIME_DATA_EXPIRATION_IN_HOURS, SEND_ANONYMOUS_DATA, VERBOSE_LOGGING } = process.env;

// Available in the lambda runtime by default
const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_REGION } = process.env;

let appSyncClient: AWSAppSyncClient<any>;
let realTimeDataExpirationInHours: number;
let MACHINE_DATA_PARSER: MachineDataParser;
let UI_REFERENCE_DATA: { [key: string]: IUIReferenceDataItem };
const verboseLogging = VERBOSE_LOGGING === 'Yes';

export const handler = async (event: IHandlerInput) => {
    if (verboseLogging) {
        console.log('Received Event', JSON.stringify(event, null, 2));
    }
    await checkInitialization();

    const msgsToWrite: IMachineDataMessageToWrite[] = [];
    const newMachineIds: Set<string> = new Set();

    if (event.Records && event.Records.length > 0) {
        console.log(`Beginning to process record(s). Total number of records to process: ${event.Records.length}`);
        for (let i = 0; i < event.Records.length; i++) {
            if (verboseLogging) {
                console.log(`Processing record #${i + 1} out of ${event.Records.length} total Kinesis record(s)`);
            }
            const record = event.Records[i];

            try {
                const parsedMachineData = MACHINE_DATA_PARSER.parseData(record.kinesis.data);
                if (verboseLogging) {
                    console.log(`Record contained ${parsedMachineData.messages.length} machine data messages(s)`);
                }

                // Add any machine IDs for new machines to the Set
                parsedMachineData.messages
                    .filter(msg => !UI_REFERENCE_DATA[msg.machineId])
                    .forEach(msg => newMachineIds.add(msg.machineId));

                await updateReferenceData(parsedMachineData);

                parsedMachineData.messages.forEach(msg => {
                    if (msg.isProductionCountMsg || msg.isStatusMsg) {
                        const realTimeTableTTLExpirationTimestamp = moment.unix(msg.timestamp).add(realTimeDataExpirationInHours, 'hours').utc();
                        let msgType: RealTimeTableMsgType;
                        let msgValue: string;

                        if (msg.isProductionCountMsg) {
                            msgType = RealTimeTableMsgType.PRODUCTION_COUNT;
                            msgValue = msg.value;
                        } else {
                            msgType = RealTimeTableMsgType.STATUS;
                            if (msg.machineStatus) {
                                msgValue = msg.machineStatus;
                            }
                        }

                        if (msgType && msgValue !== undefined) {
                            msgsToWrite.push({
                                id: `${msgType}_${msg.machineId}`,
                                messageTimestamp: msg.timestamp,
                                realTimeTableTTLExpirationTimestamp: realTimeTableTTLExpirationTimestamp.unix(),
                                value: msgValue
                            });
                        }
                    }
                });
            } catch (err) {
                // Log the error
                console.error(`Error processing record #${i + 1}`);
                console.error(err);
            }
        }

        console.log('Finished processing record(s).');

        if (newMachineIds.size > 0) {
            await createMachineConfigs(newMachineIds);
        }

        if (msgsToWrite.length > 0) {
            await writeMessagesToRealTimeTable(msgsToWrite);
        }
    } else {
        console.log('No Kinesis records to process');
    }
}

/**
 * Loads the Tag Catalog and Machine Configurations. The function will only be initialized when the Lambda 
 * container is refreshed
 */
async function checkInitialization(): Promise<void> {
    try {
        if (!REAL_TIME_DATA_EXPIRATION_IN_HOURS || REAL_TIME_DATA_EXPIRATION_IN_HOURS.trim() === '') {
            throw new Error('REAL_TIME_DATA_EXPIRATION_IN_HOURS environment variable was not set');
        }

        realTimeDataExpirationInHours = parseInt(REAL_TIME_DATA_EXPIRATION_IN_HOURS.trim(), 10);

        if (!Number.isInteger(realTimeDataExpirationInHours) || realTimeDataExpirationInHours < 24) {
            throw new Error('REAL_TIME_DATA_EXPIRATION_IN_HOURS environment variable must an integer equal to or higher than 24');
        }

        if (REAL_TIME_DATA_EXPIRATION_IN_HOURS.trim() !== `${realTimeDataExpirationInHours}`) {
            throw new Error(`REAL_TIME_DATA_EXPIRATION_IN_HOURS was not parsed as expected. An integer value is expected. Value (${REAL_TIME_DATA_EXPIRATION_IN_HOURS}) was parsed into integer: ${realTimeDataExpirationInHours}`);
        }
    } catch (err) {
        // Log the actual error
        console.error(err);
        throw new Error(`Invalid value for environment variable (REAL_TIME_DATA_EXPIRATION_IN_HOURS): ${REAL_TIME_DATA_EXPIRATION_IN_HOURS}`);
    }

    if (!appSyncClient) {
        await initializeAppSyncClient();
    }

    if (!MACHINE_DATA_PARSER) {
        await loadConfiguration();
    }

    if (!UI_REFERENCE_DATA) {
        UI_REFERENCE_DATA = {};
        await loadUIReferenceData();
    }
}

async function updateReferenceData(parsedMachineData: IParsedMachineData): Promise<void> {
    if (verboseLogging) {
        console.log('parsedMachineData', JSON.stringify(parsedMachineData, null, 2));
    }
    const mutateInputs: any[] = [];

    // Update UI_REFERENCE_DATA with any machines that are not currently tracked
    const machineIdsUpdated: Set<string> = new Set();
    parsedMachineData.messages
        .filter(msg => !UI_REFERENCE_DATA[msg.machineId])
        .forEach(msg => {
            machineIdsUpdated.add(msg.machineId);

            UI_REFERENCE_DATA[msg.machineId] = {
                id: msg.machineId,
                type: UIReferenceDataTypes.MACHINE
            };
        });

    // Sort the messages so the most recent ones are at the end of the array
    parsedMachineData.messages.sort(sortByMsgTimestamp);
    const currentMachineStatus: { [key: string]: MachineStatus } = {};

    for (const msg of parsedMachineData.messages) {
        // If the message is reporting status, save the most recent status so we can 
        // compare it against the UI_REFERENCE_DATA
        if (msg.isStatusMsg && msg.machineStatus) {
            currentMachineStatus[msg.machineId] = msg.machineStatus;
        }
    }

    for (const machineId in currentMachineStatus) {
        if (UI_REFERENCE_DATA[machineId].machineStatus !== currentMachineStatus[machineId]) {
            machineIdsUpdated.add(machineId);
            UI_REFERENCE_DATA[machineId].machineStatus = currentMachineStatus[machineId];
        }
    }

    machineIdsUpdated.forEach(machineId => {
        mutateInputs.push(mapUIReferenceDataItemToUpdateMutationInput(UI_REFERENCE_DATA[machineId]));
    });

    for (const mutateInput of mutateInputs) {
        await doMutateAction(updateUIReferenceItem, mutateInput);
    }
}

export function mapUIReferenceDataItemToUpdateMutationInput(item: IUIReferenceDataItem): IUpdateReferenceDataMutationInput {
    if (!item.id) { throw new Error('ID was not supplied'); }
    if (!item.type) { throw new Error('Type was not supplied'); }

    const mutateInput: IUpdateReferenceDataMutationInput = {
        id: item.id,
        type: item.type
    };

    const expressionNames = {};
    const expressionValues = {};

    // Set the updated timestamp to the current time
    item.machineStatusUpdatedTimestamp = moment.utc().unix();

    const keys = Object.keys(item);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        if (item.hasOwnProperty(key) && key !== 'id' && key !== 'type') {
            expressionNames[`#name${i + 1}`] = key;
            expressionValues[`:val${i + 1}`] = item[key];

            if (!mutateInput.expression) {
                mutateInput.expression = `SET #name${i + 1} = :val${i + 1}`;
            } else {
                mutateInput.expression = `${mutateInput.expression}, #name${i + 1} = :val${i + 1}`;
            }
        }
    }

    mutateInput.expressionNames = JSON.stringify(expressionNames);
    mutateInput.expressionValues = JSON.stringify(expressionValues);

    return mutateInput;
}

async function initializeAppSyncClient(): Promise<void> {
    appSyncClient = await new AWSAppSyncClient({
        url: GRAPHQL_API_ENDPOINT,
        region: AWS_REGION,
        auth: {
            type: AUTH_TYPE.AWS_IAM,
            credentials: {
                accessKeyId: AWS_ACCESS_KEY_ID,
                secretAccessKey: AWS_SECRET_ACCESS_KEY,
                sessionToken: AWS_SESSION_TOKEN
            }
        },
        disableOffline: true
    }).hydrated();
}

/**
 * Retrieves current configuration from the API and loads it into memory. Configuration will include rules for how to parse
 * the incoming messages off the Kinesis Stream
 */
async function loadConfiguration(): Promise<void> {
    console.log('Creating a new MachineDataParser');
    MACHINE_DATA_PARSER = new MachineDataParser(verboseLogging);

    const scanHandler: ScanItemsHandler = (items: DDB.DocumentClient.ItemList) => {
        items.forEach((configItem: IConfigItem) => {
            switch (configItem.type) {
                case ConfigType.MESSAGE_FORMAT:
                case ConfigType.MACHINE_CONFIG:
                    if (verboseLogging) {
                        console.log('Adding config item', JSON.stringify(configItem, null, 2));
                    }

                    MACHINE_DATA_PARSER.addConfig(configItem);
                    break;
            }
        });
    };

    console.log('Loading configuration...');
    await doScanWithItemsHandler(CONFIG_TABLE_NAME, scanHandler);
    console.log('Finished loading configuration');

    if (SEND_ANONYMOUS_DATA === 'Yes') {
        await sendAnonymousMetric({
            Event: 'MachineDataParserInitialized',
            NumMachinesConfigured: MACHINE_DATA_PARSER.getNumMachineConfigs(),
            NumMessageFormatConfigs: MACHINE_DATA_PARSER.getNumMessageFormatConfigs()
        });
    }
}

async function loadUIReferenceData(): Promise<void> {
    let numMachines = 0;

    const scanHandler: ScanItemsHandler = (items: DDB.DocumentClient.ItemList) => {
        items
            .filter((item: IUIReferenceDataItem) => item.type === 'MACHINE')
            .forEach((item: IUIReferenceDataItem) => {
                UI_REFERENCE_DATA[item.id] = item;
                numMachines++;
            });
    };

    console.log('Loading UI Reference Data...');
    await doScanWithItemsHandler(UI_REFERENCE_TABLE_NAME, scanHandler);
    console.log('Finished loading UI Reference Data');

    if (SEND_ANONYMOUS_DATA === 'Yes') {
        await sendAnonymousMetric({
            Event: 'UIRefereceDataLoaded',
            NumberOfMachines: numMachines
        });
    }
}

/**
 * Takes an array of machine data messages and writes them to the real-time table in batches
 * @param messages Array of machine data messages to write to the real-time table
 */
async function writeMessagesToRealTimeTable(messages: IMachineDataMessageToWrite[]): Promise<void> {
    if(verboseLogging) {
        console.log(`${messages.length} message(s) to write to the real-time table`);
    }

    const itemMapper: ItemMapper = (msg: IMachineDataMessageToWrite) => {
        return {
            PutRequest: {
                Item: {
                    id: msg.id,
                    messageTimestamp: msg.messageTimestamp,
                    realTimeTableTTLExpirationTimestamp: msg.realTimeTableTTLExpirationTimestamp,
                    value: `${msg.value}`
                }
            }
        };
    };

    await doBatchWriteWithItemMapper(REAL_TIME_TABLE_NAME, messages, itemMapper);

    if(verboseLogging) {
        console.log('All messages written to the real-time table');
    }
}

async function doMutateAction(mutation: string, input: any) {
    if (verboseLogging) {
        console.log('Mutating...', JSON.stringify(input, null, 2));
    }

    await appSyncClient.mutate({
        fetchPolicy: 'no-cache',
        mutation: gql(mutation),
        variables: { input },
    });
}

export function sortByMsgTimestamp(a: IMachineDataMessage, b: IMachineDataMessage) {
    if (a.timestamp > b.timestamp) { return 1; }
    if (b.timestamp > a.timestamp) { return -1; }
    return 0;
}

/**
 * Creates an empty machine config item in the Config Table for each of the 
 * machine IDs passed in the newMachineIds parameter
 * @param newMachineIds A Set of Machine ID strings
 */
async function createMachineConfigs(newMachineIds: Set<string>) {
    if (verboseLogging) {
        console.log(`Adding new machine configs for ${newMachineIds.size} machine(s)`);
    }

    const itemMapper: ItemMapper = (item: string) => {
        return {
            PutRequest: {
                Item: {
                    id: item,
                    type: ConfigType.MACHINE_CONFIG
                }
            }
        };
    };

    await doBatchWriteWithItemMapper(CONFIG_TABLE_NAME, Array.from(newMachineIds), itemMapper);
    if(verboseLogging) {
        console.log('Machine configs added');
    }
}

interface IHandlerInput {
    Records: IKinesisRecord[];
}

export interface IKinesisRecord {
    kinesis: {
        kinesisSchemaVersion: string;
        partitionKey: string;
        sequenceNumber: string;
        data: string;
        approximateArrivalTimestamp: number;
    },
    eventSource: string;
    eventVersion: string;
    eventID: string;
    eventName: string;
    invokeIdentityArn: string;
    awsRegion: string;
    eventSourceARN: string;
}

interface IMachineDataMessageToWrite {
    id: string;
    messageTimestamp: number;
    realTimeTableTTLExpirationTimestamp: number;
    value: string;
}
