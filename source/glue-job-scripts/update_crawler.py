# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import boto3
import sys
import json

from botocore import config
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from pyspark.context import SparkContext

# System arguments
args_list = ["glue_crawler", "glue_trigger", "user_agent_extra"]
args = getResolvedOptions(sys.argv, args_list) # NOSONAR: python:S4823
GLUE_CRAWLER = args["glue_crawler"]
GLUE_TRIGGER = args["glue_trigger"]
USER_AGENT_EXTRA = args["user_agent_extra"]

# boto3 clients
config = config.Config(**json.loads(USER_AGENT_EXTRA))
glue = boto3.client("glue", config=config)
s3 = boto3.client("s3", config=config)


def update_glue_crawler():
    """
    Updates the Glue crawler so that the crawler can crawler incremental data only.
    """

    glue.update_crawler(
        Name=GLUE_CRAWLER,
        SchemaChangePolicy={
            "UpdateBehavior": "LOG",
            "DeleteBehavior": "LOG"
        },
        RecrawlPolicy={ "RecrawlBehavior": "CRAWL_NEW_FOLDERS_ONLY" }
    )


def stop_trigger():
    """
    Stops the Glue trigger so that the trigger does not run anymore.
    """

    glue.stop_trigger(Name=GLUE_TRIGGER)


def main():
    """
    This script updates Glue crawler once it is completed so the crawler does not crawl whole data again.
    In addition, it stops Glue trigger so that this Glue job won't run again.
    To check if it has been updated, it checks `has_updated` argument and S3 bucket data.
    """

    # Sets Glue logging
    spark_context = SparkContext()
    glue_context = GlueContext(spark_context)
    logger = glue_context.get_logger()

    # Updates the Glue crawler recrawl policy
    logger.info("Updates the Glue crawler recrawl policy...")
    update_glue_crawler()

    # Stops the Glue trigger
    logger.info("Stops the Glue trigger...")
    stop_trigger()

    logger.info("All done")


if __name__ == "__main__":
    main()