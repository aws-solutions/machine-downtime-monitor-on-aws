# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import sys
import json
import boto3

from botocore import config
from datetime import date, datetime, timedelta
from dateutil import parser
from awsglue.transforms import Map
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.dynamicframe import DynamicFrame
from pyspark.context import SparkContext
from pyspark.sql.functions import col, explode

# System arguments
args_list = ["config_table", "input_bucket", "output_bucket", "user_agent_extra"]
args = getResolvedOptions(sys.argv, args_list) # NOSONAR: python:S4823
CONFIG_TABLE = args["config_table"]
INPUT_BUCKET = args["input_bucket"]
OUTPUT_BUCKET = args["output_bucket"]
USER_AGENT_EXTRA = args["user_agent_extra"]

# boto3 clients
config = config.Config(**json.loads(USER_AGENT_EXTRA))
dynamodb = boto3.client("dynamodb", config=config)
s3 = boto3.client("s3", config=config)

# Partition for S3 data, which is a day before the script running date
PARTITION = (date.today() - timedelta(days=1)).strftime('%Y/%m/%d')

# Global variables
delimiter = ""
message_alias_key_name = ""
messages_key_name = ""
message_quality_key_name = ""
message_timestamp_key_name = ""
message_value_key_name = ""


class ItemNotFoundException(Exception):
    """Item not found exception"""
    pass


class NoNewDataException(Exception):
    """No new data exception"""
    pass


def has_new_s3_data() -> bool:
    """
    Checks if there are new data in the input S3 bucket with the specific partition.

    :return: True if new data exists, False if new data doesn't exist
    """

    response = s3.list_objects_v2(
        Bucket=INPUT_BUCKET,
        Prefix=PARTITION
    )

    return response["KeyCount"] > 0


def get_metadata() -> dict:
    """
    Gets metadata from the config DynamoDB table.

    :return: The metadata
    :raises: `ItemNotFoundException` when the config DynamoDB table does not have an item.
    """

    config_get_response = dynamodb.get_item(
        TableName=CONFIG_TABLE,
        Key={
            "id": { "S": "DEFAULT" },
            "type": { "S": "MESSAGE_FORMAT" }
        }
    )
    config_item = config_get_response.get("Item", {})

    if not config_item:
        raise ItemNotFoundException(f"Item does not exist in {CONFIG_TABLE}.")

    return {
        "Delimiter": config_item["msgFormatDataAliasDelimiter"]["S"],
        "MessagesKeyName": config_item["msgFormatDataMessagesKeyName"]["S"],
        "MessageAliasKeyName": config_item["msgFormatDataMessageAliasKeyName"]["S"],
        "MessageQualityKeyName": config_item["msgFormatDataMessageQualityKeyName"]["S"],
        "MessageTimestampKeyName": config_item["msgFormatDataMessageTimestampKeyName"]["S"],
        "MessageValueKeyName": config_item["msgFormatDataMessageValueKeyName"]["S"]
    }


def convert_data_format(record) -> dict:
    """
    Converts the input data format to the below format.
    {
        "messages": [
            {
                "id": "the data's machine ID",
                "tag": "the tag of the data",
                "timestamp": "the timestamp of the data, all timestamp is converted to %Y/%m/%d %H:%M:%S format",
                "quality": "the quality of the data",
                "value": : "the value of the data, all value is converted to string"
            },
            ...
        ]
    }

    :param record: The record to convert to the new format.
    :return: The JSON object which only contains `messages` which is an array of machine data.
    """

    return_messages = []

    for message in record[messages_key_name]:
        name = message[message_alias_key_name]
        ids = name.split(delimiter)
        tag = ids.pop()

        data = {
            "id": delimiter.join(ids),
            "tag": tag,
            "timestamp": datetime.strftime(parser.parse(message[message_timestamp_key_name]), "%Y/%m/%d %H:%M:%S.%f"),
            "quality": message[message_quality_key_name],
            "value": str(message[message_value_key_name])
        }
        return_messages.append(data)

    return { "messages": return_messages }


def main():
    """
    This script gets JSON data from the input S3 bucket and convert the data to the parquet data.
    As the JSON data can have various format, when converting the JSON data, it changes the data format so Athena can query with the specific data.
    """

    global delimiter, message_alias_key_name, messages_key_name, \
        message_quality_key_name, message_timestamp_key_name, message_value_key_name

    # Sets Glue context and logging
    spark_context = SparkContext()
    glue_context = GlueContext(spark_context)
    job = Job(glue_context)
    logger = glue_context.get_logger()

    # Checks if there are new data in the input S3 bucket
    logger.info(f"Partition: {PARTITION}")
    logger.info("Checks the new data in the input S3 bucket...")
    if has_new_s3_data():
        # Gets the raw JSON data from the input S3 bucket
        logger.info("Gets the raw JSON data from the input S3 bucket...")
        raw_json_data = glue_context.create_dynamic_frame.from_options(
            connection_options={
                "paths": [f"s3://{INPUT_BUCKET}/{PARTITION}/"],
                "recurse": True,
                "groupFiles": "inPartition"
            },
            connection_type="s3",
            format="json",
            transformation_ctx="jsonsource"
        )

        # Gets the metadata from the config DynamoDB table
        logger.info("Gets the metadata from the config DynamoDB table...")
        metadata = get_metadata()
        delimiter = metadata["Delimiter"]
        messages_key_name = metadata["MessagesKeyName"]
        message_alias_key_name = metadata["MessageAliasKeyName"]
        message_quality_key_name = metadata["MessageQualityKeyName"]
        message_timestamp_key_name = metadata["MessageTimestampKeyName"]
        message_value_key_name = metadata["MessageValueKeyName"]
        logger.info(f"delimiter = {delimiter}, message_alias_key_name = {message_alias_key_name}, messages_key_name = {messages_key_name}, message_timestamp_key_name = {message_timestamp_key_name}, message_value_key_name = {message_value_key_name}")

        # Converts the raw data
        logger.info("Converts the raw data...")
        converted_json_data = Map.apply(frame=raw_json_data, f=convert_data_format)

        # Flattens the converted array data to multiple raws
        logger.info ("Flattens the converted array data to multiple raws...")
        exploded_data = converted_json_data.toDF().select(explode(col("messages")).alias("collection")).select("collection.*")
        mapped_data = DynamicFrame.fromDF(exploded_data, glue_context, "mapped_data")

        # Writes the parquet data to the output S3 bucket
        logger.info("Writes the parquet data to the output S3 bucket...")
        glue_context.write_dynamic_frame.from_options(
            connection_options={
                "path": f"s3://{OUTPUT_BUCKET}/{PARTITION}/"
            },
            connection_type="s3",
            format="parquet",
            frame=mapped_data,
            transformation_ctx="parquetoutput"
        )
    else:
        logger.info("There is no new data in the input bucket.")
        raise NoNewDataException(f"No new data for {PARTITION} partition.")

    # Bookmarks the processing
    job.commit()
    logger.info("All done")


if __name__ == "__main__":
    main()