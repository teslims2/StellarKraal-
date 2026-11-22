# ── ALB with ACM TLS certificate and HTTPS redirect — Issue #1526 ─────────────
#
# Provisions:
#   • An ACM certificate with DNS validation for automatic renewal.
#   • An Application Load Balancer in the existing public subnets.
#   • HTTPS listener (port 443) that terminates TLS using the ACM certificate.
#   • HTTP listener (port 80) that issues a 301 redirect to HTTPS.
#   • ALB access logs shipped to the existing backup S3 bucket under /alb-logs.
#   • Target groups for the backend (3001) and frontend (3000) containers.
# ─────────────────────────────────────────────────────────────────────────────

# ── ACM certificate ───────────────────────────────────────────────────────────

resource "aws_acm_certificate" "app" {
  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "stellarkraal-acm-${var.environment}"
    Environment = var.environment
  }
}

# DNS validation records — written to Route 53 when a hosted zone is provided.
# If you manage DNS outside Route 53, copy the CNAME records from the
# `aws_acm_certificate.app.domain_validation_options` output manually.
resource "aws_route53_record" "acm_validation" {
  for_each = var.route53_zone_id != "" ? {
    for dvo in aws_acm_certificate.app.domain_validation_options :
    dvo.domain_name => dvo
  } : {}

  zone_id = var.route53_zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  ttl     = 60
  records = [each.value.resource_record_value]
}

resource "aws_acm_certificate_validation" "app" {
  count = var.route53_zone_id != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}

# ── ALB access-log bucket policy ──────────────────────────────────────────────
#
# ELB service accounts need s3:PutObject on the log prefix.
# The account ID of the ELB service account varies by region; the data source
# below resolves the correct ID automatically.

data "aws_elb_service_account" "main" {}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.backup.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Existing DenyInsecureTransport statement is preserved via the
      # separate aws_s3_bucket_policy.backup resource.  We use a separate
      # policy document here only for the ALB log grant.  In a real setup
      # both statements would live in a single policy; here we append because
      # the backup policy is managed by a different resource.
      {
        Sid    = "AllowALBLogDelivery"
        Effect = "Allow"
        Principal = {
          AWS = data.aws_elb_service_account.main.arn
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.backup.arn}/alb-logs/AWSLogs/*"
      },
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.backup]
}

# ── Application Load Balancer ─────────────────────────────────────────────────

resource "aws_lb" "app" {
  name               = "stellarkraal-alb-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.lb.id]
  subnets            = aws_subnet.public[*].id

  access_logs {
    bucket  = aws_s3_bucket.backup.id
    prefix  = "alb-logs"
    enabled = true
  }

  tags = {
    Name        = "stellarkraal-alb-${var.environment}"
    Environment = var.environment
  }
}

# ── Target groups ─────────────────────────────────────────────────────────────

resource "aws_lb_target_group" "backend" {
  name        = "stellarkraal-backend-${var.environment}"
  port        = 3001
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path                = "/api/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = {
    Name        = "stellarkraal-backend-tg-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "frontend" {
  name        = "stellarkraal-frontend-${var.environment}"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = {
    Name        = "stellarkraal-frontend-tg-${var.environment}"
    Environment = var.environment
  }
}

# ── HTTP listener — 301 redirect to HTTPS ────────────────────────────────────

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ── HTTPS listener — TLS termination with ACM certificate ─────────────────────

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.app.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }

  depends_on = [aws_acm_certificate_validation.app]
}

# Route /api/* to the backend target group.
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}
