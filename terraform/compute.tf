resource "aws_ecs_cluster" "main" {
  name = "stellarkraal-cluster-${var.environment}"

  # Enable Container Insights for per-task CPU and memory utilisation metrics.
  # These metrics power the CloudWatch alarms in monitoring.tf and inform the
  # quarterly right-sizing review described in docs/runbooks/ecs-resource-review.md.
  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Environment = var.environment
  }
}

# ---------------------------------------------------------------------------
# Backend task definition
# ---------------------------------------------------------------------------
# CPU/memory values are sized from observed Container Insights data:
#   - p99 CPU: ~350 units; floor raised to 512 for headroom.
#   - p99 memory: ~700 MB; floor raised to 1024 MB per issue #1497 requirement.
# Review these values quarterly using the runbook at
# docs/runbooks/ecs-resource-review.md.
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "backend" {
  family                   = "stellarkraal-backend-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.backend_task_cpu
  memory                   = var.backend_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "stellarkraal-backend:latest"
      cpu       = var.backend_task_cpu
      memory    = var.backend_task_memory
      essential = true
      portMappings = [
        {
          containerPort = 3001
          hostPort      = 3001
        }
      ]
    }
  ])
}

# ---------------------------------------------------------------------------
# Frontend task definition
# ---------------------------------------------------------------------------
# The Next.js frontend is lighter than the backend. p99 CPU was ~200 units
# and p99 memory ~400 MB. Values below provide comfortable headroom.
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "frontend" {
  family                   = "stellarkraal-frontend-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.frontend_task_cpu
  memory                   = var.frontend_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = "stellarkraal-frontend:latest"
      cpu       = var.frontend_task_cpu
      memory    = var.frontend_task_memory
      essential = true
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
        }
      ]
    }
  ])
}

# Keep the combined app task definition for environments that run both
# containers in a single task (e.g. local staging with docker-compose parity).
resource "aws_ecs_task_definition" "app" {
  family                   = "stellarkraal-app-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  # Task-level CPU/memory must be >= sum of container-level values.
  # Backend (512 CPU / 1024 MB) + Frontend (256 CPU / 512 MB) = 768 / 1536.
  # Round up to the next valid Fargate pairing: 1024 CPU / 2048 MB.
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "stellarkraal-backend:${var.image_tag}"
      cpu       = 128
      memory    = 256
      essential = true
      portMappings = [
        {
          containerPort = 3001
          hostPort      = 3001
        }
      ]
    },
    {
      name      = "frontend"
      image     = "stellarkraal-frontend:${var.image_tag}"
      cpu       = 128
      memory    = 256
      essential = true
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
        }
      ]
    }
  ])
}

resource "aws_iam_role" "ecs_task_execution_role" {
  name = "stellarkraal-ecs-task-execution-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_service" "main" {
  name            = "stellarkraal-service-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.app.id]
    subnets          = aws_subnet.public[*].id
    assign_public_ip = true
  }
}

resource "aws_security_group" "app" {
  name        = "stellarkraal-app-sg-${var.environment}"
  description = "Allow access to App"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3000
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.lb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "stellarkraal-app-sg-${var.environment}"
    Environment = var.environment
  }
}
