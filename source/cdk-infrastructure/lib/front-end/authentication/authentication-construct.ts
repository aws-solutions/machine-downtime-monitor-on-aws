// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct, Aws, Duration, RemovalPolicy } from '@aws-cdk/core';
import { UserPool, CfnUserPool, UserPoolClient, CfnUserPoolUser, CfnIdentityPool, CfnIdentityPoolRoleAttachment } from '@aws-cdk/aws-cognito';
import { Role, FederatedPrincipal } from '@aws-cdk/aws-iam';

export interface IAuthenticationProps {
    readonly solutionDisplayName: string;
    readonly distributionDomainName: string;
    readonly defaultUserEmail: string;
}

export class Authentication extends Construct {
    public readonly userPool: UserPool;
    public readonly userPoolClient: UserPoolClient;
    public readonly identityPool: CfnIdentityPool;
    public readonly authenticatedRole: Role;

    constructor(scope: Construct, id: string, props: IAuthenticationProps) {
        super(scope, id);

        this.userPool = new UserPool(this, 'UserPool', {
            userPoolName: `${Aws.STACK_NAME}-user-pool`,
            userInvitation: {
                emailSubject: `[${props.solutionDisplayName}] - Dashboard Login Information`,
                emailBody: `<p>
            Please sign in to the ${props.solutionDisplayName} Dashboard using the temporary credentials below:<br />
            https://${props.distributionDomainName}</p>
            <p>Username: <strong>{username}</strong><br />Temporary Password: <strong>{####}</strong></p>`
            },
            passwordPolicy: {
                minLength: 12,
                requireDigits: true,
                requireLowercase: true,
                requireSymbols: true,
                requireUppercase: true
            },
            signInAliases: {
                email: true,
                username: false,
                phone: false,
                preferredUsername: false
            },
            selfSignUpEnabled: false,
            removalPolicy: RemovalPolicy.DESTROY
        });

        (this.userPool.node.findChild('Resource') as CfnUserPool)
            .userPoolAddOns = { advancedSecurityMode: 'ENFORCED' };

        this.userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
            userPool: this.userPool,
            userPoolClientName: `${Aws.STACK_NAME}-user-pool-client`,
            refreshTokenValidity: Duration.days(1),
            generateSecret: false,
            preventUserExistenceErrors: true
        });

        new CfnUserPoolUser(this, 'DefaultUser', {
            userPoolId: this.userPool.userPoolId,
            username: props.defaultUserEmail,
            desiredDeliveryMediums: ['EMAIL'],
            forceAliasCreation: true,
            userAttributes: [
                { name: 'email', value: props.defaultUserEmail },
                { name: 'email_verified', value: 'true' }
            ]
        });

        this.identityPool = new CfnIdentityPool(this, 'IdentityPool', {
            allowUnauthenticatedIdentities: false,
            identityPoolName: `${Aws.STACK_NAME}-identity-pool`,
            cognitoIdentityProviders: [{
                clientId: this.userPoolClient.userPoolClientId,
                providerName: this.userPool.userPoolProviderName,
                serverSideTokenCheck: false
            }]
        });

        this.authenticatedRole = new Role(this, 'IdentityPoolAuthenticatedRole', {
            assumedBy: new FederatedPrincipal('cognito-identity.amazonaws.com', {
                'StringEquals': { 'cognito-identity.amazonaws.com:aud': this.identityPool.ref },
                'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
            }, 'sts:AssumeRoleWithWebIdentity'),
            description: `Identity Pool Authenticated Role for ${props.solutionDisplayName}`
        });

        new CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
            identityPoolId: this.identityPool.ref,
            roles: { authenticated: this.authenticatedRole.roleArn }
        });
    }
}
