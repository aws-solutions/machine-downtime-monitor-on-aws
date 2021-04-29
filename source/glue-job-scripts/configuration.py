# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import boto3
import sys
import json

from botocore import config
from typing import List
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from pyspark.context import SparkContext

# System arguments
args_list = [
    "config_table", "ui_reference_table",
    "output_bucket", "user_agent_extra",
    "csv_prefix", "manifest_prefix",
    "machine_information_csv", "machine_config_information_csv",
    "machine_information_manifest", "machine_config_information_manifest"
]
args = getResolvedOptions(sys.argv, args_list) # NOSONAR: python:S4823
CONFIG_TABLE = args["config_table"]
UI_REFERENCE_TABLE = args["ui_reference_table"]
OUTPUT_BUCKET = args["output_bucket"]
USER_AGENT_EXTRA = args["user_agent_extra"]
CSV_PREFIX = args["csv_prefix"]
MANIFEST_PREFIX = args["manifest_prefix"]
MACHINE_INFORMATION_CSV = args["machine_information_csv"]
MACHINE_CONFIG_INFORMATION_CSV = args["machine_config_information_csv"]
MACHINE_INFORMATION_MANIFEST = args["machine_information_manifest"]
MACHINE_CONFIG_INFORMATION_MANIFEST = args["machine_config_information_manifest"]

# Global variables for DynamoDB scan API calls
FILTER_EXPRESSION = "#type = :type"
TYPE_EXPRESSION_ATTRIBUTE_NAME = "#type"
TYPE_EXPRESSION_ATTRIBUTE_VALUE = ":type"

# boto3 clients
config = config.Config(**json.loads(USER_AGENT_EXTRA))
dynamodb = boto3.client("dynamodb", config=config)
s3 = boto3.client("s3", config=config)


class ItemNotFoundException(Exception):
    """Item not found exception"""
    pass


def get_medata() -> tuple:
    """
    Gets metadata from DynamoDB tables.

    :return: The metadata which includes delimiter, location key positions, and line key positions.
    :raises: `ItemNotFoundException` when any DynamoDB tables do not have an item.
    """

    # Get DynamoDB config item
    config_get_response = dynamodb.get_item(
        TableName=CONFIG_TABLE,
        Key={
            "id": { "S": "DEFAULT" },
            "type": { "S": "MESSAGE_FORMAT" }
        },
        ProjectionExpression="msgFormatDataAliasDelimiter"
    )
    config_item = config_get_response.get("Item", {})

    if not config_item:
        raise ItemNotFoundException(f"Item does not exist in {CONFIG_TABLE}.")

    delimiter = config_item["msgFormatDataAliasDelimiter"]["S"]

    # Get DynamoDB UI reference item
    ui_reference_get_response = dynamodb.get_item(
        TableName=UI_REFERENCE_TABLE,
        Key={
            "id": { "S": "DEFAULT" },
            "type": { "S": "UI_REFERENCE_MAPPING" }
        },
        ProjectionExpression="uiReferenceMappingLocationKeys,uiReferenceMappingLineKeys"
    )
    ui_reference_item = ui_reference_get_response.get("Item", {})

    if ui_reference_item:
        location_keys = ui_reference_item["uiReferenceMappingLocationKeys"]["S"]
        line_keys = ui_reference_item["uiReferenceMappingLineKeys"]["S"]
    else:
        location_keys = ""
        line_keys = ""

    return (delimiter, location_keys, line_keys)


def scan_ui_reference_table() -> list:
    """
    Scans the UI reference DynamoDB table.

    :return: The list of machine id and machine name.
    """

    ui_reference_scan_response = dynamodb.scan(
        TableName=UI_REFERENCE_TABLE,
        Select="SPECIFIC_ATTRIBUTES",
        ProjectionExpression="#id,#name",
        FilterExpression=FILTER_EXPRESSION,
        ExpressionAttributeNames={
            "#id": "id",
            "#name": "name",
            TYPE_EXPRESSION_ATTRIBUTE_NAME: "type"
        },
        ExpressionAttributeValues={ TYPE_EXPRESSION_ATTRIBUTE_VALUE: { "S": "MACHINE" } }
    )
    ui_reference_scan_items = ui_reference_scan_response["Items"]

    while ui_reference_scan_response.get("LastEvaluatedKey", None):
        ui_reference_scan_response = dynamodb.scan(
            TableName=UI_REFERENCE_TABLE,
            Select="SPECIFIC_ATTRIBUTES",
            ProjectionExpression="#id,#name",
            FilterExpression=FILTER_EXPRESSION,
            ExpressionAttributeNames={
                "#id": "id",
                "#name": "name",
                TYPE_EXPRESSION_ATTRIBUTE_NAME: "type"
            },
            ExpressionAttributeValues={ TYPE_EXPRESSION_ATTRIBUTE_VALUE: { "S": "MACHINE" } },
            ExclusiveStartKey=ui_reference_scan_response["LastEvaluatedKey"]
        )
        ui_reference_scan_items = ui_reference_scan_items + ui_reference_scan_response["Items"]

    return ui_reference_scan_items


def scan_config_table() -> list:
    """
    Scans the config DynamoDB table.

    :return: The list of machine status tag and status down value.
    """

    config_scan_response = dynamodb.scan(
        TableName=CONFIG_TABLE,
        Select="SPECIFIC_ATTRIBUTES",
        ProjectionExpression="#id,machineStatusTagName,machineStatusDownValue",
        FilterExpression=FILTER_EXPRESSION,
        ExpressionAttributeNames={
            "#id": "id",
            TYPE_EXPRESSION_ATTRIBUTE_NAME: "type"
        },
        ExpressionAttributeValues={ TYPE_EXPRESSION_ATTRIBUTE_VALUE: { "S": "MACHINE_CONFIG" } }
    )
    config_scan_items = config_scan_response["Items"]

    while config_scan_response.get("LastEvaluatedKey", None):
        config_scan_response = dynamodb.scan(
            TableName=CONFIG_TABLE,
            Select="SPECIFIC_ATTRIBUTES",
            ProjectionExpression="#id,machineStatusTagName,machineStatusDownValue",
            FilterExpression=FILTER_EXPRESSION,
            ExpressionAttributeNames={
                "#id": "id",
                TYPE_EXPRESSION_ATTRIBUTE_NAME: "type"
            },
            ExpressionAttributeValues={ TYPE_EXPRESSION_ATTRIBUTE_VALUE: { "S": "MACHINE_CONFIG" } },
            ExclusiveStartKey=config_scan_response["LastEvaluatedKey"]
        )
        config_scan_items = config_scan_items + config_scan_response["Items"]

    return config_scan_items


def put_object_to_s3_bucket(body: bytes, key: str) -> None:
    """
    Puts an object into the S3 bucket.

    :param body: The object body.
    :param key: The object key.
    """

    s3.put_object(Body=body, Bucket=OUTPUT_BUCKET, Key=key)


def get_quicksight_manifest(file_name: str) -> dict:
    """
    Gets QuickSight manifest.

    :param file_name: The file name which would be imported into QuickSight with the manifest.
    :return: The QuickSight manifest dict.
    """

    return {
        "fileLocations": [
            { "URIs": [f"s3://{OUTPUT_BUCKET}/{CSV_PREFIX}/{file_name}"] }
        ],
        "globalUploadSettings": {
            "format": "CSV",
            "delimiter": ",",
            "textqualifier": "'",
            "containsHeader": "true"
        }
    }


def build_location_line(split_ids: List[str], keys: List[str], delimiter: str) -> str:
    """
    Builds the locations and lines based on the configuration.

    :param split_ids: The split IDs
    :param keys: The locations or lines keys position to join from IDs
    :return: The joined locations or lines
    """

    temp_list = []

    for key in keys:
        if len(split_ids) - 1 >= int(key):
            temp_list.append(split_ids[int(key)])

    return delimiter.join(temp_list)


def main():
    """
    This script creates two CSV files for QuickSight table joining.
    First one contains all information of machines, and the other one contains all configuration of machines.
    """

    # Sets Glue logging
    spark_context = SparkContext()
    glue_context = GlueContext(spark_context)
    logger = glue_context.get_logger()

    # Gets metadata from DynamoDB tables
    logger.info("Gets metadata from DynamoDB tables...")
    metadata = get_medata()
    delimiter = metadata[0]
    location_keys = metadata[1]
    line_keys = metadata[2]

    # Scans all machine information from the UI reference DynamoDB table
    logger.info("Scans all machine information from the UI reference DynamoDB table...")
    ui_reference_scan_items = scan_ui_reference_table()

    # Puts machine information CSV file into the output S3 bucket
    logger.info("Creates machine information CSV file...")
    reference_csv_body = "id,machine_name,location,line"

    split_location_keys = []
    if location_keys:
        split_location_keys = location_keys.split("/")

    split_line_keys = []
    if line_keys:
        split_line_keys = line_keys.split("/")

    for item in ui_reference_scan_items:
        machine_id = item["id"]["S"]
        name = item.get("name", {}).get("S", machine_id)

        split_ids = machine_id.split(delimiter)
        location = build_location_line(split_ids=split_ids, keys=split_location_keys, delimiter=delimiter)
        line = build_location_line(split_ids=split_ids, keys=split_line_keys, delimiter=delimiter)
        reference_csv_body += f"\n'{machine_id}','{name}','{location}','{line}'"

    logger.info("Puts machine information CSV file into the output S3 bucket...")
    put_object_to_s3_bucket(
        body=str.encode(reference_csv_body),
        key=f"{CSV_PREFIX}/{MACHINE_INFORMATION_CSV}"
    )

    # Puts the machine information QuickSight manifest into the output S3 bucket
    logger.info("Puts the machine information QuickSight manifest into the output S3 bucket...")
    machine_information_manifest = get_quicksight_manifest(file_name=MACHINE_INFORMATION_CSV)
    put_object_to_s3_bucket(
        body=str.encode(json.dumps(machine_information_manifest)),
        key=f"{MANIFEST_PREFIX}/{MACHINE_INFORMATION_MANIFEST}"
    )

    # Scans all machine config information from the config DynamoDB table
    logger.info("Scans all machine config information from the config DynamoDB table...")
    config_scan_items = scan_config_table()

    # Puts machine config information CSV file into the output S3 bucket
    logger.info("Creates machine config information CSV file...")
    config_csv_body = "id,status_tag,down_value"
    for item in config_scan_items:
        machine_id = item["id"]["S"]
        status_tag = item.get("machineStatusTagName", {}).get("S", "")
        down_value = item.get("machineStatusDownValue", {}).get("S", "")
        split_down_values = down_value.split(",")

        for val in split_down_values:
            config_csv_body += f"\n'{machine_id}','{status_tag}','{val.strip()}'"

    logger.info("Puts machine config information CSV file into the output S3 bucket...")
    put_object_to_s3_bucket(
        body=str.encode(config_csv_body),
        key=f"{CSV_PREFIX}/{MACHINE_CONFIG_INFORMATION_CSV}"
    )

    # Puts the machine config information QuickSight manifest into the output S3 bucket
    logger.info("Puts the machine config information QuickSight manifest into the output S3 bucket...")
    machine_config_information_manifest = get_quicksight_manifest(file_name=MACHINE_CONFIG_INFORMATION_CSV)
    put_object_to_s3_bucket(
        body=str.encode(json.dumps(machine_config_information_manifest)),
        key=f"{MANIFEST_PREFIX}/{MACHINE_CONFIG_INFORMATION_MANIFEST}"
    )

    logger.info("All done")


if __name__ == "__main__":
    main()