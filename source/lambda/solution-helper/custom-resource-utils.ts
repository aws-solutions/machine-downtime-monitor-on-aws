// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IMessageFormatConfigItem, IUIReferenceMappingConfigItem } from '../util/gql-schema-interfaces';
/**
 * Possible return values to the CloudFormation custom resource request.
 */
export enum StatusTypes {
    Success = 'SUCCESS',
    Failed = 'FAILED'
}

/**
 * The actions this custom resource handler can support
 */
export enum CustomResourceActions {
    CONFIGURE_UI = 'CONFIGURE_UI',
    CONFIGURE_MACHINE_DATA = 'CONFIGURE_MACHINE_DATA',
    GENERATE_SOLUTION_CONSTANTS = 'GENERATE_SOLUTION_CONSTANTS',
    SOLUTION_LIFECYCLE = 'SOLUTION_LIFECYCLE',
    CONFIGURE_ETL = 'CONFIGURE_ETL',
    CREATE_QUICKSIGHT = 'CREATE_QUICKSIGHT'
}

/**
 * Returned from custom resource handler methods representing both the Status
 * and any corresponding data to include in the response.
 */
export interface ICompletionStatus {
    Status: StatusTypes
    Data: any
}

/**
 * The request object coming from CloudFormation
 */
export interface ICustomResourceRequest {
    RequestType: 'Create' | 'Update' | 'Delete';
    PhysicalResourceId: string;
    StackId: string;
    ServiceToken: string;
    RequestId: string;
    LogicalResourceId: string;
    ResponseURL: string;
    ResourceType: string;
    ResourceProperties: ICustomResourceRequestProps;
}

export interface ICustomResourceRequestProps {
    Action?: CustomResourceActions;
}

/**
 * Request properties for Custom Resource that will configure the UI
 */
export interface IConfigUIRequestProps extends ICustomResourceRequestProps {
    DestinationBucket: string;
    SrcBucket: string;
    SrcPath: string;
    WebUIManifestFileName: string;
    WebUIStaticFileNamePrefix: string;
    WebUIConfigFileName: string;
    IdentityPoolId: string;
    UserPoolId: string;
    UserPoolClientId: string;
    ApiEndpoint: string;
}

/**
 * Request for Custom Resource that will configure the UI
 */
export interface IConfigUIRequest extends ICustomResourceRequest {
    ResourceProperties: IConfigUIRequestProps
}

/**
 * Request properties for Custom Resource that will configure the default machine data
 */
export interface IConfigMachineDataRequestProps extends ICustomResourceRequestProps {
    ConfigId: string;
    ConfigTableName: string;
    UIReferenceTableName: string;
    MessageFormat?: IMessageFormatConfigItem;
    UIReferenceMapping?: IUIReferenceMappingConfigItem;
}

/**
 * Request for Custom Resource that will configure the default machine data
 */
export interface IConfigMachineDataRequest extends ICustomResourceRequest {
    ResourceProperties: IConfigMachineDataRequestProps
}

/**
 * Request properties for Custom Resource that will generate an UUID for anonymous operational metrics
 */
export interface IGenerateUUIDRequestProps extends ICustomResourceRequestProps {
}

/**
 * Request for Custom Resource that will generate an UUID for anonymous operational metrics
 */
export interface IGenerateUUIDRequest extends ICustomResourceRequest {
    ResourceProperties: IGenerateUUIDRequestProps
}

/**
 * Request for Custom Resource that will generate an UUID for anonymous operational metrics
 */
export interface ISolutionLifecycleMetricRequestProps extends ICustomResourceRequestProps {
    SolutionParameters: {
        DeployM2C: string;
    }
}

/**
 * Request properties for Custom Resource that will generate an UUID for anonymous operational metrics
 */
export interface ISolutionLifecycleMetricRequest extends ICustomResourceRequest {
    ResourceProperties: ISolutionLifecycleMetricRequestProps
}

/**
 * The Lambda function context
 */
 export interface ILambdaContext {
    getRemainingTimeInMillis: Function;
    functionName: string;
    functionVersion: string;
    invokedFunctionArn: string;
    memoryLimitInMB: number;
    awsRequestId: string;
    logGroupName: string;
    logStreamName: string;
    identity: any;
    clientContext: any;
    callbackWaitsForEmptyEventLoop: boolean;
}

/**
 * Request resource properties for the ETL configuration custom resource
 */
export interface IConfigETLRequestProps extends ICustomResourceRequestProps {
    SourceBucket: string;
    SourcePrefix: string;
    GlueJobScriptsPrefix: string;
    GlueJobScripts: string[];
    CsvPrefix: string;
    ManifestPrefix: string;
    MachineInformationPrefix: string;
    MachineConfigInformationPrefix: string;
    DestinationBucket: string;
}

/**
 * Request properties for the ETL configuration custom resource
 */
export interface IConfigETLRequest extends ICustomResourceRequest {
    ResourceProperties: IConfigETLRequestProps
}

/**
 * QuickSight manifest JSON object interface
 * https://docs.aws.amazon.com/quicksight/latest/user/supported-manifest-file-format.html
 */
export interface IQuickSightManifest {
    fileLocations: IQuickSightManifestFileURIs[] | IQuickSightManifestFileURIPrefixes[];
    globalUploadSettings?: IQuickSightManifestGlobalUploadSettings;
}

/**
 * QuickSight manifest file location URIs
 */
interface IQuickSightManifestFileURIs {
    URIs: string[];
}

/**
 * QuickSight manifest file location URI prefixes
 */
 interface IQuickSightManifestFileURIPrefixes {
    URIPrefixes: string[];
}

/**
 * QuickSight manifest global upload settings
 */
interface IQuickSightManifestGlobalUploadSettings {
    format?: 'CSV' | 'TSV' | 'CLF' | 'ELF' | 'JSON';
    delimiter?: ',' | '\t';
    textqualifier?: '\'' | '"';
    containsHeader?: 'true' | 'false';
}

/**
 * Request resource properties for the QuickSight creation custom resource
 */
 export interface ICreateQuickSightRequestProps extends ICustomResourceRequestProps {
    AccountId: string;
    GlueDatabaseName: string;
    GlueTableName: string;
    Metadata: {
        BucketName: string;
        MachineInformationPrefix: string;
        MachineConfigInformationPrefix: string;
        ManifestPrefix: string;
    };
    PrincipalArn: string;
    QuickSightTemplate: string;
    StackName: string;
}

/**
 * Request properties for the QuickSight creation custom resource
 */
export interface ICreateQuickSightRequest extends ICustomResourceRequest {
    ResourceProperties: ICreateQuickSightRequestProps
}