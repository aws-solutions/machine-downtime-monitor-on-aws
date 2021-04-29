// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct } from '@aws-cdk/core';
import { GraphqlApi } from '@aws-cdk/aws-appsync';
import { Table } from '@aws-cdk/aws-dynamodb';
import { Bucket } from '@aws-cdk/aws-s3';
import { UserPool, UserPoolClient, CfnIdentityPool } from '@aws-cdk/aws-cognito';

import { Authentication } from './authentication/authentication-construct';
import { AppSyncApi } from './appsync-api/appsync-api-construct';
import { Hosting } from './hosting/hosting-construct';

export interface IFrontEndProps {
    readonly sourceCodeBucketName: string;
    readonly sourceCodeKeyPrefix: string;
    readonly defaultUserEmail: string;
    readonly solutionDisplayName: string;
    readonly s3LoggingBucket: Bucket;
    readonly sendAnonymousData: string;
    readonly anonymousDataUUID: string;
    readonly solutionVersion: string;
    readonly solutionId: string;
}

export class FrontEnd extends Construct {
    public readonly websiteDistributionDomainName: string;
    public readonly websiteHostingBucket: Bucket;
    public readonly graphqlApi: GraphqlApi;
    public readonly configTable: Table;
    public readonly uiReferenceTable: Table;
    public readonly realTimeDataTable: Table;
    public readonly userPool: UserPool;
    public readonly userPoolClient: UserPoolClient;
    public readonly identityPool: CfnIdentityPool;

    constructor(scope: Construct, id: string, props: IFrontEndProps) {
        super(scope, id);

        const hosting = new Hosting(this, 'Hosting', { s3LoggingBucket: props.s3LoggingBucket });
        this.websiteDistributionDomainName = hosting.websiteDistribution.domainName;
        this.websiteHostingBucket = hosting.hostingBucket;

        const authentication = new Authentication(this, 'Authentication', {
            defaultUserEmail: props.defaultUserEmail,
            solutionDisplayName: props.solutionDisplayName,
            distributionDomainName: this.websiteDistributionDomainName
        });
        this.userPool = authentication.userPool;
        this.userPoolClient = authentication.userPoolClient;
        this.identityPool = authentication.identityPool;

        const appSyncApi = new AppSyncApi(this, 'AppSyncApi', {
            sourceCodeBucketName: props.sourceCodeBucketName,
            sourceCodeKeyPrefix: props.sourceCodeKeyPrefix,
            sendAnonymousData: props.sendAnonymousData,
            anonymousDataUUID: props.anonymousDataUUID,
            solutionId: props.solutionId,
            solutionVersion: props.solutionVersion
        });

        this.graphqlApi = appSyncApi.graphqlApi;
        this.graphqlApi.grantQuery(authentication.authenticatedRole);
        this.graphqlApi.grantMutation(authentication.authenticatedRole);
        this.graphqlApi.grantSubscription(authentication.authenticatedRole);

        this.configTable = appSyncApi.configTable;
        this.uiReferenceTable = appSyncApi.uiReferenceTable;
        this.realTimeDataTable = appSyncApi.realTimeDataTable;
    }
}
