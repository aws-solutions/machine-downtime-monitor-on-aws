// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IConfigETLRequest, IConfigETLRequestProps, IQuickSightManifest } from './custom-resource-utils';

// AWS Clients
import S3 from 'aws-sdk/clients/s3';
const s3 = new S3();

/**
 * Handles ETL configuration.
 * @param {IConfigETLRequest} event Lambda event
 * @returns {Promise<string>} Custom resource result message
 */
export async function handleEtlConfiguration(event: IConfigETLRequest): Promise<string> {
  switch (event.RequestType) {
    case 'Create':
      await Promise.all([
        copyS3Objects(event.ResourceProperties),
        createMachineInformationFiles(event.ResourceProperties)
      ]);

      break;
    case 'Update':
      await copyS3Objects(event.ResourceProperties);
      break
    default:
      return `No action needed for ${event.RequestType}`;
  }

  return `${event.RequestType} completed OK`;
}

/**
 * Copies S3 objects from the source bucket to the destination bucket.
 * @param {IConfigETLRequestProps} props Custom resource properties
 */
async function copyS3Objects(props: IConfigETLRequestProps) {
  const files = props.GlueJobScripts;

  await Promise.all(files.map(async (file: string) => {
    const params: S3.CopyObjectRequest = {
      Bucket: props.DestinationBucket,
      CopySource: `${props.SourceBucket}/${props.SourcePrefix}/${props.GlueJobScriptsPrefix}/${file}`,
      Key: `${props.GlueJobScriptsPrefix}/${file}`
    };

    console.log('Copying file:', JSON.stringify(params, null, 2));
    const response = await s3.copyObject(params).promise();
    console.log('File copied to s3:', JSON.stringify(response, null, 2));
  }));
}

/**
 * Creates machine information metadata files.
 * These file are used to create QuickSight resources.
 * @param {IConfigETLRequestProps} props Custom resource properties
 */
async function createMachineInformationFiles(props: IConfigETLRequestProps) {
  const destinationBucket = props.DestinationBucket;
  const csvPrefix = props.CsvPrefix;
  const manifestPrefix = props.ManifestPrefix;
  const machineInformationPrefix = props.MachineInformationPrefix;
  const machineConfigInformationPrefix = props.MachineConfigInformationPrefix;

  const machineInformationCsv = `${machineInformationPrefix}.csv`;
  const machineConfigInformationCsv = `${machineConfigInformationPrefix}.csv`;
  const machineInformationManifest = `${machineInformationPrefix}_${manifestPrefix}.json`;
  const machineConfigInformationManifest = `${machineConfigInformationPrefix}_${manifestPrefix}.json`;

  const machineInformationCsvBody = 'id,machine_name,location,line';
  const machineConfigInformationCsvBody = 'id,status_tag,down_value';
  const machineInformationManifestBody = getQuickSightManifest(destinationBucket, csvPrefix, machineInformationCsv);
  const machineConfigInformationManifestBody = getQuickSightManifest(destinationBucket, csvPrefix, machineConfigInformationCsv);

  await Promise.all([
    putObjectToS3Bucket(destinationBucket, `${csvPrefix}/${machineInformationCsv}`, machineInformationCsvBody),
    putObjectToS3Bucket(destinationBucket, `${csvPrefix}/${machineConfigInformationCsv}`, machineConfigInformationCsvBody),
    putObjectToS3Bucket(destinationBucket, `${manifestPrefix}/${machineInformationManifest}`, JSON.stringify(machineInformationManifestBody)),
    putObjectToS3Bucket(destinationBucket, `${manifestPrefix}/${machineConfigInformationManifest}`, JSON.stringify(machineConfigInformationManifestBody))
  ]);
}

/**
 * Puts an object into the S3 bucket with the provided object key.
 * @param {string} bucket S3 bucket to put the object
 * @param {string} key S3 object key to put the object
 * @param {string} body S3 object string body
 */
async function putObjectToS3Bucket(bucket: string, key: string, body: string) {
  const params: S3.PutObjectRequest = { Bucket: bucket, Key: key, Body: body };

  console.log('Putting file:', JSON.stringify(params, null, 2));
  const response = await s3.putObject(params).promise();
  console.log('File put to s3:', JSON.stringify(response, null, 2));
}

/**
 * Gets QuickSight manifest JSON object.
 * @param {string} bucket S3 bucket where the CSV file is
 * @param {string} csvPrefix S3 bucket prefix where the CSV file is
 * @param {string} csvFileName CSV file name in the S3 bucket
 * @returns {IQuickSightManifest} The QuickSight manifest JSON object
 */
function getQuickSightManifest(bucket: string, csvPrefix: string, csvFileName: string): IQuickSightManifest {
  return {
    fileLocations: [
      { URIs: [`s3://${bucket}/${csvPrefix}/${csvFileName}`] }
    ],
    globalUploadSettings: {
      format: 'CSV',
      delimiter: ',',
      textqualifier: '\'',
      containsHeader: 'true'
    }
  }
}