// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Aws, Construct, CustomResource, Fn } from '@aws-cdk/core';
import { Table as DynamoDBTable } from '@aws-cdk/aws-dynamodb';
import { CfnCrawler, CfnJob, CfnTrigger, CfnWorkflow, Database, DataFormat, Schema, Table as GlueTable } from '@aws-cdk/aws-glue';
import { Effect, Policy, PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { Function as LambdaFunction } from '@aws-cdk/aws-lambda';
import { Bucket } from '@aws-cdk/aws-s3';
import * as SolutionsConstructsCore from '@aws-solutions-constructs/core';

/**
 * BI reporting - ETL Construct props interface
 */
export interface IEtlProps {
  // Config DynamoDB table
  readonly configTable: DynamoDBTable;
  // Lower case stack name
  readonly lowerCaseStackName: string;
  // Metadata configuration
  readonly metadataConfiguration: {
    csvPrefix: string;
    manifestPrefix: string;
    machineInformationPrefix: string;
    machineConfigInformationPrefix: string;
  };
  // Raw data S3 bucket name
  readonly rawDataS3BucketName: string;
  // S3 logging bucket
  readonly s3LoggingBucket: Bucket;
  // Solution helper Lambda function
  readonly solutionHelperFunction: LambdaFunction;
  // Solution ID
  readonly solutionId: string;
  // Solution version
  readonly solutionVersion: string;
  // Source code bucket prefix
  readonly sourceCodeBucketName: string;
  // Source code key prefix
  readonly sourceCodeKeyPrefix: string;
  // UI reference DynamoDB table
  readonly uiReferenceTable: DynamoDBTable;
}

/**
 * BI reporting - ETL Construct
 */
export class Etl extends Construct {
  // Glue S3 bucket containing parquet converted data
  public readonly glueBucket: Bucket;
  // Glue custom resource
  public readonly glueCustomResource: CustomResource;
  // Glue data base
  public readonly glueDatabase: Database;
  // Glue metadata S3 bucket
  public readonly glueMetadataBucket: Bucket;
  // Glue table
  public readonly glueTable: GlueTable;

  constructor(scope: Construct, id: string, props: IEtlProps) {
    super(scope, id);

    const sourceCodeBucket = Bucket.fromBucketName(this, 'sourceCodeBucket', props.sourceCodeBucketName);

    // Glue job files name and the S3 bucket prefix to store files
    const glueJobScriptsPrefix = 'glue-job-scripts';
    const glueConfigurationJobScriptName = 'configuration.py';
    const glueConvertParquetJobScriptName = 'convert_parquet.py';
    const glueUpdateCrawlerJobScriptName = 'update_crawler.py';
    const { csvPrefix, manifestPrefix, machineInformationPrefix, machineConfigInformationPrefix } = props.metadataConfiguration;

    this.glueBucket = SolutionsConstructsCore.buildS3Bucket(this, {
      bucketProps: {
        serverAccessLogsBucket: props.s3LoggingBucket,
        serverAccessLogsPrefix: 'parquet/'
      }
    }, 'Parquet')[0];

    this.glueMetadataBucket = SolutionsConstructsCore.buildS3Bucket(this, {
      bucketProps: {
        serverAccessLogsBucket: props.s3LoggingBucket,
        serverAccessLogsPrefix: 'metadata/'
      }
    }, 'Metadata')[0];

    this.glueDatabase = new Database(this, 'GlueDatabase', {
      databaseName: `${props.lowerCaseStackName}-database`
    });

    this.glueTable = new GlueTable(this, 'GlueTable', {
      columns: [
        { name: 'quality', type: Schema.STRING },
        { name: 'value', type: Schema.STRING },
        { name: 'timestamp', type: Schema.STRING },
        { name: 'tag', type: Schema.STRING },
        { name: 'id', type: Schema.STRING }
      ],
      dataFormat: DataFormat.PARQUET,
      database: this.glueDatabase,
      tableName: Fn.join('_', Fn.split('-', this.glueBucket.bucketName)),
      bucket: this.glueBucket,
      description: `Table for ${Aws.STACK_NAME} CloudFormation stack`,
      partitionKeys: [
        { name: 'Partition_0', type: Schema.STRING, comment: 'Year' },
        { name: 'Partition_1', type: Schema.STRING, comment: 'Month' },
        { name: 'Partition_2', type: Schema.STRING, comment: 'Day' },
      ]
    });

    /**
     * Glue custom resource to copy Glue job scripts and create initial S3 configuration and manifest files.
     */
    const solutionHelperEtlPolicy = new Policy(this, 'SolutionHelperEtlPolicy', {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['s3:GetObject'],
          resources: [`${sourceCodeBucket.bucketArn}/*`]
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['s3:PutObject'],
          resources: [
            `${this.glueMetadataBucket.bucketArn}/${csvPrefix}/*`,
            `${this.glueMetadataBucket.bucketArn}/${manifestPrefix}/*`,
            `${this.glueMetadataBucket.bucketArn}/${glueJobScriptsPrefix}/*`
          ]
        })
      ],
      roles: [props.solutionHelperFunction.role!]
    });

    this.glueCustomResource = new CustomResource(this, 'GlueCustomResource', {
      serviceToken: props.solutionHelperFunction.functionArn,
      properties: {
        Action: 'CONFIGURE_ETL',
        SourceBucket: sourceCodeBucket.bucketName,
        SourcePrefix: props.sourceCodeKeyPrefix,
        GlueJobScriptsPrefix: glueJobScriptsPrefix,
        GlueJobScripts: [
          glueConfigurationJobScriptName,
          glueConvertParquetJobScriptName,
          glueUpdateCrawlerJobScriptName
        ],
        CsvPrefix: csvPrefix,
        ManifestPrefix: manifestPrefix,
        MachineInformationPrefix: machineInformationPrefix,
        MachineConfigInformationPrefix: machineConfigInformationPrefix,
        DestinationBucket: this.glueMetadataBucket.bucketName
      }
    });
    this.glueCustomResource.node.addDependency(solutionHelperEtlPolicy);

    /**
     * Glue workflow to create machine configuration S3 files and convert the raw data to parquet.
     * An initial trigger will be triggered every 1 AM.
     * 1) Updates machine information and machine config information to S3.
     * 2) Converts the raw data to parquet and unnest array to JSON objects.
     * 3) Crawls the parquet data to the Glue table.
     * 4) (One time) Updates the Glue crawler configuration to crawl incrementally.
     */
    const glueWorkflow = new CfnWorkflow(this, 'GlueWorkflow', {
      description: `Workflow for ${Aws.STACK_NAME} CloudFormation stack`
    });

    // Machine configuration job
    const glueConfigurationJobRole = new Role(this, 'GlueConfigurationJobRole', {
      assumedBy: new ServicePrincipal('glue.amazonaws.com'),
      path: '/service-role/'
    });
    glueConfigurationJobRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Scan'
      ],
      resources: [
        props.configTable.tableArn,
        props.uiReferenceTable.tableArn
      ]
    }));
    glueConfigurationJobRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:PutObject'],
      resources: [
        `${this.glueMetadataBucket.bucketArn}/csv/*`,
        `${this.glueMetadataBucket.bucketArn}/manifest/*`
      ]
    }));

    const glueConfigurationJob = new CfnJob(this, 'GlueConfigurationJob', {
      command: {
        name: `glueetl`,
        pythonVersion: '3',
        scriptLocation: `s3://${this.glueMetadataBucket.bucketName}/${glueJobScriptsPrefix}/${glueConfigurationJobScriptName}`
      },
      role: glueConfigurationJobRole.roleName,
      defaultArguments: {
        '--config_table': props.configTable.tableName,
        '--ui_reference_table': props.uiReferenceTable.tableName,
        '--output_bucket': this.glueMetadataBucket.bucketName,
        '--csv_prefix': csvPrefix,
        '--manifest_prefix': manifestPrefix,
        '--machine_information_csv': `${machineInformationPrefix}.csv`,
        '--machine_config_information_csv': `${machineConfigInformationPrefix}.csv`,
        '--machine_information_manifest': `${machineInformationPrefix}_${manifestPrefix}.json`,
        '--machine_config_information_manifest': `${machineConfigInformationPrefix}_${manifestPrefix}.json`,
        '--additional-python-modules': 'botocore>=1.20.12,boto3>=1.17.12',
        '--user_agent_extra': `{"user_agent_extra": "AwsSolution/${props.solutionId}/${props.solutionVersion}"}`
      },
      description: `Glue configuration job for ${Aws.STACK_NAME} CloudFormation stack`,
      glueVersion: '2.0'
    });
    glueConfigurationJob.node.addDependency(this.glueCustomResource);

    new CfnTrigger(this, 'GlueConfigurationJobTrigger', { // NOSONAR: typescript:S1848
      name: `${Aws.STACK_NAME}-ConfigurationJobTrigger`,
      actions: [{ jobName: glueConfigurationJob.ref }],
      type: 'SCHEDULED',
      description: `Glue configuration job scheduled trigger for ${Aws.STACK_NAME} CloudFormation stack`,
      schedule: 'cron(0 1 * * ? *)',
      startOnCreation: true,
      workflowName: glueWorkflow.ref
    });

    // Parquet conversion job
    const glueConvertParquetJobRole = new Role(this, 'GlueConvertParquetJobRole', {
      assumedBy: new ServicePrincipal('glue.amazonaws.com'),
      path: '/service-role/'
    });
    glueConvertParquetJobRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['dynamodb:GetItem'],
      resources: [props.configTable.tableArn]
    }));
    glueConvertParquetJobRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [
        `arn:${Aws.PARTITION}:s3:::${props.rawDataS3BucketName}`,
        `${this.glueBucket.bucketArn}`
      ]
    }));
    glueConvertParquetJobRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [
        `arn:${Aws.PARTITION}:s3:::${props.rawDataS3BucketName}/*`,
        `${this.glueBucket.bucketArn}/*`
      ]
    }));
    glueConvertParquetJobRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:DeleteObject',
        's3:PutObject'
      ],
      resources: [
        `${this.glueBucket.bucketArn}/*`
      ]
    }));

    const glueConvertParquetJob = new CfnJob(this, 'GlueConvertParquetJob', {
      command: {
        name: `glueetl`,
        pythonVersion: '3',
        scriptLocation: `s3://${this.glueMetadataBucket.bucketName}/${glueJobScriptsPrefix}/${glueConvertParquetJobScriptName}`
      },
      role: glueConvertParquetJobRole.roleName,
      defaultArguments: {
        '--config_table': props.configTable.tableName,
        '--input_bucket': props.rawDataS3BucketName,
        '--output_bucket': this.glueBucket.bucketName,
        '--additional-python-modules': 'botocore>=1.20.12,boto3>=1.17.12',
        '--user_agent_extra': `{"user_agent_extra": "AwsSolution/${props.solutionId}/${props.solutionVersion}"}`
      },
      description: `Glue parquet conversion job for ${Aws.STACK_NAME} CloudFormation stack`,
      glueVersion: '2.0'
    });
    glueConvertParquetJob.node.addDependency(this.glueCustomResource);

    new CfnTrigger(this, 'GlueConvertParquetJobTrigger', {  // NOSONAR: typescript:S1848
      name: `${Aws.STACK_NAME}-ConvertParquetJobTrigger`,
      actions: [{ jobName: glueConvertParquetJob.ref }],
      type: 'CONDITIONAL',
      description: `Glue parquet conversion job scheduled trigger for ${Aws.STACK_NAME} CloudFormation stack`,
      predicate: {
        conditions: [{
          jobName: glueConfigurationJob.ref,
          logicalOperator: 'EQUALS',
          state: 'SUCCEEDED'
        }]
      },
      startOnCreation: true,
      workflowName: glueWorkflow.ref
    });

    // Glue crawler
    const glueCrawlerRole = new Role(this, 'GlueCrawlerRole', {
      assumedBy: new ServicePrincipal('glue.amazonaws.com'),
      path: '/service-role/'
    });
    glueCrawlerRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [`${this.glueBucket.bucketArn}`]
    }));
    glueCrawlerRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [`${this.glueBucket.bucketArn}/*`]
    }));
    glueCrawlerRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['glue:GetDatabase'],
      resources: [
        `arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:catalog`,
        `${this.glueDatabase.databaseArn}`
      ]
    }));
    glueCrawlerRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'glue:GetTable',
        'glue:CreateTable',
        'glue:UpdateTable',
        'glue:BatchGetPartition',
        'glue:BatchCreatePartition'
      ],
      resources: [
        `arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:catalog`,
        `${this.glueDatabase.databaseArn}`,
        `arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:table/${this.glueDatabase.databaseName}/*`
      ]
    }));

    const glueCrawler = new CfnCrawler(this, 'GlueCrawler', {
      role: glueCrawlerRole.roleArn,
      targets: {
        s3Targets: [{
          path: `s3://${this.glueBucket.bucketName}/`
        }]
      },
      databaseName: this.glueDatabase.databaseName,
      description: `Glue crawler for ${Aws.STACK_NAME} CloudFormation stack`,
      schemaChangePolicy: {
        deleteBehavior: 'LOG',
        updateBehavior: 'UPDATE_IN_DATABASE'
      }
    });

    new CfnTrigger(this, 'GlueCrawlerTrigger', {  // NOSONAR: typescript:S1848
      name: `${Aws.STACK_NAME}-CrawlerTrigger`,
      actions: [{ crawlerName: glueCrawler.ref }],
      type: 'CONDITIONAL',
      description: `Glue crawler trigger for ${Aws.STACK_NAME} CloudFormation stack`,
      predicate: {
        conditions: [{
          jobName: glueConvertParquetJob.ref,
          logicalOperator: 'EQUALS',
          state: 'SUCCEEDED'
        }]
      },
      startOnCreation: true,
      workflowName: glueWorkflow.ref
    });

    // Glue crawler configuration update job
    const glueUpdateCrawlerJobRole = new Role(this, 'GlueUpdateCrawlerJobRole', {
      assumedBy: new ServicePrincipal('glue.amazonaws.com'),
      path: '/service-role/'
    });
    glueUpdateCrawlerJobRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['glue:UpdateCrawler'],
      resources: [`arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:crawler/${glueCrawler.ref}`]
    }));
    glueUpdateCrawlerJobRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['glue:StopTrigger'],
      resources: [`arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:trigger/${Aws.STACK_NAME}-UpdateCrawlerJobTrigger`]
    }));

    const glueUpdateCrawlerJob = new CfnJob(this, 'GlueUpdateCrawlerJob', {
      command: {
        name: `glueetl`,
        pythonVersion: '3',
        scriptLocation: `s3://${this.glueMetadataBucket.bucketName}/${glueJobScriptsPrefix}/${glueUpdateCrawlerJobScriptName}`
      },
      role: glueUpdateCrawlerJobRole.roleName,
      defaultArguments: {
        '--glue_crawler': glueCrawler.ref,
        '--glue_trigger': `${Aws.STACK_NAME}-UpdateCrawlerJobTrigger`,
        '--additional-python-modules': 'botocore>=1.20.12,boto3>=1.17.12',
        '--user_agent_extra': `{"user_agent_extra": "AwsSolution/${props.solutionId}/${props.solutionVersion}"}`
      },
      description: `Glue crawler update job for ${Aws.STACK_NAME} CloudFormation stack`,
      glueVersion: '2.0',
    });
    glueUpdateCrawlerJob.node.addDependency(this.glueCustomResource);

    new CfnTrigger(this, 'GlueUpdateCrawlerJobTrigger', { // NOSONAR: typescript:S1848
      name: `${Aws.STACK_NAME}-UpdateCrawlerJobTrigger`,
      actions: [{ jobName: glueUpdateCrawlerJob.ref }],
      type: 'CONDITIONAL',
      description: `Glue crawler update job scheduled trigger for ${Aws.STACK_NAME} CloudFormation stack`,
      predicate: {
        conditions: [{
          crawlerName: glueCrawler.ref,
          logicalOperator: 'EQUALS',
          crawlState: 'SUCCEEDED'
        }]
      },
      startOnCreation: true,
      workflowName: glueWorkflow.ref
    });

    new Policy(this, 'GlueCommonPolicy', {  // NOSONAR: typescript:S1848
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject'
          ],
          resources: [`${this.glueMetadataBucket.bucketArn}/${glueJobScriptsPrefix}/*`]
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: [`arn:${Aws.PARTITION}:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:log-group:/aws-glue/*`]
        })
      ],
      roles: [
        glueConfigurationJobRole,
        glueConvertParquetJobRole,
        glueUpdateCrawlerJobRole,
        glueCrawlerRole
      ]
    });
  }
}