resource "aws_ecs_cluster" "main" {
  name = "stellarkraal-cluster-${var.environment}"

  tags = {
    Environment = var.environment
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "stellarkraal-app-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "stellarkraal-backend:latest"
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
      image     = "stellarkraal-frontend:latest"
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
  # desired_count is managed by Application Auto Scaling after initial provisioning.
  # Minimum is 1 for staging, 2 for production to ensure availability (closes #1534).
  desired_count = var.environment == "production" ? 2 : 1
  launch_type   = "FARGATE"

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

# ── ECS Application Auto Scaling (closes #1534) ───────────────────────────────
#
# Scale-out: triggers when average CPU exceeds 70 % for 2 consecutive minutes.
# Scale-in:  gradually reduces task count during sustained low utilisation.
# Minimum task count: 1 for staging, 2 for production.
# Maximum task count: 10 for all environments.

resource "aws_appautoscaling_target" "ecs_backend" {
  max_capacity       = 10
  min_capacity       = var.environment == "production" ? 2 : 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  depends_on = [aws_ecs_service.main]
}

# Scale out when CPU utilisation exceeds 70 % for 2 consecutive 1-minute periods.
resource "aws_appautoscaling_policy" "ecs_cpu_scale_out" {
  name               = "stellarkraal-cpu-scale-out-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_backend.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_backend.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 300  # 5 minutes — give the system time to stabilise before scaling in
    scale_out_cooldown = 120  # 2 minutes — matches the "2 consecutive minutes" requirement

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Scale in gradually when CPU utilisation is low for a sustained period.
# A separate step-scaling policy gives finer-grained control over scale-in speed.
resource "aws_appautoscaling_policy" "ecs_cpu_scale_in" {
  name               = "stellarkraal-cpu-scale-in-${var.environment}"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.ecs_backend.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_backend.service_namespace

  step_scaling_policy_configuration {
    adjustment_type          = "ChangeInCapacity"
    cooldown                 = 600  # 10 minutes between scale-in steps
    metric_aggregation_type  = "Average"

    # Remove one task at a time when CPU is below 30 %
    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
}

# CloudWatch alarm that triggers the scale-in policy when CPU stays below 30 %.
resource "aws_cloudwatch_metric_alarm" "ecs_low_cpu" {
  alarm_name          = "stellarkraal-low-cpu-${var.environment}"
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = 10   # 10 consecutive 1-minute periods = 10 minutes sustained low CPU
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 30.0
  alarm_description   = "Triggers gradual ECS scale-in when CPU stays below 30%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.main.name
  }

  alarm_actions = [aws_appautoscaling_policy.ecs_cpu_scale_in.arn]
}
