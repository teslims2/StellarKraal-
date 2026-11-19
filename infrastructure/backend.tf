###############################################################################
# Remote State Backend
#
# NOTE: This file must be bootstrapped ONCE before any other `terraform` command.
# Run: cd infrastructure/bootstrap && terraform apply
# Then update the bucket/table names below to match the bootstrap outputs.
###############################################################################

terraform {
  backend "s3" {
    # ── Replace these with your bootstrap outputs ──────────────────────────────
    bucket         = "stellarkraal-tfstate-prod" # created by bootstrap module
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/stellarkraal-tfstate" # created by bootstrap module
    dynamodb_table = "stellarkraal-tfstate-lock"  # created by bootstrap module

    # Generic key — never include the workspace name here.
    # Terraform automatically resolves the full S3 path as:
    #   env:/<workspace>/stellar-kraal/terraform.tfstate
    # e.g.  env:/staging/stellar-kraal/terraform.tfstate
    #        env:/production/stellar-kraal/terraform.tfstate
    key                  = "stellar-kraal/terraform.tfstate"
    workspace_key_prefix = "env"
  }
}

###############################################################################
# Database Migrations — One-off ECS Task
#
# Runs the application's migration command (e.g. `npm run db:migrate`) as a
# one-off ECS task BEFORE the new service version is deployed. The deployment
# pipeline invokes this task and gates the ECS service update on its exit code,
# so a failed migration aborts the deployment and the service is NOT updated.
#
# Migration history is tracked in the database (the migration tool's own
# history table) and the full migration output is streamed to CloudWatch Logs.
###############################################################################

# ── CloudWatch Log Group for migration output ─────────────────────────────────
resource "aws_cloudwatch_log_group" "db_migration" {
  name              = "/ecs/${var.project_name}-${terraform.workspace}-db-migration"
  retention_in_days = var.log_retention_days

  tags = merge(var.common_tags, {
    Name        = "${var.project_name}-${terraform.workspace}-db-migration-logs"
    Environment = terraform.workspace
    Component   = "db-migration"
  })
}

# ── IAM: Task Execution Role (pull image, write logs) ─────────────────────────
data "aws_iam_policy_document" "db_migration_task_execution_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "db_migration_task_execution" {
  name               = "${var.project_name}-${terraform.workspace}-db-migration-exec"
  assume_role_policy = data.aws_iam_policy_document.db_migration_task_execution_assume_role.json

  tags = merge(var.common_tags, {
    Name        = "${var.project_name}-${terraform.workspace}-db-migration-exec"
    Environment = terraform.workspace
    Component   = "db-migration"
  })
}

resource "aws_iam_role_policy_attachment" "db_migration_task_execution_managed" {
  role       = aws_iam_role.db_migration_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow the execution role to read DB credentials from SSM/Secrets Manager.
data "aws_iam_policy_document" "db_migration_task_execution_secrets" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "ssm:GetParameters",
      "ssm:GetParameter",
      "kms:Decrypt",
    ]
    resources = [
      var.db_credentials_secret_arn,
      var.db_credentials_kms_key_arn,
    ]
  }
}

resource "aws_iam_role_policy" "db_migration_task_execution_secrets" {
  name   = "${var.project_name}-${terraform.workspace}-db-migration-secrets"
  role   = aws_iam_role.db_migration_task_execution.id
  policy = data.aws_iam_policy_document.db_migration_task_execution_secrets.json
}

# ── IAM: Task Role (application-level permissions during migration) ───────────
data "aws_iam_policy_document" "db_migration_task_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "db_migration_task" {
  name               = "${var.project_name}-${terraform.workspace}-db-migration-task"
  assume_role_policy = data.aws_iam_policy_document.db_migration_task_assume_role.json

  tags = merge(var.common_tags, {
    Name        = "${var.project_name}-${terraform.workspace}-db-migration-task"
    Environment = terraform.workspace
    Component   = "db-migration"
  })
}

# ── Security Group for the migration task ─────────────────────────────────────
resource "aws_security_group" "db_migration" {
  name        = "${var.project_name}-${terraform.workspace}-db-migration"
  description = "Security group for one-off database migration ECS tasks"
  vpc_id      = var.vpc_id

  egress {
    description = "Allow outbound to database and AWS APIs"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, {
    Name        = "${var.project_name}-${terraform.workspace}-db-migration"
    Environment = terraform.workspace
    Component   = "db-migration"
  })
}

# Allow the migration task to reach the database.
resource "aws_security_group_rule" "db_migration_to_db" {
  description              = "Allow migration task to reach the database"
  type                     = "ingress"
  from_port                = var.db_port
  to_port                  = var.db_port
  protocol                 = "tcp"
  security_group_id        = var.db_security_group_id
  source_security_group_id = aws_security_group.db_migration.id
}

# ── ECS Task Definition for migrations ────────────────────────────────────────
resource "aws_ecs_task_definition" "db_migration" {
  family                   = "${var.project_name}-${terraform.workspace}-db-migration"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.db_migration_cpu
  memory                   = var.db_migration_memory
  execution_role_arn       = aws_iam_role.db_migration_task_execution.arn
  task_role_arn            = aws_iam_role.db_migration_task.arn

  container_definitions = jsonencode([
    {
      name      = "db-migration"
      image     = var.app_image
      essential = true

      # Override the container command to run migrations instead of the server.
      command = ["sh", "-c", var.db_migration_command]

      # Wire the task to the staging/production database env vars.
      environment = [
        { name = "NODE_ENV", value = terraform.workspace },
        { name = "APP_ENV", value = terraform.workspace },
        { name = "DB_HOST", value = var.db_host },
        { name = "DB_PORT", value = tostring(var.db_port) },
        { name = "DB_NAME", value = var.db_name },
        { name = "DB_SSL", value = tostring(var.db_ssl) },
        # Migration history table used by the migration tool.
        { name = "DB_MIGRATION_TABLE", value = var.db_migration_table },
      ]

      # DB credentials pulled from Secrets Manager at task start.
      secrets = [
        { name = "DB_USER", valueFrom = "${var.db_credentials_secret_arn}:username::" },
        { name = "DB_PASSWORD", valueFrom = "${var.db_credentials_secret_arn}:password::" },
      ]

      # Stream migration output (including migration history) to CloudWatch.
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.db_migration.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "db-migration"
        }
      }
    }
  ])

  tags = merge(var.common_tags, {
    Name        = "${var.project_name}-${terraform.workspace}-db-migration"
    Environment = terraform.workspace
    Component   = "db-migration"
  })
}

# ── Outputs consumed by the deployment pipeline ───────────────────────────────
output "db_migration_task_definition_arn" {
  description = "ARN of the one-off ECS task definition that runs database migrations"
  value       = aws_ecs_task_definition.db_migration.arn
}

output "db_migration_task_definition_family" {
  description = "Family of the database migration task definition"
  value       = aws_ecs_task_definition.db_migration.family
}

output "db_migration_log_group_name" {
  description = "CloudWatch log group that receives migration output and history"
  value       = aws_cloudwatch_log_group.db_migration.name
}

output "db_migration_security_group_id" {
  description = "Security group attached to the database migration task"
  value       = aws_security_group.db_migration.id
}

###############################################################################
# Deployment Pipeline — Pre-deploy Migration Step
#
# The pipeline runs the migration task above and gates the ECS service update
# on its exit code. If the migration task exits non-zero, the pipeline fails
# and the ECS service is NOT updated (no new task definition is deployed).
#
# Rollback procedure (reverting the last migration):
#   1. Identify the last applied migration from the migration history table
#      (also visible in the CloudWatch log group above).
#   2. Run the migration task with the rollback command, e.g.:
#        aws ecs run-task \
#          --cluster <cluster> \
#          --task-definition <db_migration_task_definition_arn> \
#          --launch-type FARGATE \
#          --network 'awsvpcConfiguration={subnets=[...],securityGroups=[<db_migration_security_group_id>]}' \
#          --overrides '{"containerOverrides":[{"name":"db-migration","command":["sh","-c","npm run db:migrate:down"]}]}'
#   3. Verify the migration history table reflects the reverted state.
#   4. Re-deploy the previous application version if needed.
###############################################################################