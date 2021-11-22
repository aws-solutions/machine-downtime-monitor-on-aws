// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct, CustomResource, Duration, CfnCondition, CfnCustomResource, Aws } from '@aws-cdk/core';
import { Bucket, IBucket } from '@aws-cdk/aws-s3';
import { Table } from '@aws-cdk/aws-dynamodb';
import { Function as LambdaFunction, Runtime, Code, CfnFunction } from '@aws-cdk/aws-lambda';

export interface ISolutionHelperProps {
    readonly sourceCodeBucketName: string;
    readonly sourceCodeKeyPrefix: string;
    readonly sendAnonymousData: string;
    readonly anonymousUsageCondition: CfnCondition;
    readonly solutionVersion: string;
    readonly solutionId: string;
    readonly deployM2CParameter: string;
}

export class SolutionHelper extends Construct {
    private readonly sourceCodeBucket: IBucket;
    public readonly customResourceLambda: LambdaFunction;
    private readonly sourceCodeKeyPrefix: string;
    public readonly anonymousDataUUID: string;
    public readonly lowerCaseStackName: string;

    constructor(scope: Construct, id: string, props: ISolutionHelperProps) {
        super(scope, id);

        this.sourceCodeBucket = Bucket.fromBucketName(this, 'sourceCodeBucket', props.sourceCodeBucketName);
        this.sourceCodeKeyPrefix = props.sourceCodeKeyPrefix;

        const generateSolutionConstantsLambda = new LambdaFunction(this, 'GenerateSolutionConstantsLambda', {
            runtime: Runtime.NODEJS_14_X,
            handler: 'solution-helper/index.handler',
            timeout: Duration.seconds(3),
            description: 'Generates an anonymous UUID and a lower case stack name for sending metrics and resource creation',
            code: Code.fromBucket(this.sourceCodeBucket, [props.sourceCodeKeyPrefix, 'solution-helper.zip'].join('/')),
            environment: { STACK_NAME: Aws.STACK_NAME }
        });

        // Suppress CFN Nag warnings
        (generateSolutionConstantsLambda.node.findChild('Resource') as CfnFunction).addMetadata('cfn_nag', {
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
        });

        const generateSolutionConstantsCustomResource = new CustomResource(this, 'GenerateSolutionConstantsCustomResource', {
            serviceToken: generateSolutionConstantsLambda.functionArn,
            properties: { Action: 'GENERATE_SOLUTION_CONSTANTS' }
        });
        this.anonymousDataUUID = generateSolutionConstantsCustomResource.getAttString('AnonymousDataUUID');
        this.lowerCaseStackName = generateSolutionConstantsCustomResource.getAttString('LowerCaseStackName');

        this.customResourceLambda = new LambdaFunction(this, 'CustomResourceLambda', {
            runtime: Runtime.NODEJS_14_X,
            handler: 'solution-helper/index.handler',
            timeout: Duration.minutes(2),
            description: 'Performs various Solution lifecycle actions when invoked as a CloudFormation Custom Resource',
            code: Code.fromBucket(this.sourceCodeBucket, [props.sourceCodeKeyPrefix, 'solution-helper.zip'].join('/')),
            environment: {
                SEND_ANONYMOUS_DATA: props.sendAnonymousData,
                ANONYMOUS_DATA_UUID: this.anonymousDataUUID,
                SOLUTION_ID: props.solutionId,
                SOLUTION_VERSION: props.solutionVersion
            }
        });

        // Suppress CFN Nag warnings
        (this.customResourceLambda.node.findChild('Resource') as CfnFunction).addMetadata('cfn_nag', {
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
        });

        const solutionLifecycleMetricCustomResource = new CfnCustomResource(this, 'SolutionLifecycleMetricCustomResource', { serviceToken: this.customResourceLambda.functionArn });
        solutionLifecycleMetricCustomResource.addPropertyOverride('Action', 'SOLUTION_LIFECYCLE');
        solutionLifecycleMetricCustomResource.addPropertyOverride('SolutionParameters', { DeployM2C: props.deployM2CParameter });
        solutionLifecycleMetricCustomResource.cfnOptions.condition = props.anonymousUsageCondition;
    }

    public setupCopyAssetsCustomResource(props: ISetupCopyAssetsCustomResourceProps) {
        // Allows the custom resource to read the static assets for the Amplify front-end from the source code bucket
        this.sourceCodeBucket.grantRead(this.customResourceLambda, `${this.sourceCodeKeyPrefix}/*`);

        // Allows the custom resource to place the static assets for the Amplify front-end into the hosting bucket
        props.hostingBucket.grantPut(this.customResourceLambda);

        new CustomResource(this, 'CopyAssetsCustomResource', {  // NOSONAR: typescript:S1848
            serviceToken: this.customResourceLambda.functionArn,
            properties: {
                Action: 'CONFIGURE_UI',
                DestinationBucket: props.hostingBucket.bucketName,
                SrcBucket: this.sourceCodeBucket.bucketName,
                SrcPath: this.sourceCodeKeyPrefix,
                WebUIManifestFileName: 'web-ui-manifest.json',
                WebUIStaticFileNamePrefix: 'web-ui/',
                WebUIConfigFileName: 'web-ui-config.js',
                IdentityPoolId: props.identityPoolId,
                UserPoolId: props.userPoolId,
                UserPoolClientId: props.userPoolClientId,
                ApiEndpoint: props.graphQLEndpoint
            }
        });
    }

    public setupConfigureMachineDataCustomResource(props: ISetupConfigureMachineDataCustomResourceProps) {
        // Allows the custom resource to put the default configuration into the tables
        props.configTable.grantWriteData(this.customResourceLambda);
        props.uiReferenceTable.grantWriteData(this.customResourceLambda);

        new CustomResource(this, 'ConfigureMachineDataCustomResource', {    // NOSONAR: typescript:S1848
            serviceToken: this.customResourceLambda.functionArn,
            properties: {
                Action: 'CONFIGURE_MACHINE_DATA',
                ConfigId: 'DEFAULT',
                ConfigTableName: props.configTable.tableName,
                UIReferenceTableName: props.uiReferenceTable.tableName,
                MessageFormat: {
                    msgFormatDataAliasDelimiter: '/',
                    msgFormatDataMessageAliasKeyName: 'name',
                    msgFormatDataMessageQualityKeyName: 'quality',
                    msgFormatDataMessagesKeyName: 'messages',
                    msgFormatDataMessageTimestampFormat: 'YYYY-MM-DD HH:mm:ss.SSSSSSZZ',
                    msgFormatDataMessageTimestampKeyName: 'timestamp',
                    msgFormatDataMessageValueKeyName: 'value'
                },
                UIReferenceMapping: {
                    uiReferenceMappingLineKeys: '2',
                    uiReferenceMappingLocationKeys: '0/1'
                }
            }
        });
    }
}

interface ISetupCopyAssetsCustomResourceProps {
    hostingBucket: Bucket;
    identityPoolId: string;
    userPoolId: string;
    userPoolClientId: string;
    graphQLEndpoint: string;
}

interface ISetupConfigureMachineDataCustomResourceProps {
    configTable: Table;
    uiReferenceTable: Table;
}
