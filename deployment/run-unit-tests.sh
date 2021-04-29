#!/bin/bash
#
# This script runs all tests for the root CDK project, as well as any microservices, Lambda functions, or dependency
# source code packages. These include unit tests, integration tests, and snapshot tests.
#
# This script is called by the ../initialize-repo.sh file and the buildspec.yml file. It is important that this script
# be tested and validated to ensure that all available test fixtures are run.
#
# The if/then blocks are for error handling. They will cause the script to stop executing if an error is thrown from the
# node process running the test case(s). Removing them or not using them for additional calls with result in the
# script continuing to execute despite an error being thrown.

[ "$DEBUG" == 'true' ] && set -x
set -e

prepare_jest_coverage_report() {
	local component_name=$1

  if [ ! -d "coverage" ]; then
      echo "ValidationError: Missing required directory coverage after running unit tests"
      exit 129
  fi

	# prepare coverage reports
  rm -fr coverage/lcov-report
  mkdir -p $coverage_reports_top_path/jest
  coverage_report_path=$coverage_reports_top_path/jest/$component_name
  rm -fr $coverage_report_path
  mv coverage $coverage_report_path
}

run_javascript_test() {
  local component_path=$1
	local component_name=$2

  echo "------------------------------------------------------------------------------"
  echo "[Test] Run javascript unit test with coverage for $component_name"
  echo "------------------------------------------------------------------------------"
  echo "cd $component_path"
  cd $component_path

	# install and build for unit testing
  npm run clean
	npm install

  # run unit tests
  npm test

  # prepare coverage reports
	prepare_jest_coverage_report $component_name
}

run_cdk_project_test() {
	local component_path=$1
  local component_name=cdk-infrastructure

	echo "------------------------------------------------------------------------------"
	echo "[Test] $component_name"
	echo "------------------------------------------------------------------------------"
  cd $component_path

	# install and build for unit testing
	npm install

	# run unit tests
	npm test

  # prepare coverage reports
	prepare_jest_coverage_report $component_name
}

# Run unit tests
echo "Running unit tests"

# Get reference for source folder
source_dir="$(cd $PWD/../source; pwd -P)"
coverage_reports_top_path=$source_dir/test/coverage-reports
lambda_source_dir="$source_dir/lambda"

# Test the CDK project
run_cdk_project_test $source_dir/cdk-infrastructure

# Test the attached Lambda function
declare -a lambda_packages=(
  "util"
  "data-sources"
  "filter-kinesis-stream"
  "solution-helper"
  "update-filter-function"
)

for lambda_package in "${lambda_packages[@]}"
do
  run_javascript_test $lambda_source_dir/$lambda_package $lambda_package

  # Check the result of the test and exit if a failure is identified
  if [ $? -eq 0 ]
  then
    echo "Test for $lambda_package passed"
  else
    echo "******************************************************************************"
    echo "Lambda test FAILED for $lambda_package"
    echo "******************************************************************************"
    exit 1
  fi
done
