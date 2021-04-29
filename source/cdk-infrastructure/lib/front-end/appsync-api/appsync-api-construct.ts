// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct, RemovalPolicy, Aws, Duration } from '@aws-cdk/core';
import { GraphqlApi, Schema, AuthorizationType, MappingTemplate, FieldLogLevel } from '@aws-cdk/aws-appsync';
import { Table, AttributeType, BillingMode, StreamViewType, TableEncryption } from '@aws-cdk/aws-dynamodb';
import { Function as LambdaFunction, Code, Runtime, CfnFunction } from '@aws-cdk/aws-lambda';
import { Bucket } from '@aws-cdk/aws-s3';
import { Role, ServicePrincipal, PolicyStatement, Effect } from '@aws-cdk/aws-iam';

export interface AppSyncApiProps {
    readonly sourceCodeBucketName: string;
    readonly sourceCodeKeyPrefix: string;
    readonly sendAnonymousData: string;
    readonly anonymousDataUUID: string;
    readonly solutionVersion: string;
    readonly solutionId: string;
}

export class AppSyncApi extends Construct {
    public readonly graphqlApi: GraphqlApi;
    public readonly configTable: Table;
    public readonly uiReferenceTable: Table;
    public readonly realTimeDataTable: Table;

    constructor(scope: Construct, id: string, props: AppSyncApiProps) {
        super(scope, id);

        const sourceCodeBucket = Bucket.fromBucketName(this, 'sourceCodeBucket', props.sourceCodeBucketName);

        this.configTable = new Table(this, 'ConfigTable', {
            partitionKey: { name: 'id', type: AttributeType.STRING },
            sortKey: { name: 'type', type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            stream: StreamViewType.NEW_AND_OLD_IMAGES,
            removalPolicy: RemovalPolicy.DESTROY,
            encryption: TableEncryption.AWS_MANAGED,
            pointInTimeRecovery: true
        });

        this.uiReferenceTable = new Table(this, 'UIReferenceTable', {
            partitionKey: { name: 'id', type: AttributeType.STRING },
            sortKey: { name: 'type', type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            stream: StreamViewType.NEW_AND_OLD_IMAGES,
            removalPolicy: RemovalPolicy.DESTROY,
            encryption: TableEncryption.AWS_MANAGED,
            pointInTimeRecovery: true
        });

        this.realTimeDataTable = new Table(this, 'RealTimeDataTable', {
            partitionKey: { name: 'id', type: AttributeType.STRING },
            sortKey: { name: 'messageTimestamp', type: AttributeType.NUMBER },
            timeToLiveAttribute: 'realTimeTableTTLExpirationTimestamp',
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY,
            encryption: TableEncryption.AWS_MANAGED,
            pointInTimeRecovery: true
        });

        const graphqlApiLogRole = new Role(this, 'GraphqlApiLogRole', {
            assumedBy: new ServicePrincipal('appsync.amazonaws.com'),
            path: '/'
        });
        graphqlApiLogRole.addToPrincipalPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
            resources: [`arn:${Aws.PARTITION}:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:log-group:*`]
        }));

        this.graphqlApi = new GraphqlApi(this, 'GraphqlApi', {
            name: `${Aws.STACK_NAME}-api`,
            schema: Schema.fromAsset(`${__dirname}/schema.graphql`),
            authorizationConfig: {
                defaultAuthorization: {
                    authorizationType: AuthorizationType.IAM
                }
            },
            logConfig: { fieldLogLevel: FieldLogLevel.NONE, excludeVerboseContent: false, role: graphqlApiLogRole }
        });

        const realTimeDataSourceLambda = new LambdaFunction(this, 'RealTimeDataSourceLambda', {
            runtime: Runtime.NODEJS_14_X,
            handler: 'data-sources/machine-detail.handler',
            timeout: Duration.minutes(2),
            description: 'AppSync data source for getting machine details over a longer period of time',
            code: Code.fromBucket(sourceCodeBucket, [props.sourceCodeKeyPrefix, 'data-sources.zip'].join('/')),
            environment: {
                REAL_TIME_DATA_TABLE_NAME: this.realTimeDataTable.tableName,
                SEND_ANONYMOUS_DATA: props.sendAnonymousData,
                ANONYMOUS_DATA_UUID: props.anonymousDataUUID,
                SOLUTION_ID: props.solutionId,
                SOLUTION_VERSION: props.solutionVersion
            }
        });

        // Suppress CFN Nag warnings
        (realTimeDataSourceLambda.node.findChild('Resource') as CfnFunction)
            .cfnOptions.metadata = {
            cfn_nag: {
                rules_to_suppress: [
                    {
                        id: 'W58',
                        reason: 'CloudWatch permissions are granted by the LambdaBasicExecutionRole'
                    },
                    {
                        id: 'W89',
                        reason: 'VPC for Lambda is not needed. This serverless architecture does not deploy a VPC.'
                    },
                    {
                        id: 'W92',
                        reason: 'ReservedConcurrentExecutions is not needed for this Lambda function.'
                    }    
                ]
            }
        };

        const configDataSource = this.graphqlApi.addDynamoDbDataSource('ConfigDataSource', this.configTable);
        const uiReferenceDataSource = this.graphqlApi.addDynamoDbDataSource('UIReferenceDataSource', this.uiReferenceTable);
        const realTimeDataSource = this.graphqlApi.addLambdaDataSource('RealTimeDataSource', realTimeDataSourceLambda);
        this.realTimeDataTable.grantReadData(realTimeDataSourceLambda);

        configDataSource.createResolver({
            typeName: 'Query',
            fieldName: 'getConfigItems',
            requestMappingTemplate: MappingTemplate.dynamoDbScanTable(),
            responseMappingTemplate: MappingTemplate.dynamoDbResultList()
        });

        configDataSource.createResolver({
            typeName: 'Query',
            fieldName: 'getConfigItem',
            requestMappingTemplate: MappingTemplate.fromFile(`${__dirname}/get-item-req.vtl`),
            responseMappingTemplate: MappingTemplate.fromFile(`${__dirname}/get-item-res.vtl`)
        });

        configDataSource.createResolver({
            typeName: 'Mutation',
            fieldName: 'updateMachineConfig',
            requestMappingTemplate: MappingTemplate.fromFile(`${__dirname}/update-machine-config-req.vtl`),
            responseMappingTemplate: MappingTemplate.dynamoDbResultItem()
        });

        uiReferenceDataSource.createResolver({
            typeName: 'Query',
            fieldName: 'getUIReferenceItems',
            requestMappingTemplate: MappingTemplate.dynamoDbScanTable(),
            responseMappingTemplate: MappingTemplate.dynamoDbResultList()
        });

        uiReferenceDataSource.createResolver({
            typeName: 'Query',
            fieldName: 'getUIReferenceItem',
            requestMappingTemplate: MappingTemplate.fromFile(`${__dirname}/get-item-req.vtl`),
            responseMappingTemplate: MappingTemplate.fromFile(`${__dirname}/get-item-res.vtl`)
        });

        uiReferenceDataSource.createResolver({
            typeName: 'Mutation',
            fieldName: 'updateUIReferenceItem',
            requestMappingTemplate: MappingTemplate.fromFile(`${__dirname}/update-item-req.vtl`),
            responseMappingTemplate: MappingTemplate.dynamoDbResultItem()
        });

        uiReferenceDataSource.createResolver({
            typeName: 'Mutation',
            fieldName: 'updateMachineName',
            requestMappingTemplate: MappingTemplate.fromFile(`${__dirname}/update-machine-name-req.vtl`),
            responseMappingTemplate: MappingTemplate.dynamoDbResultItem()
        });

        uiReferenceDataSource.createResolver({
            typeName: 'Mutation',
            fieldName: 'updateMachineGrouping',
            requestMappingTemplate: MappingTemplate.fromFile(`${__dirname}/update-machine-grouping-req.vtl`),
            responseMappingTemplate: MappingTemplate.dynamoDbResultItem()
        });

        realTimeDataSource.createResolver({
            typeName: 'Query',
            fieldName: 'getRealTimeMachineData'
        });
    }
}
