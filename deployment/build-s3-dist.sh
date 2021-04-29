#!/bin/bash
#
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned
#
# This script should be run from the repo's deployment directory
# cd deployment
# ./build-s3-dist.sh source-bucket-base-name solution-name version-code template-bucket-name tempate-account-id quicksight-namespace
#
# Paramenters:
#  - source-bucket-base-name: Name for the S3 bucket location where the template will source the Lambda
#    code from. The template will append '-[region_name]' to this bucket name.
#    For example: ./build-s3-dist.sh solutions my-solution v1.0.0
#    The template will then expect the source code to be located in the solutions-[region_name] bucket
#  - solution-name: name of the solution for consistency
#  - version-code: version of the package
#  - template-bucket-name: Name for the S3 bucket location where the template will source the Lambda
#  - template-account-id: the AWS account ID which contains the QuickSight template
#  - quicksight-namespace: namespace of the QuickSight

# Check to see if input has been provided:
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ] || [ -z "$5" ] || [ -z "$6" ]; then
    echo "# Please provide all required parameters for the build script"
    echo "For example: ./build-s3-dist.sh solutions solution-name v1.0.0 template-bucket-name tempate-account-id quicksight-namespace"
    exit 1
fi

# Exit immediately if a command exits with a non-zero status.
set -e

# define main directories
template_dir="$PWD"
template_dist_dir="$template_dir/global-s3-assets"
build_dist_dir="$template_dir/regional-s3-assets"
source_dir="$template_dir/../source"
lambda_source_dir="$source_dir/lambda"
cdk_source_dir="$source_dir/cdk-infrastructure"
cdk_output_dir="$cdk_source_dir/cdk.out"
web_ui_dir_name="web-ui"

# clean up old build files
rm -rf $template_dist_dir
mkdir -p $template_dist_dir
rm -rf $build_dist_dir
mkdir -p $build_dist_dir
rm -rf $cdk_output_dir

echo "------------------------------------------------------------------------------"
echo "Synthesize the CDK project into a template"
echo "------------------------------------------------------------------------------"
export SOLUTION_BUCKET_NAME_PLACEHOLDER=$1
export SOLUTION_NAME_PLACEHOLDER=$2
export SOLUTION_VERSION_PLACEHOLDER=$3
export TEMPLATE_ACCOUNT_ID=$5
export QUICKSIGHT_NAMESPACE=$6

cd $cdk_source_dir
npm run clean
npm install
node_modules/aws-cdk/bin/cdk synth --asset-metadata false --path-metadata false > $template_dist_dir/$2.template

echo "------------------------------------------------------------------------------"
echo "Building Lambda Utils"
echo "------------------------------------------------------------------------------"
cd $lambda_source_dir/util
npm run clean
npm install

declare -a lambda_packages=(
  "data-sources"
  "filter-kinesis-stream"
  "solution-helper"
  "update-filter-function"
)

for lambda_package in "${lambda_packages[@]}"
do
  echo "------------------------------------------------------------------------------"
  echo "Building Lambda package: $lambda_package"
  echo "------------------------------------------------------------------------------"
  cd $lambda_source_dir/$lambda_package
  npm run package
  # Check the result of the package step and exit if a failure is identified
  if [ $? -eq 0 ]
  then
    echo "Package for $lambda_package built successfully"
  else
    echo "******************************************************************************"
    echo "Lambda package build FAILED for $lambda_package"
    echo "******************************************************************************"
    exit 1
  fi
  mv dist/package.zip $build_dist_dir/$lambda_package.zip
  rm -rf dist
done

echo "------------------------------------------------------------------------------"
echo "Building Web UI"
echo "------------------------------------------------------------------------------"
cd $source_dir/$web_ui_dir_name
GENERATE_SOURCEMAP=false INLINE_RUNTIME_CHUNK=false npm run clean-build
mkdir $build_dist_dir/$web_ui_dir_name
cp -r ./build/* $build_dist_dir/$web_ui_dir_name/

echo "------------------------------------------------------------------------------"
echo "Generate Web UI manifest file"
echo "------------------------------------------------------------------------------"
cd $build_dist_dir
manifest=(`find $web_ui_dir_name -type f | sed 's|^./||'`)
manifest_json=$(IFS=,;printf "%s" "${manifest[*]}")
echo "[\"$manifest_json\"]" | sed 's/,/","/g' > ./$web_ui_dir_name-manifest.json

echo "------------------------------------------------------------------------------"
echo "Glue jobs scripts"
echo "------------------------------------------------------------------------------"
mkdir -p $build_dist_dir/glue-job-scripts
cp $source_dir/glue-job-scripts/*.py $build_dist_dir/glue-job-scripts/

cd $template_dir
