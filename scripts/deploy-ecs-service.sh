#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?service name required}"
CLUSTER="${CLUSTER:?CLUSTER is required}"
ENV_NAME="${ENV_NAME:?ENV_NAME is required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"
REGISTRY="${REGISTRY:?REGISTRY is required}"

CODE_DEPLOY_SERVICES=(web api ingest workers)

poll_service_rollout() {
  local service_arn="$1"
  local max_attempts=60
  local sleep_seconds=10
  local attempt=1
  local last_event=""

  while [ "${attempt}" -le "${max_attempts}" ]; do
    local service_json
    service_json=$(aws ecs describe-services \
      --cluster "${CLUSTER}" \
      --services "${service_arn}" \
      --output json)

    local progress_line
    progress_line=$(echo "${service_json}" | jq -r '
      .services[0] as $service |
      [
        "desired=\($service.desiredCount // 0)",
        "running=\($service.runningCount // 0)",
        "pending=\($service.pendingCount // 0)",
        "deployments=" + ((
          $service.deployments // []
        ) | map("\(.status // "unknown")/\(.rolloutState // "n/a")@\(.taskDefinition | split("/")[-1])") | join(", "))
      ] | join(" | ")
    ')
    echo "[${SERVICE}] Poll ${attempt}/${max_attempts}: ${progress_line}"

    local newest_event
    newest_event=$(echo "${service_json}" | jq -r '
      .services[0].events[0]? |
      "\(.createdAt // "n/a")|\(.message // "")"
    ')
    if [ -n "${newest_event}" ] && [ "${newest_event}" != "null|null" ] && [ "${newest_event}" != "${last_event}" ]; then
      echo "${service_json}" | jq -r --arg service "${SERVICE}" '
        .services[0].events[0:3][]? |
        "[" + $service + "] Event: " + (.message // "")
      '
      last_event="${newest_event}"
    fi

    local is_stable
    is_stable=$(echo "${service_json}" | jq -r '
      .services[0] as $service |
      ($service.deployments | length == 1) and
      (($service.deployments[0].rolloutState // "") == "COMPLETED") and
      (($service.runningCount // 0) == ($service.desiredCount // 0)) and
      (($service.pendingCount // 0) == 0)
    ')

    if [ "${is_stable}" = "true" ]; then
      echo "[${SERVICE}] Service stabilized successfully"
      return 0
    fi

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      sleep "${sleep_seconds}"
    fi
    attempt=$((attempt + 1))
  done

  echo "[${SERVICE}] Timed out waiting for service to stabilize"
  return 1
}

poll_codedeploy_deployment() {
  local deployment_id="$1"
  local max_attempts=90
  local sleep_seconds=10
  local attempt=1

  while [ "${attempt}" -le "${max_attempts}" ]; do
    local deployment_json
    deployment_json=$(aws deploy get-deployment \
      --deployment-id "${deployment_id}" \
      --output json)

    local status
    status=$(echo "${deployment_json}" | jq -r '.deploymentInfo.status // "unknown"')
    local overview
    overview=$(echo "${deployment_json}" | jq -r '
      .deploymentInfo as $deployment |
      [
        "status=\($deployment.status // "unknown")",
        "ready=\($deployment.deploymentOverview.Ready // 0)",
        "pending=\($deployment.deploymentOverview.Pending // 0)",
        "inProgress=\($deployment.deploymentOverview.InProgress // 0)",
        "failed=\($deployment.deploymentOverview.Failed // 0)"
      ] | join(" | ")
    ')
    echo "[${SERVICE}] CodeDeploy poll ${attempt}/${max_attempts}: ${overview}"

    case "${status}" in
      Succeeded)
        echo "[${SERVICE}] CodeDeploy deployment succeeded"
        return 0
        ;;
      Failed|Stopped)
        echo "[${SERVICE}] CodeDeploy deployment ${status}"
        echo "${deployment_json}" | jq -r --arg service "${SERVICE}" '
          .deploymentInfo.errorInformation? |
          "[" + $service + "] error code=" + (.code // "n/a") + " message=" + (.message // "n/a")
        '
        return 1
        ;;
    esac

    if [ "${attempt}" -lt "${max_attempts}" ]; then
      sleep "${sleep_seconds}"
    fi
    attempt=$((attempt + 1))
  done

  echo "[${SERVICE}] Timed out waiting for CodeDeploy deployment"
  return 1
}

dump_service_debug() {
  local service_arn="$1"

  echo "[${SERVICE}] Final ECS service snapshot:"
  aws ecs describe-services \
    --cluster "${CLUSTER}" \
    --services "${service_arn}" \
    --output json | jq -r --arg service "${SERVICE}" '
      .services[0] as $service |
      "[" + $service + "] desired=\($service.desiredCount // 0) running=\($service.runningCount // 0) pending=\($service.pendingCount // 0)",
      (
        $service.deployments[]? |
        "[" + $service + "] deployment status=\(.status // "unknown") rollout=\(.rolloutState // "n/a") taskDef=\(.taskDefinition | split("/")[-1]) running=\(.runningCount // 0) pending=\(.pendingCount // 0) created=\(.createdAt // "n/a") updated=\(.updatedAt // "n/a")"
      ),
      (
        $service.events[0:10][]? |
        "[" + $service + "] event: \(.createdAt // "n/a") \(.message // "")"
      )
    '

  local stopped_tasks
  stopped_tasks=$(aws ecs list-tasks \
    --cluster "${CLUSTER}" \
    --service-name "latitude-${ENV_NAME}-${SERVICE}" \
    --desired-status STOPPED \
    --output json | jq -r '.taskArns[:5] | join(" ")')

  if [ -n "${stopped_tasks}" ]; then
    echo "[${SERVICE}] Recent stopped tasks:"
    aws ecs describe-tasks \
      --cluster "${CLUSTER}" \
      --tasks ${stopped_tasks} \
      --output json | jq -r --arg service "${SERVICE}" '
        .tasks[]? as $task |
        "[" + $service + "] task=" + ($task.taskArn | split("/")[-1]) +
        " lastStatus=" + ($task.lastStatus // "unknown") +
        " stopCode=" + ($task.stopCode // "n/a") +
        " stoppedReason=" + ($task.stoppedReason // "n/a"),
        (
          $task.containers[]? |
          "[" + $service + "]   container=" + (.name // "unknown") +
          " exitCode=" + ((.exitCode // "n/a") | tostring) +
          " reason=" + (.reason // "n/a")
        )
      '
  else
    echo "[${SERVICE}] No stopped tasks found for debugging"
  fi
}

uses_codedeploy() {
  local candidate
  for candidate in "${CODE_DEPLOY_SERVICES[@]}"; do
    if [ "${candidate}" = "${SERVICE}" ]; then
      return 0
    fi
  done
  return 1
}

echo "::group::Deploy ${SERVICE}"
family="latitude-${ENV_NAME}-${SERVICE}"
image="${REGISTRY}/latitude-${ENV_NAME}-${SERVICE}:${IMAGE_TAG}"
service_arn=$(aws ecs list-services \
  --cluster "${CLUSTER}" \
  --query "serviceArns[?contains(@, 'latitude-${ENV_NAME}-${SERVICE}')]" \
  --output text)
echo "[${SERVICE}] Using service ARN ${service_arn}"

aws ecs register-task-definition \
  --family "${family}" \
  --cli-input-json "$(aws ecs describe-task-definition \
    --task-definition "${family}" \
    --query 'taskDefinition' \
    --output json | jq \
      --arg image "${image}" \
      --arg name "${SERVICE}" '
      .containerDefinitions |= map(if .name == $name then .image = $image else . end) |
      del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)
    ')" > /dev/null

if uses_codedeploy; then
  task_def_arn=$(aws ecs describe-task-definition \
    --task-definition "${family}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

  appspec_content=$(jq -c -n \
    --arg taskDef "${task_def_arn}" \
    --arg containerName "${SERVICE}" \
    --argjson containerPort 8080 \
    '{
      version: "0.0",
      Resources: [{
        TargetService: {
          Type: "AWS::ECS::Service",
          Properties: {
            TaskDefinition: $taskDef,
            LoadBalancerInfo: {
              ContainerName: $containerName,
              ContainerPort: $containerPort
            }
          }
        }
      }]
    }')

  revision_file=$(mktemp)
  jq -n --arg content "${appspec_content}" \
    '{revisionType: "AppSpecContent", appSpecContent: {content: $content}}' > "${revision_file}"

  deployment_id=$(aws deploy create-deployment \
    --application-name "latitude-${ENV_NAME}-codedeploy" \
    --deployment-group-name "latitude-${ENV_NAME}-${SERVICE}" \
    --revision "file://${revision_file}" \
    --query 'deploymentId' \
    --output text)
  rm -f "${revision_file}"

  echo "[${SERVICE}] Started CodeDeploy deployment ${deployment_id} with taskDef=${task_def_arn##*/}"

  if ! poll_codedeploy_deployment "${deployment_id}"; then
    dump_service_debug "${service_arn}"
    echo "::endgroup::"
    exit 1
  fi
else
  update_response=$(aws ecs update-service \
    --cluster "${CLUSTER}" \
    --service "${service_arn}" \
    --task-definition "${family}")
  echo "${update_response}" | jq -r --arg service "${SERVICE}" '
    .service as $serviceData |
    "[" + $service + "] Updated service to taskDef=" + ($serviceData.taskDefinition | split("/")[-1]),
    (
      $serviceData.deployments[]? |
      "[" + $service + "] deployment status=\(.status // "unknown") rollout=\(.rolloutState // "n/a") running=\(.runningCount // 0) pending=\(.pendingCount // 0)"
    )
  '

  if ! poll_service_rollout "${service_arn}"; then
    dump_service_debug "${service_arn}"
    echo "::endgroup::"
    exit 1
  fi
fi

echo "::endgroup::"
