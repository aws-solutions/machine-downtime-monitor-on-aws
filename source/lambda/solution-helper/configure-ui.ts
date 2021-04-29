// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IConfigUIRequest, IConfigUIRequestProps } from './custom-resource-utils';
import { getOptions } from '../util/metrics';
import S3 from 'aws-sdk/clients/s3';
const S3Client = new S3(getOptions());

const { AWS_REGION } = process.env;

export async function handleConfigureUI(event: IConfigUIRequest): Promise<string> {
    switch (event.RequestType) {
        case 'Create':
        case 'Update':
            await copyStaticUIAssets(event.ResourceProperties);
            await putAmplifyConfig(event.ResourceProperties);
            return `${event.RequestType} completed OK`;
        default:
            return `No action needed for ${event.RequestType}`;
    }
}

/**
 * Copies the static assets listed in the Web UI manifest file to the Web UI S3 bucket
 * @param props {IConfigUIRequestProps} Custom Resource Properties
 */
async function copyStaticUIAssets(props: IConfigUIRequestProps): Promise<void> {
    // get file manifest from s3
    const getManifestParams: S3.GetObjectRequest = {
        Bucket: props.SrcBucket,
        Key: `${props.SrcPath}/${props.WebUIManifestFileName}`
    };

    console.log('Getting manifest file:', JSON.stringify(getManifestParams, null, 2));
    const data = await S3Client.getObject(getManifestParams).promise();
    const manifest: string[] = JSON.parse(data.Body.toString());
    console.log('Manifest:', JSON.stringify(manifest, null, 2));

    // Loop through manifest and copy files to the destination bucket
    await Promise.all(manifest.map(async (file: string) => {
        let params: S3.CopyObjectRequest = {
            Bucket: props.DestinationBucket,
            CopySource: `${props.SrcBucket}/${props.SrcPath}/${file}`,
            Key: (file.startsWith(props.WebUIStaticFileNamePrefix) && file !== props.WebUIStaticFileNamePrefix) ? file.split(props.WebUIStaticFileNamePrefix).slice(1).join('') : file
        };

        console.log('Copying:', JSON.stringify(params, null, 2));
        let resp = await S3Client.copyObject(params).promise();
        console.log('file copied to s3:', resp);
    }));
}

/**
 * Places a file in the Web UI S3 bucket for use by Amplify when the UI is loaded and configured
 * @param props {IConfigUIRequestProps} Custom Resource Properties
 */
async function putAmplifyConfig(props: IConfigUIRequestProps): Promise<void> {
    const webUIConfig = {
        Auth: {
            mandatorySignIn: true,
            region: AWS_REGION,
            identityPoolId: props.IdentityPoolId,
            userPoolId: props.UserPoolId,
            userPoolWebClientId: props.UserPoolClientId
        },
        "aws_appsync_graphqlEndpoint": props.ApiEndpoint,
        "aws_appsync_region": AWS_REGION,
        "aws_appsync_authenticationType": "AWS_IAM"
    };

    const webUIConfigFile = `const webUIAWSConfig = ${JSON.stringify(webUIConfig, null, 2)};`;

    console.log('Web UI Config Contents: ', webUIConfigFile);

    const putObjectProps: S3.PutObjectRequest = {
        Bucket: props.DestinationBucket,
        Key: props.WebUIConfigFileName,
        Body: Buffer.from(webUIConfigFile),
        ContentType: 'application/javascript'
    };

    console.log(`Putting Web UI Config: ${props.DestinationBucket}/${props.WebUIConfigFileName}`);
    await S3Client.putObject(putObjectProps).promise();
    console.log('Successfully put Web UI Config');
}
