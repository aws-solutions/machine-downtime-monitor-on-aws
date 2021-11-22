// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct, Duration } from '@aws-cdk/core';
import { Bucket } from '@aws-cdk/aws-s3';
import { Runtime, Code, StartingPosition } from '@aws-cdk/aws-lambda';
import { DynamoEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { GraphqlApi } from '@aws-cdk/aws-appsync';
import { Table } from '@aws-cdk/aws-dynamodb';
import { Policy, PolicyStatement, Effect, CfnPolicy } from '@aws-cdk/aws-iam';

import { KinesisStreamsToLambda } from '@aws-solutions-constructs/aws-kinesisstreams-lambda';
import { KinesisStreamsToKinesisFirehoseToS3 } from '@aws-solutions-constructs/aws-kinesisstreams-kinesisfirehose-s3';
import { DynamoDBStreamToLambda } from '@aws-solutions-constructs/aws-dynamodb-stream-lambda';

export interface IRealTimeProcessingProps {
    readonly sourceCodeBucketName: string;
    readonly sourceCodeKeyPrefix: string;
    readonly graphqlApi: GraphqlApi;
    readonly configTable: Table;
    readonly uiReferenceTable: Table;
    readonly s3LoggingBucket: Bucket;
    readonly realTimeDataTable: Table;
    readonly sendAnonymousData: string;
    readonly anonymousDataUUID: string;
    readonly solutionVersion: string;
    readonly solutionId: string;
}

export class RealTimeProcessing extends Construct {
    public readonly streamName: string;
    public readonly rawDataBucketName: string;

    constructor(scope: Construct, id: string, props: IRealTimeProcessingProps) {
        super(scope, id);

        const sourceCodeBucket = Bucket.fromBucketName(this, 'sourceCodeBucket', props.sourceCodeBucketName);

        const streamFirehoseS3Construct = new KinesisStreamsToKinesisFirehoseToS3(this, 'StreamFirehoseS3', {
            existingLoggingBucketObj: props.s3LoggingBucket,
            bucketProps: {
                serverAccessLogsPrefix: 'data/'
            }
        });
        this.streamName = streamFirehoseS3Construct.kinesisStream.streamName;
        this.rawDataBucketName = streamFirehoseS3Construct.s3Bucket!.bucketName;

        const streamLambdaConstruct = new KinesisStreamsToLambda(this, 'StreamFilter', {
            kinesisEventSourceProps: {
                startingPosition: StartingPosition.TRIM_HORIZON,
                batchSize: 100
            },
            deploySqsDlqQueue: false,
            lambdaFunctionProps: {
                runtime: Runtime.NODEJS_14_X,
                handler: 'filter-kinesis-stream/index.handler',
                timeout: Duration.minutes(2),
                description: 'Filters messages from the Kinesis Stream. Forwards status and production count updates to the real-time data table',
                code: Code.fromBucket(sourceCodeBucket, [props.sourceCodeKeyPrefix, 'filter-kinesis-stream.zip'].join('/')),
                memorySize: 256,
                environment: {
                    GRAPHQL_API_ENDPOINT: props.graphqlApi.graphqlUrl,
                    CONFIG_TABLE_NAME: props.configTable.tableName,
                    UI_REFERENCE_TABLE_NAME: props.uiReferenceTable.tableName,
                    REAL_TIME_TABLE_NAME: props.realTimeDataTable.tableName,
                    REAL_TIME_DATA_EXPIRATION_IN_HOURS: '24',
                    SEND_ANONYMOUS_DATA: props.sendAnonymousData,
                    ANONYMOUS_DATA_UUID: props.anonymousDataUUID,
                    SOLUTION_ID: props.solutionId,
                    SOLUTION_VERSION: props.solutionVersion,
                    VERBOSE_LOGGING: 'No'
                }
            },
            existingStreamObj: streamFirehoseS3Construct.kinesisStream
        });

        props.graphqlApi.grantMutation(streamLambdaConstruct.lambdaFunction);
        props.configTable.grantReadData(streamLambdaConstruct.lambdaFunction);
        props.configTable.grantWriteData(streamLambdaConstruct.lambdaFunction);
        props.uiReferenceTable.grantReadWriteData(streamLambdaConstruct.lambdaFunction);
        props.realTimeDataTable.grantWriteData(streamLambdaConstruct.lambdaFunction);

        // Suppress CFN Nag warning(s)
        (streamLambdaConstruct.lambdaFunction.role!.node.findChild('DefaultPolicy').node.defaultChild as CfnPolicy)
            .cfnOptions.metadata = {
            cfn_nag: {
                rules_to_suppress: [
                    {
                        id: 'W76',
                        reason: 'SPCM for IAM policy document is higher than 25: Permissions are required'
                    },
                    {
                        id: 'W12',
                        reason: '* permission is needed for X-Ray'

                    }
                ]
            }
        };

        const configTableStreamUpdateConstruct = new DynamoDBStreamToLambda(this, 'ConfigStreamToUpdateLambda', {
            existingTableObj: props.configTable,
            deploySqsDlqQueue: false,
            lambdaFunctionProps: {
                runtime: Runtime.NODEJS_14_X,
                handler: 'update-filter-function/index.handler',
                timeout: Duration.minutes(2),
                description: 'Receives messages from the DDB Streams for the Config and UI Reference Tables. When an update is detected, update an environment variable on the Filter Kinesis Stream lambda so its container will be refreshed',
                code: Code.fromBucket(sourceCodeBucket, [props.sourceCodeKeyPrefix, 'update-filter-function.zip'].join('/')),
                environment: {
                    FILTER_FUNCTION_NAME: streamLambdaConstruct.lambdaFunction.functionName,
                    CONFIG_TABLE_STREAM_ARN: props.configTable.tableStreamArn!,
                    UI_REFERENCE_TABLE_STREAM_ARN: props.uiReferenceTable.tableStreamArn!,
                    SEND_ANONYMOUS_DATA: props.sendAnonymousData,
                    ANONYMOUS_DATA_UUID: props.anonymousDataUUID,
                    SOLUTION_ID: props.solutionId,
                    SOLUTION_VERSION: props.solutionVersion
                }
            }
        });

        // Allows the update function to get and update environment variables for the filter lambda
        configTableStreamUpdateConstruct.lambdaFunction.role!
            .attachInlinePolicy(new Policy(this, 'AllowUpdateFilterLambdaPolicy', {
                statements: [new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ['lambda:GetFunctionConfiguration', 'lambda:UpdateFunctionConfiguration'],
                    resources: [streamLambdaConstruct.lambdaFunction.functionArn]
                })]
            }));

        // Configure the stream event source for the UI reference table
        props.uiReferenceTable.grantStreamRead(configTableStreamUpdateConstruct.lambdaFunction);
        configTableStreamUpdateConstruct.lambdaFunction.addEventSource(new DynamoEventSource(props.uiReferenceTable, {
            startingPosition: StartingPosition.TRIM_HORIZON,
            bisectBatchOnError: true,
            maxRecordAge: Duration.hours(24),
            retryAttempts: 500
        }));
    }
}
